import type { ArenaModelProvider } from "./model-provider.js";
import type { ArenaProgressEvent, PublicArenaRunState } from "./public-types.js";
import type { ArenaRunCheckpoint } from "./types.js";
import { appendArenaEvent } from "./event-projector.js";

const TERMINAL_EVENT_TYPES = new Set<ArenaProgressEvent["type"]>(["run_completed", "run_failed", "run_cancelled"]);
const TERMINAL_STATUSES = new Set<PublicArenaRunState["status"]>(["completed", "failed", "cancelled"]);

export type ArenaRunOutcome =
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly code: string; readonly message: string }
  | { readonly kind: "interrupted" };

export function isArenaRunTerminal(status: PublicArenaRunState["status"]): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function applyArenaRunOutcome(
  checkpoint: ArenaRunCheckpoint,
  requested: ArenaRunOutcome,
): { readonly event: ArenaProgressEvent; readonly action: string } | null {
  const outcome: ArenaRunOutcome = checkpoint.cancelRequestedAt ? { kind: "cancelled" } : requested;
  checkpoint.state.finishedAt = outcome.kind === "interrupted" ? null : new Date().toISOString();
  switch (outcome.kind) {
    case "cancelled":
      checkpoint.state.status = "cancelled";
      checkpoint.state.failureCode = null;
      checkpoint.state.failureMessage = null;
      return { event: { type: "run_cancelled", runId: checkpoint.runId }, action: "arena.run_cancelled" };
    case "failed":
      checkpoint.state.status = "failed";
      checkpoint.state.failureCode = outcome.code;
      checkpoint.state.failureMessage = outcome.message;
      return {
        event: { type: "run_failed", runId: checkpoint.runId, code: outcome.code, message: outcome.message },
        action: "arena.run_failed",
      };
    case "interrupted":
      checkpoint.state.status = "interrupted";
      checkpoint.state.failureCode = "ARENA_INTERRUPTED";
      checkpoint.state.failureMessage = "评审服务中断，等待从已保存进度恢复";
      return null;
  }
}

export async function recoverArenaCheckpoints(options: {
  readonly checkpoints: ArenaRunCheckpoint[];
  readonly provider: ArenaModelProvider;
  readonly persist: (checkpoint: ArenaRunCheckpoint) => Promise<void>;
  readonly schedule: (checkpoint: ArenaRunCheckpoint) => void;
  readonly finishCancelled: (checkpoint: ArenaRunCheckpoint) => Promise<void>;
}): Promise<void> {
  const scheduledCaptains = new Set<string>();
  for (const checkpoint of options.checkpoints) {
    if (isArenaRunTerminal(checkpoint.state.status)) {
      reconcileTerminalEvent(checkpoint);
      await options.persist(checkpoint);
      continue;
    }
    if (!["queued", "running", "interrupted"].includes(checkpoint.state.status)) continue;
    if (checkpoint.cancelRequestedAt) {
      await options.finishCancelled(checkpoint);
      continue;
    }
    const schedulable = options.provider.available
      && checkpoint.official === options.provider.official
      && !scheduledCaptains.has(checkpoint.captainId);
    if (!schedulable) {
      checkpoint.state.status = "interrupted";
      checkpoint.state.failureCode = "ARENA_INTERRUPTED";
      checkpoint.state.failureMessage = "评审暂时无法恢复，等待可用评审资源";
      checkpoint.state.finishedAt = null;
      await options.persist(checkpoint);
      continue;
    }
    checkpoint.state.status = "queued";
    checkpoint.state.failureCode = null;
    checkpoint.state.failureMessage = null;
    checkpoint.state.finishedAt = null;
    await options.persist(checkpoint);
    scheduledCaptains.add(checkpoint.captainId);
    options.schedule(checkpoint);
  }
}

function reconcileTerminalEvent(checkpoint: ArenaRunCheckpoint): void {
  const expected = terminalEvent(checkpoint);
  if (!expected) return;
  let retained = false;
  checkpoint.events = checkpoint.events.filter((entry) => {
    if (!TERMINAL_EVENT_TYPES.has(entry.event.type)) return true;
    if (!retained && JSON.stringify(entry.event) === JSON.stringify(expected)) {
      retained = true;
      return true;
    }
    return false;
  });
  if (!retained) appendArenaEvent(checkpoint.events, expected);
}

function terminalEvent(checkpoint: ArenaRunCheckpoint): ArenaProgressEvent | null {
  switch (checkpoint.state.status) {
    case "completed":
      return checkpoint.state.scoreWorkProductId
        ? { type: "run_completed", runId: checkpoint.runId, scoreWorkProductId: checkpoint.state.scoreWorkProductId }
        : null;
    case "failed":
      return checkpoint.state.failureCode && checkpoint.state.failureMessage
        ? {
            type: "run_failed",
            runId: checkpoint.runId,
            code: checkpoint.state.failureCode,
            message: checkpoint.state.failureMessage,
          }
        : null;
    case "cancelled":
      return { type: "run_cancelled", runId: checkpoint.runId };
    case "queued":
    case "running":
    case "interrupted":
      return null;
  }
}
