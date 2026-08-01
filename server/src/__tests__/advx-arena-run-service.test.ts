import { describe, expect, it, vi } from "vitest";
import { createArenaModelProvider, type ArenaModelProvider } from "../services/advx-arena/model-provider.js";
import { canonicalPublicScore } from "./advx-arena-score-fixtures.js";
import { advxArenaRunService } from "../services/advx-arena/run-service.js";
import { readArenaSubmissionState, type ArenaRunCheckpoint, type ArenaStandard } from "../services/advx-arena/types.js";
import {
  blockingProvider,
  createZip,
  preparedScoringCheckpoint,
  recoveryRepository,
  submissionFromCheckpoint,
} from "./advx-arena-test-fixtures.js";

describe("ADVX Arena run lifecycle", () => {
  it("parses a pre-remediation submission with an honest ID-only bound version", () => {
    const state = readArenaSubmissionState({
      arena: {
        schemaVersion: 1,
        challengeVersionId: "todo-web:v1",
        teamVersionId: "v7-pruned",
        attachmentId: "40000000-0000-4000-8000-000000000007",
        artifactSha256: "a".repeat(64),
        originalFilename: "legacy.zip",
        run: null,
      },
    });
    expect(state?.boundTeamVersion).toEqual({
      id: "v7-pruned",
      versionNumber: null,
      label: null,
      teamName: null,
      createdAt: null,
    });
  });

  it("persists cancel intent before aborting an active provider call", async () => {
    let releaseStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { releaseStarted = resolve; });
    let providerAborted = false;
    const provider: ArenaModelProvider = {
      available: true,
      official: false,
      contextWindow: 8192,
      unavailableReason: null,
      provenance: { mode: "mock", model: "mock", policy: "deepseek-fixed-v1" },
      call: async (_prompt, options) => new Promise<string>((_resolve, reject) => {
        releaseStarted?.();
        const abort = () => {
          providerAborted = true;
          reject(options.signal?.reason ?? new Error("aborted"));
        };
        if (options.signal?.aborted) abort();
        else options.signal?.addEventListener("abort", abort, { once: true });
      }),
    };
    const checkpoint = preparedScoringCheckpoint();
    const activities: string[] = [];
    const repository = {
      createRunIfAbsent: async () => ({ checkpoint, reused: false }),
      writeCheckpoint: async () => undefined,
      updatePublicRunState: async () => undefined,
      logRunActivity: async (_checkpoint: ArenaRunCheckpoint, action: string) => { activities.push(action); },
      loadArchive: async () => Buffer.alloc(0),
      readStandard: async () => checkpoint.standard ?? null,
      writeStandard: async () => undefined,
      createScorecard: async () => "50000000-0000-4000-8000-000000000001",
      listRecoverableCheckpoints: async () => [],
      getCheckpointForCaptain: async () => checkpoint,
    };
    const runtime = advxArenaRunService({} as never, {} as never, { repository: repository as never, provider });
    await runtime.start(submissionFromCheckpoint(checkpoint));
    await started;
    const cancelled = await runtime.cancel(checkpoint);
    expect(providerAborted).toBe(true);
    expect(checkpoint.cancelRequestedAt).not.toBeNull();
    expect(cancelled.status).toBe("cancelled");
    expect(checkpoint.events.at(-1)?.event.type).toBe("run_cancelled");
    expect(activities).toContain("arena.run_cancelled");
  });

  it("resumes an interrupted checkpoint with the same run id", async () => {
    const provider = createArenaModelProvider();
    const archive = createZip([{ name: "app.js", content: "const resumeEvidence = true;" }]);
    const checkpoint = preparedScoringCheckpoint();
    checkpoint.runId = "10000000-0000-4000-8000-000000000088";
    checkpoint.state = { ...checkpoint.state, runId: checkpoint.runId, status: "running", startedAt: "2026-07-25T00:00:00.000Z" };
    let standard: ArenaStandard | null = null;
    let releaseCompleted: (() => void) | undefined;
    const completed = new Promise<void>((resolve) => { releaseCompleted = resolve; });
    const repository = {
      listRecoverableCheckpoints: async () => [checkpoint],
      writeCheckpoint: async (target: ArenaRunCheckpoint) => {
        if (target.state.status === "completed") releaseCompleted?.();
      },
      updatePublicRunState: async () => undefined,
      logRunActivity: async () => undefined,
      loadArchive: async () => archive,
      readStandard: async () => standard,
      writeStandard: async (next: ArenaStandard) => { standard = next; },
      createScorecard: async () => "50000000-0000-4000-8000-000000000088",
      getCheckpointForCaptain: async () => checkpoint,
    };
    const runtime = advxArenaRunService({} as never, {} as never, { repository: repository as never, provider });
    await runtime.recover();
    await completed;
    expect(checkpoint.runId).toBe("10000000-0000-4000-8000-000000000088");
    expect(checkpoint.score?.dimensions).toHaveLength(8);
    expect(checkpoint.events.filter((item) => item.event.type === "run_started")).toHaveLength(1);
    await runtime.shutdown();
  }, 30_000);

  it("durably normalizes recovered runs to queued before scheduling", async () => {
    const checkpoint = preparedScoringCheckpoint();
    checkpoint.state.status = "running";
    const persistedStatuses: string[] = [];
    const repository = recoveryRepository([checkpoint], (target) => { persistedStatuses.push(target.state.status); });
    const runtime = advxArenaRunService({} as never, {} as never, {
      repository: repository as never,
      provider: blockingProvider(),
    });
    await runtime.recover();
    expect(persistedStatuses[0]).toBe("queued");
    await runtime.shutdown();
  });

  it("honors persisted cancellation without invoking the provider during recovery", async () => {
    const checkpoint = preparedScoringCheckpoint();
    checkpoint.cancelRequestedAt = "2026-07-25T00:00:00.000Z";
    let providerCalls = 0;
    let releaseCancelled: (() => void) | undefined;
    const cancelled = new Promise<void>((resolve) => { releaseCancelled = resolve; });
    const provider: ArenaModelProvider = {
      available: true,
      official: false,
      contextWindow: 8192,
      unavailableReason: null,
      provenance: { mode: "mock", model: "mock", policy: "deepseek-fixed-v1" },
      call: async () => {
        providerCalls += 1;
        throw new Error("provider must not be called for persisted cancellation");
      },
    };
    const repository = {
      ...recoveryRepository([checkpoint], (target) => {
        if (target.state.status === "cancelled") releaseCancelled?.();
      }),
      getCheckpointForCaptain: async () => checkpoint,
    };
    const runtime = advxArenaRunService({} as never, {} as never, { repository: repository as never, provider });
    await runtime.recover();
    await cancelled;
    expect(providerCalls).toBe(0);
    expect(checkpoint.state.status).toBe("cancelled");
    expect(checkpoint.events.at(-1)?.event.type).toBe("run_cancelled");
  });

  it.each([
    { name: "provider unavailable", available: false, official: false },
    { name: "model mode mismatch", available: true, official: true },
  ])("leaves recovery interrupted when $name", async ({ available, official }) => {
    const checkpoint = preparedScoringCheckpoint();
    checkpoint.state.status = "running";
    const persistedStatuses: string[] = [];
    const provider: ArenaModelProvider = {
      available,
      official,
      contextWindow: 8192,
      unavailableReason: available ? null : "unavailable",
      provenance: official
        ? { mode: "official", model: "deepseek", policy: "deepseek-fixed-v1" }
        : { mode: "mock", model: "mock", policy: "deepseek-fixed-v1" },
      call: async () => { throw new Error("unschedulable recovery must not call provider"); },
    };
    const repository = recoveryRepository([checkpoint], (target) => { persistedStatuses.push(target.state.status); });
    const runtime = advxArenaRunService({} as never, {} as never, { repository: repository as never, provider });
    await runtime.recover();
    expect(checkpoint.state.status).toBe("interrupted");
    expect(persistedStatuses).toEqual(["interrupted"]);
  });

  it("leaves a second same-captain recovery interrupted", async () => {
    const first = preparedScoringCheckpoint();
    first.state.status = "running";
    const second = preparedScoringCheckpoint();
    second.runId = "10000000-0000-4000-8000-000000000010";
    second.submissionId = "20000000-0000-4000-8000-000000000010";
    second.state = { ...second.state, runId: second.runId, status: "running" };
    const persisted = new Map<string, string[]>();
    const repository = recoveryRepository([first, second], (target) => {
      const statuses = persisted.get(target.runId) ?? [];
      statuses.push(target.state.status);
      persisted.set(target.runId, statuses);
    });
    const runtime = advxArenaRunService({} as never, {} as never, {
      repository: repository as never,
      provider: blockingProvider(),
    });
    await runtime.recover();
    expect(persisted.get(first.runId)?.[0]).toBe("queued");
    expect(persisted.get(second.runId)).toEqual(["interrupted"]);
    expect(second.state.status).toBe("interrupted");
    await runtime.shutdown();
  });

  it("reuses a completed submission while the provider is unavailable", async () => {
    const checkpoint = preparedScoringCheckpoint();
    checkpoint.state.status = "completed";
    checkpoint.state.scoreWorkProductId = "50000000-0000-4000-8000-000000000001";
    const submission = submissionFromCheckpoint(checkpoint);
    const createRunIfAbsent = vi.fn();
    const runtime = advxArenaRunService({} as never, {} as never, {
      repository: { createRunIfAbsent } as never,
      provider: unavailableProvider(),
    });

    await expect(runtime.start(submission)).resolves.toEqual({
      runId: checkpoint.runId,
      status: "completed",
      reused: true,
    });
    expect(createRunIfAbsent).not.toHaveBeenCalled();
  });

  it("reloads authoritative terminal state before cancellation", async () => {
    const stale = preparedScoringCheckpoint();
    stale.state.status = "running";
    const authoritative = structuredClone(stale);
    authoritative.state.status = "completed";
    authoritative.state.scoreWorkProductId = "50000000-0000-4000-8000-000000000001";
    const writeCheckpoint = vi.fn();
    const repository = {
      getCheckpointForCaptain: async () => authoritative,
      writeCheckpoint,
      updatePublicRunState: async () => undefined,
      logRunActivity: async () => undefined,
    };
    const runtime = advxArenaRunService({} as never, {} as never, {
      repository: repository as never,
      provider: unavailableProvider(),
    });

    const result = await runtime.cancel(stale);

    expect(result.status).toBe("completed");
    expect(stale.cancelRequestedAt).toBeNull();
    expect(writeCheckpoint).not.toHaveBeenCalled();
  });

  it("keeps durable completion when activity logging fails", async () => {
    const checkpoint = preparedScoringCheckpoint();
    const standard = checkpoint.standard;
    if (!standard) throw new TypeError("standard fixture missing");
    checkpoint.dimensionScores = Object.fromEntries(standard.criteria.map((criterion) => [criterion.name, zeroScore(criterion)]));
    const score = canonicalPublicScore();
    score.submissionId = checkpoint.submissionId;
    score.challengeVersionId = checkpoint.challengeVersionId;
    score.teamVersionId = checkpoint.teamVersionId;
    score.submissionSha256 = checkpoint.submissionSha256;
    score.official = checkpoint.official;
    checkpoint.score = score;
    let releaseTerminal: (() => void) | undefined;
    const terminal = new Promise<void>((resolve) => { releaseTerminal = resolve; });
    const repository = {
      createRunIfAbsent: async () => ({ checkpoint, reused: false }),
      writeCheckpoint: async (target: ArenaRunCheckpoint) => {
        if (["completed", "failed"].includes(target.state.status)) releaseTerminal?.();
      },
      updatePublicRunState: async () => undefined,
      logRunActivity: async () => { throw new TypeError("activity unavailable"); },
      loadArchive: async () => Buffer.alloc(0),
      readStandard: async () => checkpoint.standard ?? null,
      writeStandard: async () => undefined,
      createScorecard: async () => "50000000-0000-4000-8000-000000000001",
      listRecoverableCheckpoints: async () => [],
      getCheckpointForCaptain: async () => checkpoint,
    };
    const runtime = advxArenaRunService({} as never, {} as never, {
      repository: repository as never,
      provider: createArenaModelProvider(),
    });

    await runtime.start(submissionFromCheckpoint(checkpoint));
    await terminal;
    await runtime.shutdown();

    expect(checkpoint.state.status).toBe("completed");
    expect(checkpoint.events.at(-1)?.event.type).toBe("run_completed");
  });

  it("repairs a completed checkpoint missing its terminal event during recovery", async () => {
    const checkpoint = preparedScoringCheckpoint();
    checkpoint.state.status = "completed";
    checkpoint.state.finishedAt = "2026-07-25T00:01:00.000Z";
    checkpoint.state.scoreWorkProductId = "50000000-0000-4000-8000-000000000001";
    const writeCheckpoint = vi.fn(async () => undefined);
    const runtime = advxArenaRunService({} as never, {} as never, {
      repository: {
        listRecoverableCheckpoints: async () => [checkpoint],
        writeCheckpoint,
        updatePublicRunState: async () => undefined,
      } as never,
      provider: unavailableProvider(),
    });

    await runtime.recover();

    expect(checkpoint.events.at(-1)?.event).toEqual({
      type: "run_completed",
      runId: checkpoint.runId,
      scoreWorkProductId: checkpoint.state.scoreWorkProductId,
    });
    expect(writeCheckpoint).toHaveBeenCalledOnce();
  });

});

function unavailableProvider(): ArenaModelProvider {
  return {
    available: false,
    official: false,
    contextWindow: 8192,
    unavailableReason: "test",
    provenance: null,
    call: async () => { throw new TypeError("provider unavailable"); },
  };
}

function zeroScore(criterion: NonNullable<ArenaRunCheckpoint["standard"]>["criteria"][number]) {
  return {
    criterionName: criterion.name,
    score: 0,
    maxScore: criterion.maxScore,
    subScores: criterion.subCriteria.map((subCriterion) => ({
      name: subCriterion.name,
      score: 0,
      maxScore: subCriterion.maxScore,
      comment: "none",
      anchor: "zero" as const,
      confidence: "low" as const,
      verification: "not_verifiable" as const,
      evidenceRefs: [],
      evidenceWarnings: [],
    })),
    comment: "none",
    review: { primaryScore: 0, independentScore: 0, delta: 0, adjudicated: true as const },
  };
}
