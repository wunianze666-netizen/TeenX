import { randomUUID } from "node:crypto";
import type { PublicArenaScore } from "./public-types.js";
import { EvaluationContractError, parseJsonObject, TOTAL_MAX_SCORE, validateCompleteScores } from "./scoring-contract.js";
import type { ArenaModelCaller } from "./standard-generator.js";
import { ARENA_RUBRIC_VERSION, type AnalysisReport, type ArenaRunCheckpoint, type ArenaStandard, type CriterionScore } from "./types.js";

interface SummaryResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

export async function compileArenaScore(input: {
  checkpoint: ArenaRunCheckpoint;
  standard: ArenaStandard;
  report: AnalysisReport;
  callModel: ArenaModelCaller;
  signal?: AbortSignal;
}): Promise<PublicArenaScore> {
  const scores = new Map(Object.entries(input.checkpoint.dimensionScores));
  const dimensions = validateCompleteScores(input.standard.criteria, scores);
  const totalScore = dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  const prompt = buildSummaryPrompt(totalScore, dimensions, input.report);
  let response = await input.callModel(prompt, { label: "summary.generate", maxTokens: 3500, signal: input.signal });
  let summary: SummaryResult;
  try {
    summary = parseSummary(response, totalScore);
  } catch (error) {
    response = await input.callModel([
      "TASK:REPAIR_SUMMARY",
      "上一份总评未通过格式校验。保持评分事实不变，只修复总评 JSON。",
      `校验错误: ${error instanceof Error ? error.message : "总评无效"}`,
      prompt,
      "<invalid_summary>",
      response.slice(0, 20_000),
      "</invalid_summary>",
    ].join("\n"), { label: "summary.repair", maxTokens: 3500, signal: input.signal });
    summary = parseSummary(response, totalScore);
  }
  return {
    id: randomUUID(),
    submissionId: input.checkpoint.submissionId,
    challengeVersionId: input.checkpoint.challengeVersionId,
    teamVersionId: input.checkpoint.teamVersionId,
    submissionSha256: input.checkpoint.submissionSha256,
    rubricVersion: ARENA_RUBRIC_VERSION,
    official: input.checkpoint.official,
    totalScore,
    totalMaxScore: TOTAL_MAX_SCORE,
    summary: summary.summary,
    strengths: summary.strengths,
    weaknesses: summary.weaknesses,
    dimensions: dimensions.map(toPublicDimension),
    scoredAt: new Date().toISOString(),
  };
}

function toPublicDimension(dimension: CriterionScore): PublicArenaScore["dimensions"][number] {
  return {
    name: dimension.criterionName,
    score: dimension.score,
    maxScore: dimension.maxScore,
    comment: dimension.comment,
    review: dimension.review,
    subScores: dimension.subScores.map((subScore) => ({
      name: subScore.name,
      score: subScore.score,
      maxScore: subScore.maxScore,
      comment: subScore.comment,
      anchor: subScore.anchor,
      confidence: subScore.confidence,
      verification: subScore.verification,
      evidence: subScore.evidenceRefs,
      evidenceWarnings: subScore.evidenceWarnings,
    })),
  };
}

function buildSummaryPrompt(totalScore: number, dimensions: CriterionScore[], report: AnalysisReport): string {
  return [
    "TASK:COMPILE_SUMMARY",
    "分数已由服务端锁定，禁止修改或重算。根据子项证据生成准确、可行动的总评。",
    '{ "summary": "3-5 句总体评价", "strengths": ["2-5 条具体优势"], "weaknesses": ["2-5 条不足或建议"] }',
    `summary 必须包含锁定总分 ${totalScore}/${TOTAL_MAX_SCORE}，并说明静态验证边界。只返回 JSON。`,
    `锁定总分: ${totalScore}/${TOTAL_MAX_SCORE}`,
    "覆盖限制:",
    report.coverage.limitations.map((item) => `- ${item}`).join("\n"),
    "锁定评分:",
    JSON.stringify(dimensions, null, 2),
    "分析摘要:",
    report.analysis,
  ].join("\n");
}

function parseSummary(text: string, totalScore: number): SummaryResult {
  const data = parseJsonObject(text);
  const summary = typeof data.summary === "string" ? data.summary.trim().slice(0, 4_000) : "";
  const strengths = stringArray(data.strengths);
  const weaknesses = stringArray(data.weaknesses);
  const issues: string[] = [];
  if (summary.length < 20) issues.push("summary 过短或缺失");
  if (!new RegExp(`(^|[^\\d])${totalScore}\\s*/\\s*${TOTAL_MAX_SCORE}(?!\\d)`).test(summary)) {
    issues.push(`summary 必须包含锁定总分 ${totalScore}/${TOTAL_MAX_SCORE}`);
  }
  if (strengths.length < 2 || strengths.length > 5) issues.push("strengths 必须有 2-5 条");
  if (weaknesses.length < 2 || weaknesses.length > 5) issues.push("weaknesses 必须有 2-5 条");
  if (issues.length > 0) throw new EvaluationContractError("总评不符合契约", issues);
  return { summary, strengths, weaknesses };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 1_000));
}
