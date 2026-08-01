import type { Db } from "@paperclipai/db";
import type { StorageService } from "../../storage/types.js";
import { appendArenaEvent } from "./event-projector.js";
import { evaluateArenaRun } from "./evaluator.js";
import { createKeyedSerialQueue } from "./keyed-serial-queue.js";
import { createArenaModelProvider } from "./model-provider.js";
import type { ArenaCheckpointEvent, ArenaRunCheckpoint, ArenaSubmissionRecord } from "./types.js";
import type { ArenaProgressEvent, PublicArenaRunState } from "./public-types.js";
import { advxArenaRepository } from "./repository.js";
import { ArenaRepositoryError } from "./repository-error.js";
import { projectArenaRunFailure } from "./run-failure.js";
import { applyArenaRunOutcome, isArenaRunTerminal, recoverArenaCheckpoints, type ArenaRunOutcome } from "./run-recovery.js";
import type { ActiveRun, EventListener } from "./run-service-types.js";

const RUN_TIMEOUT_MS = 20 * 60 * 1_000;

export interface AdvxArenaRunServiceOptions {
  repository?: ReturnType<typeof advxArenaRepository>;
  provider?: ReturnType<typeof createArenaModelProvider>;
}

export function advxArenaRunService(db: Db, storage: StorageService, options: AdvxArenaRunServiceOptions = {}) {
  const repository = options.repository ?? advxArenaRepository(db, storage);
  const provider = options.provider ?? createArenaModelProvider();
  const active = new Map<string, ActiveRun>();
  const listeners = new Map<string, Set<EventListener>>();
  const persistQueues = new Map<string, Promise<void>>();
  const withStartLock = createKeyedSerialQueue();
  const withRunTransitionLock = createKeyedSerialQueue();
  let shuttingDown = false;

  function notify(runId: string, event: ArenaCheckpointEvent): void {
    for (const listener of listeners.get(runId) ?? []) listener(event);
  }

  async function persist(checkpoint: ArenaRunCheckpoint): Promise<void> {
    const snapshot = structuredClone(checkpoint);
    const previous = persistQueues.get(checkpoint.runId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      await repository.writeCheckpoint(snapshot);
      await repository.updatePublicRunState(snapshot)
        .catch(() => repository.updatePublicRunState(snapshot));
    });
    persistQueues.set(checkpoint.runId, next);
    try {
      await next;
    } finally {
      if (persistQueues.get(checkpoint.runId) === next) persistQueues.delete(checkpoint.runId);
    }
  }

  async function publish(
    checkpoint: ArenaRunCheckpoint,
    event: ArenaProgressEvent,
    activity?: { action: string; details: Record<string, string> },
  ): Promise<void> {
    const projected = appendArenaEvent(checkpoint.events, event);
    await persist(checkpoint);
    if (activity) await Promise.allSettled([repository.logRunActivity(checkpoint, activity.action, activity.details)]);
    notify(checkpoint.runId, projected);
  }

  async function finishOutcome(checkpoint: ArenaRunCheckpoint, requested: ArenaRunOutcome): Promise<void> {
    await withRunTransitionLock(checkpoint.runId, async () => {
      const authoritative = await repository.getCheckpointForCaptain(checkpoint.runId, checkpoint.captainId);
      if (authoritative && isArenaRunTerminal(authoritative.state.status)) {
        checkpoint.state = structuredClone(authoritative.state);
        checkpoint.events = structuredClone(authoritative.events);
        checkpoint.cancelRequestedAt = authoritative.cancelRequestedAt;
        return;
      }
      if (authoritative?.cancelRequestedAt) checkpoint.cancelRequestedAt = authoritative.cancelRequestedAt;
      const outcome = applyArenaRunOutcome(checkpoint, requested);
      if (!outcome) await persist(checkpoint);
      else await publish(checkpoint, outcome.event, {
        action: outcome.action,
        details: { status: checkpoint.state.status },
      });
    });
  }

  function schedule(checkpoint: ArenaRunCheckpoint): void {
    if (shuttingDown || active.has(checkpoint.runId)) return;
    if (isArenaRunTerminal(checkpoint.state.status)) return;
    if (checkpoint.official !== provider.official) return;

    const controller = new AbortController();
    const entry: ActiveRun = {
      controller,
      checkpoint,
      stopReason: null,
      promise: Promise.resolve(),
      timeout: setTimeout(() => undefined, RUN_TIMEOUT_MS),
    };
    clearTimeout(entry.timeout);
    entry.timeout = setTimeout(() => {
      entry.stopReason = "timeout";
      controller.abort(new Error("Arena run timeout"));
    }, RUN_TIMEOUT_MS);
    active.set(checkpoint.runId, entry);

    entry.promise = (async () => {
      try {
        checkpoint.state.status = "running";
        checkpoint.state.startedAt ??= new Date().toISOString();
        checkpoint.state.finishedAt = null;
        checkpoint.state.failureCode = null;
        checkpoint.state.failureMessage = null;
        const hasStartedEvent = checkpoint.events.some((item) => item.event.type === "run_started");
        if (!hasStartedEvent) {
          await publish(checkpoint, {
            type: "run_started",
            runId: checkpoint.runId,
            startedAt: checkpoint.state.startedAt,
          });
          await Promise.allSettled([repository.logRunActivity(
            checkpoint,
            "arena.run_started",
            { status: "running" },
            { type: "user", id: checkpoint.captainId },
          )]);
        } else {
          await persist(checkpoint);
        }

        await evaluateArenaRun({
          checkpoint,
          provider,
          signal: controller.signal,
          hooks: {
            loadArchive: repository.loadArchive,
            readStandard: repository.readStandard,
            writeStandard: repository.writeStandard,
            persist,
            publish,
            createScorecard: repository.createScorecard,
            withTerminalLock: (_target, action) => withRunTransitionLock(checkpoint.runId, async () => {
              const authoritative = await repository.getCheckpointForCaptain(checkpoint.runId, checkpoint.captainId);
              if (authoritative?.cancelRequestedAt) {
                checkpoint.cancelRequestedAt = authoritative.cancelRequestedAt;
                throw new Error("Arena run cancelled");
              }
              return action();
            }),
          },
        });
      } catch (error) {
        const failure = entry.stopReason === "timeout"
          ? { code: "ARENA_RUN_TIMEOUT", message: "本次评审超过最长时间，已安全停止" }
          : projectArenaRunFailure(error instanceof Error ? error : new Error("Arena evaluation failed"));
        const outcome: ArenaRunOutcome = entry.stopReason === "cancel"
          ? { kind: "cancelled" }
          : entry.stopReason === "shutdown"
            ? { kind: "interrupted" }
            : { kind: "failed", ...failure };
        await finishOutcome(checkpoint, outcome);
      } finally {
        clearTimeout(entry.timeout);
        if (active.get(checkpoint.runId) === entry) active.delete(checkpoint.runId);
      }
    })().then(undefined, async (error) => {
      const failure = projectArenaRunFailure(error instanceof Error ? error : new Error("Arena background failure"));
      await Promise.allSettled([finishOutcome(checkpoint, { kind: "failed", ...failure })]);
    });
  }

  async function finishCancelled(checkpoint: ArenaRunCheckpoint): Promise<void> {
    await finishOutcome(checkpoint, { kind: "cancelled" });
  }

  return {
    repository,

    start: async (submission: ArenaSubmissionRecord): Promise<{ runId: string; status: PublicArenaRunState["status"]; reused: boolean }> => {
      if (submission.run && isArenaRunTerminal(submission.run.status)) {
        return { runId: submission.run.runId, status: submission.run.status, reused: true };
      }
      if (!provider.available) throw new ArenaRepositoryError("ARENA_MODEL_UNAVAILABLE", "评审服务暂时不可用");
      return withStartLock(submission.id, async () => {
        const result = await repository.createRunIfAbsent({ submission, official: provider.official });
        if (
          result.checkpoint.official !== provider.official
          && ["queued", "running", "interrupted"].includes(result.checkpoint.state.status)
        ) throw new ArenaRepositoryError("ARENA_MODEL_MODE_CHANGED", "评审模式已变化，无法恢复本次评审");
        const checkpoint = await withRunTransitionLock(result.checkpoint.runId, async () => {
          const authoritative = await repository.getCheckpointForCaptain(result.checkpoint.runId, result.checkpoint.captainId)
            ?? result.checkpoint;
          if (authoritative.cancelRequestedAt && !isArenaRunTerminal(authoritative.state.status)) {
            authoritative.state.status = "cancelled";
            authoritative.state.failureCode = null;
            authoritative.state.failureMessage = null;
            authoritative.state.finishedAt = new Date().toISOString();
            await publish(authoritative, { type: "run_cancelled", runId: authoritative.runId }, {
              action: "arena.run_cancelled",
              details: { status: "cancelled" },
            });
          } else if (["queued", "interrupted"].includes(authoritative.state.status)) {
            schedule(authoritative);
          }
          return authoritative;
        });
        return {
          runId: checkpoint.runId,
          status: checkpoint.state.status,
          reused: result.reused,
        };
      });
    },

    cancel: async (checkpoint: ArenaRunCheckpoint): Promise<PublicArenaRunState> => {
      const transition = await withRunTransitionLock(checkpoint.runId, async () => {
        const authoritative = await repository.getCheckpointForCaptain(checkpoint.runId, checkpoint.captainId);
        if (!authoritative) throw new ArenaRepositoryError("ARENA_RUN_NOT_FOUND", "评审不存在");
        if (isArenaRunTerminal(authoritative.state.status)) {
          return { target: authoritative, running: undefined };
        }
        const running = active.get(checkpoint.runId);
        const current = running?.checkpoint ?? authoritative;
        current.cancelRequestedAt ??= new Date().toISOString();
        await persist(current);
        if (running) {
          running.stopReason = "cancel";
          running.controller.abort(new Error("Arena run cancelled"));
        }
        return { target: current, running };
      });
      if (transition.running) await transition.running.promise;
      else await finishCancelled(transition.target);
      return transition.target.state;
    },

    recover: async (): Promise<void> => {
      const checkpoints = await repository.listRecoverableCheckpoints();
      await recoverArenaCheckpoints({ checkpoints, provider, persist, schedule, finishCancelled });
    },

    subscribe: (runId: string, listener: EventListener): (() => void) => {
      const runListeners = listeners.get(runId) ?? new Set<EventListener>();
      runListeners.add(listener);
      listeners.set(runId, runListeners);
      return () => {
        runListeners.delete(listener);
        if (runListeners.size === 0) listeners.delete(runId);
      };
    },

    shutdown: async (): Promise<void> => {
      shuttingDown = true;
      const pending = [...active.values()];
      for (const run of pending) {
        run.stopReason = "shutdown";
        run.controller.abort(new Error("Arena service shutdown"));
      }
      await Promise.allSettled(pending.map((run) => run.promise));
    },

    health: () => ({
      enabled: true,
      status: provider.available ? "ok" as const : "warning" as const,
      singleServerOnly: true as const,
      activeRuns: active.size,
      modelAvailable: provider.available,
      mockEnabled: provider.available && !provider.official,
    }),
  };
}
