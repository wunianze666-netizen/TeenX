import { describe, expect, it, vi } from "vitest";
import { canonicalPublicScore } from "./advx-arena-score-fixtures.js";
import { preparedScoringCheckpoint, submissionFromCheckpoint } from "./advx-arena-test-fixtures.js";
import { createArenaModelProvider, type ArenaModelProvider } from "../services/advx-arena/model-provider.js";
import { advxArenaRunService } from "../services/advx-arena/run-service.js";
import type { ArenaRunCheckpoint } from "../services/advx-arena/types.js";

describe("ADVX Arena serialized terminal outcomes", () => {
  it("reconciles a checkpoint-first completion after the first DB projection fails", async () => {
    const checkpoint = completedScoreCheckpoint();
    let durable = structuredClone(checkpoint);
    let projectionAttempts = 0;
    let projectedStatus: string | null = null;
    let releaseProjected: (() => void) | undefined;
    const projected = new Promise<void>((resolve) => { releaseProjected = resolve; });
    const repository = {
      createRunIfAbsent: async () => ({ checkpoint, reused: false }),
      writeCheckpoint: async (target: ArenaRunCheckpoint) => { durable = structuredClone(target); },
      updatePublicRunState: async (target: ArenaRunCheckpoint) => {
        if (target.state.status === "completed") {
          projectionAttempts += 1;
          if (projectionAttempts === 1) throw new TypeError("injected DB projection failure");
        }
        if (["completed", "failed", "cancelled"].includes(target.state.status)) {
          projectedStatus = target.state.status;
          releaseProjected?.();
        }
      },
      logRunActivity: async () => undefined,
      loadArchive: async () => Buffer.alloc(0),
      readStandard: async () => checkpoint.standard ?? null,
      writeStandard: async () => undefined,
      createScorecard: async () => "50000000-0000-4000-8000-000000000001",
      listRecoverableCheckpoints: async () => [],
      getCheckpointForCaptain: async () => structuredClone(durable),
    };
    const runtime = advxArenaRunService({} as never, {} as never, {
      repository: repository as never,
      provider: createArenaModelProvider(),
    });

    await runtime.start(submissionFromCheckpoint(checkpoint));
    await projected;
    await runtime.shutdown();

    expect(projectionAttempts).toBe(2);
    expect(projectedStatus).toBe("completed");
    expect(durable.state.status).toBe("completed");
    expect(terminalEvents(durable)).toHaveLength(1);
    expect(durable.events.at(-1)?.event.type).toBe("run_completed");
  });

  it("lets cancellation win when it owns the transition lock before provider failure", async () => {
    let releaseStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { releaseStarted = resolve; });
    let rejectProvider: ((error: Error) => void) | undefined;
    const provider: ArenaModelProvider = {
      available: true,
      official: false,
      contextWindow: 8192,
      unavailableReason: null,
      provenance: { mode: "mock", model: "mock", policy: "deepseek-fixed-v1" },
      call: async () => new Promise<string>((_resolve, reject) => {
        rejectProvider = reject;
        releaseStarted?.();
      }),
    };
    const checkpoint = preparedScoringCheckpoint();
    let durable = structuredClone(checkpoint);
    let releaseAuthoritativeRead: (() => void) | undefined;
    let releaseReadStarted: (() => void) | undefined;
    let authoritativeReads = 0;
    const authoritativeRead = new Promise<void>((resolve) => { releaseAuthoritativeRead = resolve; });
    const readStarted = new Promise<void>((resolve) => { releaseReadStarted = resolve; });
    const repository = {
      createRunIfAbsent: async () => ({ checkpoint, reused: false }),
      writeCheckpoint: async (target: ArenaRunCheckpoint) => { durable = structuredClone(target); },
      updatePublicRunState: async () => undefined,
      logRunActivity: async () => undefined,
      loadArchive: async () => Buffer.alloc(0),
      readStandard: async () => checkpoint.standard ?? null,
      writeStandard: async () => undefined,
      createScorecard: async () => "50000000-0000-4000-8000-000000000001",
      listRecoverableCheckpoints: async () => [],
      getCheckpointForCaptain: async () => {
        authoritativeReads += 1;
        if (authoritativeReads === 1) return structuredClone(durable);
        releaseReadStarted?.();
        await authoritativeRead;
        return structuredClone(durable);
      },
    };
    const runtime = advxArenaRunService({} as never, {} as never, { repository: repository as never, provider });

    await runtime.start(submissionFromCheckpoint(checkpoint));
    await started;
    const cancellation = runtime.cancel(checkpoint);
    await readStarted;
    rejectProvider?.(new TypeError("injected provider failure"));
    releaseAuthoritativeRead?.();
    const result = await cancellation;

    expect(result.status).toBe("cancelled");
    expect(durable.state.status).toBe("cancelled");
    expect(terminalEvents(durable)).toHaveLength(1);
    expect(durable.events.at(-1)?.event.type).toBe("run_cancelled");
  });

  it("reconciles terminal recovery and removes conflicting terminal events", async () => {
    const checkpoint = completedScoreCheckpoint();
    checkpoint.state.status = "completed";
    checkpoint.state.finishedAt = "2026-07-25T00:01:00.000Z";
    checkpoint.state.scoreWorkProductId = "50000000-0000-4000-8000-000000000001";
    checkpoint.events.push(
      {
        id: checkpoint.events.length + 1,
        createdAt: "2026-07-25T00:01:00.000Z",
        event: {
          type: "run_completed",
          runId: checkpoint.runId,
          scoreWorkProductId: checkpoint.state.scoreWorkProductId,
        },
      },
      {
        id: checkpoint.events.length + 2,
        createdAt: "2026-07-25T00:01:01.000Z",
        event: { type: "run_failed", runId: checkpoint.runId, code: "STALE", message: "stale" },
      },
    );
    const writeCheckpoint = vi.fn(async () => undefined);
    const updatePublicRunState = vi.fn(async () => undefined);
    const runtime = advxArenaRunService({} as never, {} as never, {
      repository: {
        listRecoverableCheckpoints: async () => [checkpoint],
        writeCheckpoint,
        updatePublicRunState,
      } as never,
      provider: unavailableProvider(),
    });

    await runtime.recover();

    expect(terminalEvents(checkpoint)).toHaveLength(1);
    expect(checkpoint.events.at(-1)?.event.type).toBe("run_completed");
    expect(writeCheckpoint).toHaveBeenCalledOnce();
    expect(updatePublicRunState).toHaveBeenCalledOnce();
  });
});

function terminalEvents(checkpoint: ArenaRunCheckpoint) {
  return checkpoint.events.filter((item) => ["run_completed", "run_failed", "run_cancelled"].includes(item.event.type));
}

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

function completedScoreCheckpoint(): ArenaRunCheckpoint {
  const checkpoint = preparedScoringCheckpoint();
  const standard = checkpoint.standard;
  if (!standard) throw new TypeError("standard fixture missing");
  checkpoint.dimensionScores = Object.fromEntries(
    standard.criteria.map((criterion) => [criterion.name, zeroScore(criterion)]),
  );
  const score = canonicalPublicScore();
  score.submissionId = checkpoint.submissionId;
  score.challengeVersionId = checkpoint.challengeVersionId;
  score.teamVersionId = checkpoint.teamVersionId;
  score.submissionSha256 = checkpoint.submissionSha256;
  score.official = checkpoint.official;
  checkpoint.score = score;
  return checkpoint;
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
