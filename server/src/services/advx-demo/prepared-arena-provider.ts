import { getArenaChallenge } from "../advx-arena-catalog.js";
import type { ArenaModelProvider } from "../advx-arena/model-provider.js";
import type { PublicArenaDimensionScore, PublicArenaScore } from "../advx-arena/public-types.js";
import type { Criterion } from "../advx-arena/types.js";
import { formatSubmissionForAgentWithCoverage } from "../advx-arena/zip-parser.js";
import {
  TODO_DEMO_CHALLENGE_VERSION_ID,
  TODO_DEMO_SUBMISSION_SHA256,
  loadTodoDemoFixture,
} from "./fixture.js";

const PREPARED_CONTEXT_WINDOW = 128_000;
const PREPARED_MODEL = "demo-deterministic";
const PREPARED_POLICY = "deepseek-fixed-v1";
const PREPARED_CALL_COUNT = 30;

export type PreparedArenaProviderFailure =
  | "duplicate_call"
  | "exhausted"
  | "fixture_identity"
  | "prompt_identity"
  | "repair_path"
  | "unknown_call";

export class PreparedArenaProviderError extends Error {
  readonly name = "PreparedArenaProviderError";

  constructor(readonly reason: PreparedArenaProviderFailure, readonly label: string) {
    super(`Prepared Arena provider rejected ${label}: ${reason}`);
  }
}

export interface PreparedArenaProvider extends ArenaModelProvider {
  readonly binding: {
    readonly profile: "prepared_demo";
    readonly fixtureId: "todo-web-v1-r1";
    readonly revision: "r1";
    readonly challengeVersionId: typeof TODO_DEMO_CHALLENGE_VERSION_ID;
    readonly submissionSha256: typeof TODO_DEMO_SUBMISSION_SHA256;
  };
}

type PromptIdentity = "analysis" | "scoring" | "standard" | "summary";

type PreparedCall = {
  readonly identity: PromptIdentity;
  readonly task: string;
  readonly criterion?: Criterion;
  readonly response: string;
};

export async function createPreparedArenaProvider(): Promise<PreparedArenaProvider> {
  const fixture = await loadTodoDemoFixture();
  const challenge = getArenaChallenge(TODO_DEMO_CHALLENGE_VERSION_ID);
  if (
    !challenge
    || fixture.manifest.fixtureId !== "todo-web-v1-r1"
    || fixture.manifest.revision !== "r1"
    || fixture.manifest.challengeVersionId !== TODO_DEMO_CHALLENGE_VERSION_ID
    || fixture.archiveSha256 !== TODO_DEMO_SUBMISSION_SHA256
  ) throw new PreparedArenaProviderError("fixture_identity", "provider.create");

  const sourceText = formatSubmissionForAgentWithCoverage(
    fixture.parsedSubmission,
    Math.floor(PREPARED_CONTEXT_WINDOW * 0.25),
  ).text;
  const calls = buildPreparedCalls(fixture.score, fixture.standard.criteria);
  if (calls.size !== PREPARED_CALL_COUNT) {
    throw new PreparedArenaProviderError("fixture_identity", "provider.call-count");
  }
  const consumed = new Set<string>();
  const challengeIdentity = [
    `Goal: ${challenge.goal}`,
    `Rules: ${challenge.rules}`,
    `Submit: ${challenge.submitType}`,
  ].join("\n");

  return {
    available: true,
    official: false,
    contextWindow: PREPARED_CONTEXT_WINDOW,
    unavailableReason: null,
    provenance: { mode: "prepared_demo", model: PREPARED_MODEL, policy: PREPARED_POLICY },
    binding: {
      profile: "prepared_demo",
      fixtureId: "todo-web-v1-r1",
      revision: "r1",
      challengeVersionId: TODO_DEMO_CHALLENGE_VERSION_ID,
      submissionSha256: TODO_DEMO_SUBMISSION_SHA256,
    },
    async call(prompt, options) {
      if (options.signal?.aborted) {
        throw options.signal.reason instanceof Error
          ? options.signal.reason
          : new PreparedArenaProviderError("prompt_identity", options.label);
      }
      if (isRepairCall(options.label, prompt)) {
        throw new PreparedArenaProviderError("repair_path", options.label);
      }
      if (consumed.size === calls.size) {
        throw new PreparedArenaProviderError("exhausted", options.label);
      }
      const prepared = calls.get(options.label);
      if (!prepared) throw new PreparedArenaProviderError("unknown_call", options.label);
      if (consumed.has(options.label)) {
        throw new PreparedArenaProviderError("duplicate_call", options.label);
      }
      validatePrompt({
        label: options.label,
        prompt,
        prepared,
        challengeIdentity,
        sourceText,
      });
      consumed.add(options.label);
      return prepared.response;
    },
  };
}

function buildPreparedCalls(score: PublicArenaScore, criteria: readonly Criterion[]): Map<string, PreparedCall> {
  const calls = new Map<string, PreparedCall>();
  calls.set("standard.generate", {
    identity: "standard",
    task: "TASK:GENERATE_STANDARD",
    response: JSON.stringify({ criteria }),
  });
  for (const key of ["requirements", "engineering", "product", "synthesis"] as const) {
    calls.set(`analysis.${key}`, {
      identity: "analysis",
      task: `TASK:ANALYZE_SUBMISSION:${key}`,
      response: buildAnalysisResponse(score, key),
    });
  }
  for (const criterion of criteria) {
    const dimension = score.dimensions.find((candidate) => candidate.name === criterion.name);
    if (!dimension) throw new PreparedArenaProviderError("fixture_identity", `score.${criterion.name}`);
    calls.set(`score.primary.${criterion.name}`, {
      identity: "scoring",
      task: "TASK:SCORE_DIMENSION",
      criterion,
      response: buildDimensionResponse(dimension, dimension.review.primaryScore),
    });
    calls.set(`score.independent.${criterion.name}`, {
      identity: "scoring",
      task: "TASK:INDEPENDENT_DIMENSION",
      criterion,
      response: buildDimensionResponse(dimension, dimension.review.independentScore),
    });
    calls.set(`score.adjudication.${criterion.name}`, {
      identity: "scoring",
      task: "TASK:ADJUDICATE_DIMENSION",
      criterion,
      response: buildDimensionResponse(dimension, dimension.score),
    });
  }
  calls.set("summary.generate", {
    identity: "summary",
    task: "TASK:COMPILE_SUMMARY",
    response: JSON.stringify({
      summary: score.summary,
      strengths: score.strengths,
      weaknesses: score.weaknesses,
    }),
  });
  return calls;
}

function buildAnalysisResponse(score: PublicArenaScore, lens: string): string {
  return JSON.stringify({
    lens,
    dimensions: score.dimensions.map((dimension) => ({
      name: dimension.name,
      comment: dimension.comment,
      findings: dimension.subScores.map((subScore) => subScore.comment),
    })),
    strengths: score.strengths,
    weaknesses: score.weaknesses,
  });
}

function buildDimensionResponse(dimension: PublicArenaDimensionScore, targetScore: number): string {
  const scores = dimension.subScores.map((subScore) => subScore.score);
  let remaining = targetScore - scores.reduce((total, score) => total + score, 0);
  for (const [index, subScore] of dimension.subScores.entries()) {
    if (remaining === 0) break;
    const current = scores[index] ?? 0;
    const adjustment = remaining > 0
      ? Math.min(remaining, subScore.evidence.length > 0 ? subScore.maxScore - current : 0)
      : -Math.min(-remaining, current);
    scores[index] = current + adjustment;
    remaining -= adjustment;
  }
  if (remaining !== 0) throw new PreparedArenaProviderError("fixture_identity", `score.${dimension.name}`);
  return JSON.stringify({
    subScores: dimension.subScores.map((subScore, index) => {
      const score = scores[index] ?? 0;
      return {
        name: subScore.name,
        anchor: score === 0 ? "zero" : score === subScore.maxScore ? "full" : "partial",
        score,
        maxScore: subScore.maxScore,
        verification: subScore.verification,
        confidence: subScore.confidence,
        evidenceRefs: subScore.evidence.map((evidence) => ({
          path: evidence.path,
          lineStart: 0,
          lineEnd: 0,
          quote: evidence.quote,
        })),
        comment: subScore.comment,
      };
    }),
    dimensionComment: dimension.comment,
  });
}

function validatePrompt(input: {
  readonly label: string;
  readonly prompt: string;
  readonly prepared: PreparedCall;
  readonly challengeIdentity: string;
  readonly sourceText: string;
}): void {
  const { label, prompt, prepared, challengeIdentity, sourceText } = input;
  const taskMatches = prompt.startsWith(`${prepared.task}\n`);
  const challengeMatches = prepared.identity === "summary" || prompt.includes(challengeIdentity);
  const sourceMatches = prepared.identity === "standard"
    || prepared.identity === "summary"
    || prompt.includes(`<untrusted_submission>\n${sourceText}\n</untrusted_submission>`);
  const criterionMatches = !prepared.criterion || prompt.includes(
    `<criterion_json>\n${JSON.stringify(prepared.criterion, null, 2)}\n</criterion_json>`,
  );
  const summaryMatches = prepared.identity !== "summary" || prompt.includes("锁定总分: 894/1000");
  if (!taskMatches || !challengeMatches || !sourceMatches || !criterionMatches || !summaryMatches) {
    throw new PreparedArenaProviderError("prompt_identity", label);
  }
}

function isRepairCall(label: string, prompt: string): boolean {
  return label === "standard.repair"
    || label === "summary.repair"
    || label.endsWith(".repair")
    || prompt.startsWith("TASK:REPAIR_");
}
