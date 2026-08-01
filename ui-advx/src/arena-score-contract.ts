import type {
  PublicArenaDimensionScore,
  PublicArenaEvidence,
  PublicArenaScore,
  PublicArenaSubScore,
} from "./api";

const DIMENSIONS = [
  { name: "需求符合度", maxScore: 200 },
  { name: "规则遵循", maxScore: 150 },
  { name: "代码/实现质量", maxScore: 150 },
  { name: "创新性", maxScore: 150 },
  { name: "趣味性/体验感", maxScore: 100 },
  { name: "视觉/审美", maxScore: 100 },
  { name: "问题解决能力", maxScore: 100 },
  { name: "完成度与细节", maxScore: 50 },
] as const;

type ScoreParseResult =
  | { readonly ok: true; readonly score: PublicArenaScore }
  | { readonly ok: false; readonly issue: string };

type ParsedDimension =
  | { readonly ok: true; readonly dimension: PublicArenaDimensionScore }
  | { readonly ok: false; readonly issue: string };

type DimensionContext = {
  readonly value: unknown;
  readonly index: number;
  readonly expected: (typeof DIMENSIONS)[number];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerBetween(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
}

function readText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readTextArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  return value;
}

function readEvidence(value: unknown): PublicArenaEvidence | null {
  if (!isRecord(value)) return null;
  const path = readText(value.path);
  const quote = readText(value.quote);
  if (
    !path
    || !quote
    || !Number.isInteger(value.lineStart)
    || !Number.isInteger(value.lineEnd)
    || typeof value.lineStart !== "number"
    || typeof value.lineEnd !== "number"
    || value.lineStart < 1
    || value.lineEnd < value.lineStart
    || value.verified !== true
  ) return null;
  return { path, quote, lineStart: value.lineStart, lineEnd: value.lineEnd, verified: true };
}

function readSubScore(value: unknown, maximum: number): PublicArenaSubScore | null {
  if (!isRecord(value)) return null;
  const name = readText(value.name);
  const comment = readText(value.comment);
  const evidenceWarnings = readTextArray(value.evidenceWarnings);
  if (
    !name
    || comment === null
    || !isIntegerBetween(value.score, maximum)
    || !isIntegerBetween(value.maxScore, maximum)
    || value.maxScore < 2
    || (value.anchor !== "zero" && value.anchor !== "partial" && value.anchor !== "full")
    || (value.confidence !== "high" && value.confidence !== "medium" && value.confidence !== "low")
    || (value.verification !== "source_verified" && value.verification !== "static_inference" && value.verification !== "not_verifiable")
    || !Array.isArray(value.evidence)
    || evidenceWarnings === null
  ) return null;
  const evidence = value.evidence.map(readEvidence);
  if (evidence.some((item) => item === null)) return null;
  const verifiedEvidence = evidence.filter((item): item is PublicArenaEvidence => item !== null);
  if (value.anchor === "zero" && value.score !== 0) return null;
  if (value.anchor === "full" && value.score !== value.maxScore) return null;
  if (value.anchor === "partial" && (value.score <= 0 || value.score >= value.maxScore)) return null;
  if (value.score > 0 && (value.verification === "not_verifiable" || verifiedEvidence.length === 0)) return null;
  return {
    name,
    comment,
    score: value.score,
    maxScore: value.maxScore,
    anchor: value.anchor,
    confidence: value.confidence,
    verification: value.verification,
    evidence: verifiedEvidence,
    evidenceWarnings,
  };
}

function readDimension(context: DimensionContext): ParsedDimension {
  const { value, index, expected } = context;
  if (!isRecord(value)) return { ok: false, issue: `第 ${index + 1} 个维度不是对象。` };
  if (value.name !== expected.name || value.maxScore !== expected.maxScore) {
    return { ok: false, issue: `第 ${index + 1} 个维度必须是“${expected.name}”且满分为 ${expected.maxScore}。` };
  }
  if (!isIntegerBetween(value.score, expected.maxScore) || typeof value.comment !== "string") {
    return { ok: false, issue: `“${expected.name}”的维度分数无效。` };
  }
  if (!Array.isArray(value.subScores) || value.subScores.length === 0) {
    return { ok: false, issue: `“${expected.name}”缺少子项评分。` };
  }
  const subScores = value.subScores.map((item) => readSubScore(item, expected.maxScore));
  if (subScores.some((item) => item === null)) {
    return { ok: false, issue: `“${expected.name}”包含无效子项评分。` };
  }
  const validSubScores = subScores.filter((item): item is PublicArenaSubScore => item !== null);
  const subScoreTotal = validSubScores.reduce((sum, item) => sum + item.score, 0);
  const subMaximumTotal = validSubScores.reduce((sum, item) => sum + item.maxScore, 0);
  if (subScoreTotal !== value.score || subMaximumTotal !== expected.maxScore) {
    return { ok: false, issue: `“${expected.name}”的子项算术与维度分数不一致。` };
  }
  if (!isRecord(value.review)) return { ok: false, issue: `“${expected.name}”缺少复核结果。` };
  const { primaryScore, independentScore, delta, adjudicated } = value.review;
  if (
    !isIntegerBetween(primaryScore, expected.maxScore)
    || !isIntegerBetween(independentScore, expected.maxScore)
    || typeof delta !== "number"
    || !Number.isInteger(delta)
    || delta < 0
    || delta !== Math.abs(primaryScore - independentScore)
    || adjudicated !== true
  ) return { ok: false, issue: `“${expected.name}”的复核差值无效。` };
  return {
    ok: true,
    dimension: {
      name: expected.name,
      maxScore: expected.maxScore,
      score: value.score,
      comment: value.comment,
      subScores: validSubScores,
      review: { primaryScore, independentScore, delta, adjudicated: true },
    },
  };
}

export function parsePublicArenaScore(value: unknown): ScoreParseResult {
  if (!isRecord(value)) return { ok: false, issue: "成绩卡不是有效对象。" };
  if (value.rubricVersion !== "arena-rubric-v3" || value.totalMaxScore !== 1000) {
    return { ok: false, issue: "成绩卡评分契约或总分上限无效。" };
  }
  const rawDimensions = value.dimensions;
  if (!Array.isArray(rawDimensions) || rawDimensions.length !== DIMENSIONS.length) {
    return { ok: false, issue: "成绩维度不是完整且有序的八项。" };
  }
  const parsedDimensions = DIMENSIONS.map((expected, index) => readDimension({ value: rawDimensions[index], index, expected }));
  const failed = parsedDimensions.find((result) => !result.ok);
  if (failed && !failed.ok) return failed;
  const dimensions = parsedDimensions.flatMap((result) => result.ok ? [result.dimension] : []);
  const computedTotal = dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  if (!isIntegerBetween(value.totalScore, 1000) || value.totalScore !== computedTotal) {
    return { ok: false, issue: "维度分数之和与总分不一致。" };
  }
  const strengths = readTextArray(value.strengths);
  const weaknesses = readTextArray(value.weaknesses);
  const id = readText(value.id);
  const submissionId = readText(value.submissionId);
  const challengeVersionId = readText(value.challengeVersionId);
  const teamVersionId = readText(value.teamVersionId);
  const submissionSha256 = readText(value.submissionSha256);
  const summary = readText(value.summary);
  const scoredAt = readText(value.scoredAt);
  if (!id || !submissionId || !challengeVersionId || !teamVersionId || !submissionSha256 || summary === null || !scoredAt || strengths === null || weaknesses === null || typeof value.official !== "boolean") {
    return { ok: false, issue: "成绩卡缺少必要的公开字段。" };
  }
  const score = {
    id,
    submissionId,
    challengeVersionId,
    teamVersionId,
    submissionSha256,
    rubricVersion: "arena-rubric-v3",
    official: value.official,
    totalScore: value.totalScore,
    totalMaxScore: 1000,
    summary,
    strengths,
    weaknesses,
    dimensions,
    scoredAt,
  } satisfies PublicArenaScore;
  return {
    ok: true,
    score,
  };
}
