import { afterEach, describe, expect, it, vi } from "vitest";
import { appendArenaEvent } from "../services/advx-arena/event-projector.js";
import { evaluateArenaRun } from "../services/advx-arena/evaluator.js";
import { createArenaModelProvider } from "../services/advx-arena/model-provider.js";
import { DIMENSION_SKELETON, EvaluationContractError } from "../services/advx-arena/scoring-contract.js";
import type { ArenaModelProvider } from "../services/advx-arena/model-provider.js";
import type { ArenaRunCheckpoint, ArenaStandard, Criterion } from "../services/advx-arena/types.js";
import { baseCheckpoint, createZip, preparedScoringCheckpoint } from "./advx-arena-test-fixtures.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("ADVX Arena deterministic evaluator", () => {
  it("fails closed in production without DeepSeek server credentials", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ADVX_ARENA_MODEL_BASE_URL;
    delete process.env.ADVX_ARENA_MODEL_API_KEY;
    const provider = createArenaModelProvider();
    expect(provider.available).toBe(false);
    expect(provider.official).toBe(false);
  });

  it("completes exactly eight dimensions with a non-official Mock score and verified evidence", async () => {
    process.env.NODE_ENV = "test";
    const checkpoint = await runMockEvaluation(createZip([
      { name: "index.html", content: "<main><h1>Todo App</h1></main>" },
      { name: "app.js", content: "const todos = []; function addTodo(text) { todos.push(text); }" },
    ]));
    expect(checkpoint.state.status).toBe("completed");
    expect(checkpoint.score?.official).toBe(false);
    expect(checkpoint.score?.dimensions).toHaveLength(8);
    expect(checkpoint.score?.dimensions.map((dimension) => dimension.name)).toEqual(DIMENSION_SKELETON.map((item) => item.name));
    expect(checkpoint.score?.totalScore).toBe(checkpoint.score?.dimensions.reduce((sum, dimension) => sum + dimension.score, 0));
    expect(checkpoint.score?.totalScore).toBeLessThanOrEqual(1000);
    for (const dimension of checkpoint.score?.dimensions ?? []) {
      expect(dimension.score).toBe(dimension.subScores.reduce((sum, subScore) => sum + subScore.score, 0));
      for (const subScore of dimension.subScores) {
        if (subScore.score > 0) {
          expect(subScore.evidence.length).toBeGreaterThan(0);
          expect(subScore.evidence.every((reference) => reference.verified)).toBe(true);
        }
      }
    }
    expect(checkpoint.events.filter((item) => item.event.type === "dimension" && item.event.status === "completed")).toHaveLength(8);
    expect(checkpoint.events.at(-1)?.event.type).toBe("run_completed");
  }, 30_000);

  it("produces a complete zero score for an empty source submission", async () => {
    process.env.NODE_ENV = "test";
    const checkpoint = await runMockEvaluation(createZip([{ name: "empty.txt", content: " \n" }]));
    expect(checkpoint.score?.totalScore).toBe(0);
    expect(checkpoint.score?.dimensions).toHaveLength(8);
    for (const dimension of checkpoint.score?.dimensions ?? []) {
      for (const subScore of dimension.subScores) {
        expect(subScore.score).toBe(0);
        expect(subScore.anchor).toBe("zero");
        expect(subScore.verification).toBe("not_verifiable");
      }
    }
  }, 30_000);

  it("rejects a malformed recovered standard before continuing evaluation", async () => {
    const checkpoint = preparedScoringCheckpoint();
    const standard = checkpoint.standard;
    if (!standard) throw new TypeError("standard fixture missing");
    standard.criteria.reverse();
    const provider = rejectingProvider();
    await expect(evaluateArenaRun({ checkpoint, provider, hooks: recoveryHooks(), signal: new AbortController().signal }))
      .rejects.toBeInstanceOf(EvaluationContractError);
    expect(provider.call).not.toHaveBeenCalled();
  });

  it("rejects malformed recovered dimension scores before continuing evaluation", async () => {
    const checkpoint = preparedScoringCheckpoint();
    const criterion = checkpoint.standard?.criteria[0];
    if (!criterion) throw new TypeError("criterion fixture missing");
    checkpoint.dimensionScores[criterion.name] = zeroCriterionScore(criterion);
    checkpoint.dimensionScores[criterion.name].score = 1;
    const provider = rejectingProvider();
    await expect(evaluateArenaRun({ checkpoint, provider, hooks: recoveryHooks(), signal: new AbortController().signal }))
      .rejects.toBeInstanceOf(EvaluationContractError);
    expect(provider.call).not.toHaveBeenCalled();
  });

  it("resumes scorecard finalization after a crash persisted the score", async () => {
    process.env.NODE_ENV = "test";
    const checkpoint = await runMockEvaluation(createZip([{ name: "app.js", content: "const durableScore = true;" }]));
    checkpoint.state.status = "running";
    checkpoint.state.finishedAt = null;
    checkpoint.state.scoreWorkProductId = null;
    checkpoint.events = checkpoint.events.filter((item) => item.event.type !== "run_completed");
    const provider = rejectingProvider();
    const createScorecard = vi.fn(async () => "50000000-0000-4000-8000-000000000099");

    await evaluateArenaRun({
      checkpoint,
      provider,
      signal: new AbortController().signal,
      hooks: {
        ...recoveryHooks(),
        createScorecard,
        publish: async (target, event) => { appendArenaEvent(target.events, event); },
      },
    });

    expect(provider.call).not.toHaveBeenCalled();
    expect(createScorecard).toHaveBeenCalledOnce();
    expect(checkpoint.state).toMatchObject({
      status: "completed",
      scoreWorkProductId: "50000000-0000-4000-8000-000000000099",
    });
    expect(checkpoint.events.at(-1)?.event.type).toBe("run_completed");
  });

  it("rejects a Mock-origin standard when resuming an official run", async () => {
    const checkpoint = preparedScoringCheckpoint();
    checkpoint.official = true;
    const provider = rejectingProvider(true);
    await expect(evaluateArenaRun({ checkpoint, provider, hooks: recoveryHooks(), signal: new AbortController().signal }))
      .rejects.toBeInstanceOf(EvaluationContractError);
    expect(provider.call).not.toHaveBeenCalled();
  });

  it("rejects a checkpoint whose challenge content digest no longer matches", async () => {
    const checkpoint = preparedScoringCheckpoint();
    Reflect.set(checkpoint, "challengeDigest", "0".repeat(64));
    const provider = rejectingProvider();
    await expect(evaluateArenaRun({ checkpoint, provider, hooks: recoveryHooks(), signal: new AbortController().signal }))
      .rejects.toBeInstanceOf(EvaluationContractError);
    expect(provider.call).not.toHaveBeenCalled();
  });

  it.each([
    { environment: "production", url: "http://api.example.test", available: false },
    { environment: "development", url: "http://api.example.test", available: false },
    { environment: "development", url: "http://127.0.0.1:9000", available: true },
    { environment: "production", url: "https://api.example.test", available: true },
    { environment: "production", url: "https://api.example.test?target=other", available: false },
    { environment: "production", url: "https://api.example.test#fragment", available: false },
  ])("enforces model transport for $environment $url", ({ environment, url, available }) => {
    process.env.NODE_ENV = environment;
    process.env.ADVX_ARENA_MODEL_BASE_URL = url;
    process.env.ADVX_ARENA_MODEL_API_KEY = "test-only-key";
    expect(createArenaModelProvider().available).toBe(available);
  });
});

function rejectingProvider(official = false): ArenaModelProvider {
  return {
    available: true,
    official,
    contextWindow: 8192,
    unavailableReason: null,
    provenance: official
      ? { mode: "official", model: "deepseek", policy: "deepseek-fixed-v1" }
      : { mode: "mock", model: "mock", policy: "deepseek-fixed-v1" },
    call: vi.fn(async () => { throw new TypeError("model must not be called"); }),
  };
}

function recoveryHooks() {
  return {
    loadArchive: async () => Buffer.alloc(0),
    readStandard: async () => null,
    writeStandard: async () => undefined,
    persist: async () => undefined,
    publish: async () => undefined,
    createScorecard: async () => "50000000-0000-4000-8000-000000000001",
  };
}

function zeroCriterionScore(criterion: Criterion) {
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

async function runMockEvaluation(archive: Buffer): Promise<ArenaRunCheckpoint> {
  const provider = createArenaModelProvider();
  const checkpoint = baseCheckpoint(archive, "10000000-0000-4000-8000-000000000001");
  checkpoint.state.status = "running";
  checkpoint.state.startedAt = "2026-07-25T00:00:00.000Z";
  let standard: ArenaStandard | null = null;
  await evaluateArenaRun({
    checkpoint,
    provider,
    signal: new AbortController().signal,
    hooks: {
      loadArchive: async () => archive,
      readStandard: async () => standard,
      writeStandard: async (next) => { standard = next; },
      persist: async () => undefined,
      publish: async (target, event) => { appendArenaEvent(target.events, event); },
      createScorecard: async () => "50000000-0000-4000-8000-000000000001",
    },
  });
  return checkpoint;
}
