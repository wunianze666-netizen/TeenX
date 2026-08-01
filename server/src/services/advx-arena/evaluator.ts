import { createHash } from "node:crypto";
import { getArenaChallenge } from "../advx-arena-catalog.js";
import type { ArenaProgressEvent, ArenaStage } from "./public-types.js";
import { compileArenaScore } from "./score-compiler.js";
import { scoreArenaDimension } from "./dimension-scorer.js";
import { validatePublicArenaScore } from "./public-score-validator.js";
import {
  EvaluationContractError,
  validateRecoveredDimensionScores,
} from "./scoring-contract.js";
import { isValidArenaStandard, validateArenaStandard } from "./standard-contract.js";
import type { ArenaModelProvider } from "./model-provider.js";
import { analyzeArenaSubmission } from "./submission-analyzer.js";
import { generateArenaStandard } from "./standard-generator.js";
import type { ArenaRunCheckpoint, ArenaStandard } from "./types.js";
import { parseZipBuffer } from "./zip-parser.js";

const MAX_MODEL_CALLS = 64;
const STANDARD_GENERATION_LOCKS = new Map<string, Promise<ArenaStandard>>();

export interface ArenaEvaluatorHooks {
  loadArchive(checkpoint: ArenaRunCheckpoint): Promise<Buffer>;
  readStandard(challengeVersionId: string): Promise<ArenaStandard | null>;
  writeStandard(standard: ArenaStandard): Promise<void>;
  persist(checkpoint: ArenaRunCheckpoint): Promise<void>;
  publish(
    checkpoint: ArenaRunCheckpoint,
    event: ArenaProgressEvent,
    activity?: { action: string; details: Record<string, string> },
  ): Promise<void>;
  createScorecard(checkpoint: ArenaRunCheckpoint): Promise<string>;
  withTerminalLock?<T>(checkpoint: ArenaRunCheckpoint, action: () => Promise<T>): Promise<T>;
}

export async function evaluateArenaRun(input: {
  checkpoint: ArenaRunCheckpoint;
  provider: ArenaModelProvider;
  hooks: ArenaEvaluatorHooks;
  signal: AbortSignal;
}): Promise<void> {
  const { checkpoint, hooks, signal } = input;
  const challenge = getArenaChallenge(checkpoint.challengeVersionId);
  if (!challenge) throw new EvaluationContractError("赛题版本不存在");
  if (checkpoint.challengeDigest !== challenge.contentDigest) throw new EvaluationContractError("赛题内容摘要不一致");
  const provenance = input.provider.provenance;
  if (!provenance) throw new EvaluationContractError("评审模型来源不可用");
  const standardExpectation = {
    challengeVersionId: challenge.challengeVersionId,
    challengeDigest: challenge.contentDigest,
    provenance,
  };
  const standardLockKey = [
    challenge.challengeVersionId,
    challenge.contentDigest,
    provenance.mode,
    provenance.model,
    provenance.policy,
  ].join(":");
  const callModel = async (prompt: string, options: Parameters<ArenaModelProvider["call"]>[1]) => {
    assertNotAborted(signal);
    if (checkpoint.modelCallCount >= MAX_MODEL_CALLS) throw new EvaluationContractError("评审模型调用超过安全上限");
    checkpoint.modelCallCount += 1;
    return input.provider.call(prompt, { ...options, signal });
  };

  if (!checkpoint.parsedSubmission) {
    await beginStage(checkpoint, "challenge", hooks);
    const archive = await hooks.loadArchive(checkpoint);
    const digest = createHash("sha256").update(archive).digest("hex");
    if (digest !== checkpoint.submissionSha256) throw new EvaluationContractError("提交包哈希校验失败");
    checkpoint.parsedSubmission = await parseZipBuffer(archive);
    await completeStage(checkpoint, "challenge", hooks);
  }
  assertNotAborted(signal);

  if (!checkpoint.standard) {
    await beginStage(checkpoint, "standard", hooks);
    const pending = STANDARD_GENERATION_LOCKS.get(standardLockKey);
    if (pending) checkpoint.standard = await pending;
    else {
      const generation = (async () => {
        const cached = await hooks.readStandard(challenge.challengeVersionId);
        if (cached && isValidArenaStandard(cached, standardExpectation)) return cached;
        const standard = await generateArenaStandard(challenge, callModel, provenance, signal);
        await hooks.writeStandard(standard);
        return standard;
      })();
      STANDARD_GENERATION_LOCKS.set(standardLockKey, generation);
      try {
        checkpoint.standard = await generation;
      } finally {
        if (STANDARD_GENERATION_LOCKS.get(standardLockKey) === generation) {
          STANDARD_GENERATION_LOCKS.delete(standardLockKey);
        }
      }
    }
    await completeStage(checkpoint, "standard", hooks);
  }
  validateArenaStandard(checkpoint.standard, standardExpectation);
  validateRecoveredDimensionScores(checkpoint.standard.criteria, checkpoint.dimensionScores);
  if (checkpoint.score) validatePublicArenaScore(checkpoint.score);
  assertNotAborted(signal);

  if (!checkpoint.analysis || !checkpoint.sourceText || !checkpoint.evidenceFiles) {
    await beginStage(checkpoint, "analysis", hooks);
    const result = await analyzeArenaSubmission({
      challenge,
      standard: checkpoint.standard,
      parsed: checkpoint.parsedSubmission,
      modelContextWindow: input.provider.contextWindow,
      callModel,
      signal,
    });
    checkpoint.analysis = result.report;
    checkpoint.sourceText = result.sourceText;
    checkpoint.evidenceFiles = result.evidenceFiles;
    await completeStage(checkpoint, "analysis", hooks);
  }
  assertNotAborted(signal);

  const criteria = checkpoint.standard.criteria;
  if (criteria.some((criterion) => !checkpoint.dimensionScores[criterion.name])) {
    await beginStage(checkpoint, "scoring", hooks);
  }
  for (const [index, criterion] of criteria.entries()) {
    if (checkpoint.dimensionScores[criterion.name]) continue;
    checkpoint.state.stage = "scoring";
    await hooks.publish(checkpoint, {
      type: "dimension",
      name: criterion.name,
      index: index + 1,
      total: 8,
      status: "started",
    });
    const score = await scoreArenaDimension({
      criterion,
      challenge,
      report: checkpoint.analysis,
      sourceText: checkpoint.sourceText,
      evidenceFiles: checkpoint.evidenceFiles,
      modelContextWindow: input.provider.contextWindow,
      callModel,
      signal,
    });
    checkpoint.dimensionScores[criterion.name] = score;
    checkpoint.state.completedDimensions = criteria
      .filter((item) => checkpoint.dimensionScores[item.name])
      .map((item) => item.name);
    await hooks.publish(checkpoint, {
      type: "dimension",
      name: criterion.name,
      index: index + 1,
      total: 8,
      status: "completed",
    }, {
      action: "arena.dimension_completed",
      details: { dimension: criterion.name },
    });
    assertNotAborted(signal);
  }
  if (!hasCompletedStage(checkpoint, "scoring")) await completeStage(checkpoint, "scoring", hooks);

  if (!checkpoint.score) {
    await beginStage(checkpoint, "summary", hooks);
    checkpoint.score = validatePublicArenaScore(await compileArenaScore({
      checkpoint,
      standard: checkpoint.standard,
      report: checkpoint.analysis,
      callModel,
      signal,
    }));
    await hooks.persist(checkpoint);
  }
  const completedScore = checkpoint.score;
  if (!completedScore) throw new EvaluationContractError("评分结果不存在");
  const finalize = async () => {
    if (!hasStartedStage(checkpoint, "summary")) await beginStage(checkpoint, "summary", hooks);
    const workProductId = checkpoint.state.scoreWorkProductId ?? await hooks.createScorecard(checkpoint);
    checkpoint.state.scoreWorkProductId = workProductId;
    if (!hasCompletedStage(checkpoint, "summary")) await completeStage(checkpoint, "summary", hooks);
    if (!checkpoint.events.some((item) => item.event.type === "run_completed")) {
      checkpoint.state.status = "completed";
      checkpoint.state.stage = "summary";
      checkpoint.state.finishedAt = new Date().toISOString();
      await hooks.publish(checkpoint, {
        type: "run_completed",
        runId: checkpoint.runId,
        scoreWorkProductId: workProductId,
      }, {
        action: "arena.scorecard_created",
        details: { scoreId: completedScore.id, status: "completed" },
      });
    } else if (checkpoint.state.status !== "completed") {
      checkpoint.state.status = "completed";
      checkpoint.state.finishedAt ??= new Date().toISOString();
      await hooks.persist(checkpoint);
    }
  };
  if (hooks.withTerminalLock) await hooks.withTerminalLock(checkpoint, finalize);
  else await finalize();
}

async function beginStage(checkpoint: ArenaRunCheckpoint, stage: ArenaStage, hooks: ArenaEvaluatorHooks): Promise<void> {
  checkpoint.state.stage = stage;
  if (!hasStartedStage(checkpoint, stage)) await hooks.publish(checkpoint, { type: "stage", stage, status: "started" });
}

async function completeStage(checkpoint: ArenaRunCheckpoint, stage: ArenaStage, hooks: ArenaEvaluatorHooks): Promise<void> {
  checkpoint.state.stage = stage;
  if (!hasCompletedStage(checkpoint, stage)) {
    await hooks.publish(checkpoint, { type: "stage", stage, status: "completed" }, {
      action: "arena.stage_completed",
      details: { stage },
    });
  } else {
    await hooks.persist(checkpoint);
  }
}

function hasStartedStage(checkpoint: ArenaRunCheckpoint, stage: ArenaStage): boolean {
  return checkpoint.events.some((item) => item.event.type === "stage" && item.event.stage === stage);
}

function hasCompletedStage(checkpoint: ArenaRunCheckpoint, stage: ArenaStage): boolean {
  return checkpoint.events.some((item) => item.event.type === "stage" && item.event.stage === stage && item.event.status === "completed");
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Arena run aborted");
}
