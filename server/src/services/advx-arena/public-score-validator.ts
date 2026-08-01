import type { PublicArenaScore } from "./public-types.js";
import { DIMENSION_SKELETON, EvaluationContractError, TOTAL_MAX_SCORE } from "./scoring-contract.js";
import { ARENA_RUBRIC_VERSION } from "./types.js";

const SCORE_ANCHORS = new Set(["zero", "partial", "full"]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);
const VERIFICATION_LEVELS = new Set(["source_verified", "static_inference", "not_verifiable"]);

type FieldValidation = {
  readonly maximum: number;
  readonly field: string;
  readonly issues: string[];
};

type SubScoreValidation = FieldValidation & {
  readonly score: number;
};

export function validatePublicArenaScore(score: PublicArenaScore): PublicArenaScore {
  const issues: string[] = [];
  const rawScore: unknown = score;
  if (!isRecord(rawScore)) throw new EvaluationContractError("公开评分不符合契约", ["评分必须是对象"]);
  if (score.rubricVersion !== ARENA_RUBRIC_VERSION) issues.push("rubricVersion 非法");
  if (score.totalMaxScore !== TOTAL_MAX_SCORE) issues.push(`totalMaxScore 必须为 ${TOTAL_MAX_SCORE}`);
  if (!Array.isArray(score.dimensions)) {
    throw new EvaluationContractError("公开评分不符合契约", ["dimensions 必须是数组"]);
  }
  if (score.dimensions.length !== DIMENSION_SKELETON.length) {
    issues.push(`dimensions 必须恰好有 ${DIMENSION_SKELETON.length} 项`);
  }

  let computedTotal = 0;
  for (const [index, expected] of DIMENSION_SKELETON.entries()) {
    const rawDimension: unknown = score.dimensions[index];
    if (!isRecord(rawDimension)) {
      issues.push(`dimensions[${index}] 必须是对象`);
      continue;
    }
    if (rawDimension.name !== expected.name) issues.push(`dimensions[${index}].name 必须为 ${expected.name}`);
    if (rawDimension.maxScore !== expected.maxScore) {
      issues.push(`${expected.name}.maxScore 必须为 ${expected.maxScore}`);
    }
    const dimensionScore = integerScore(rawDimension.score, {
      maximum: expected.maxScore,
      field: `${expected.name}.score`,
      issues,
    });
    computedTotal += dimensionScore;
    validateReview(rawDimension.review, { maximum: expected.maxScore, field: expected.name, issues });

    const rawSubScores = rawDimension.subScores;
    if (!Array.isArray(rawSubScores) || rawSubScores.length === 0) {
      issues.push(`${expected.name}.subScores 必须是非空数组`);
      continue;
    }
    const names = new Set<string>();
    let computedScore = 0;
    let computedMaximum = 0;
    for (const [subIndex, rawSubScore] of rawSubScores.entries()) {
      const prefix = `${expected.name}.subScores[${subIndex}]`;
      if (!isRecord(rawSubScore)) {
        issues.push(`${prefix} 必须是对象`);
        continue;
      }
      const name = typeof rawSubScore.name === "string" ? rawSubScore.name.trim() : "";
      if (!name) issues.push(`${prefix}.name 必须是非空字符串`);
      else if (names.has(name)) issues.push(`${expected.name} 的子项重复：${name}`);
      names.add(name);
      const maximum = positiveInteger(rawSubScore.maxScore, `${prefix}.maxScore`, issues);
      const subScore = integerScore(rawSubScore.score, { maximum, field: `${prefix}.score`, issues });
      computedMaximum += maximum;
      computedScore += subScore;
      validateSubScore(rawSubScore, { field: prefix, score: subScore, maximum, issues });
    }
    if (computedMaximum !== expected.maxScore) issues.push(`${expected.name} 的子项满分之和必须为 ${expected.maxScore}`);
    if (computedScore !== dimensionScore) issues.push(`${expected.name} 的得分必须等于子项得分之和`);
  }

  if (!Number.isInteger(score.totalScore) || score.totalScore < 0 || score.totalScore > TOTAL_MAX_SCORE) {
    issues.push(`totalScore 必须是 0-${TOTAL_MAX_SCORE} 的整数`);
  }
  if (score.totalScore !== computedTotal) issues.push("totalScore 必须等于维度得分之和");
  if (issues.length > 0) throw new EvaluationContractError("公开评分不符合契约", issues);
  return score;
}

function validateReview(rawReview: unknown, validation: FieldValidation): void {
  const { field: dimensionName, maximum, issues } = validation;
  if (!isRecord(rawReview)) {
    issues.push(`${dimensionName}.review 必须是对象`);
    return;
  }
  const primary = integerScore(rawReview.primaryScore, {
    maximum,
    field: `${dimensionName}.review.primaryScore`,
    issues,
  });
  const independent = integerScore(rawReview.independentScore, {
    maximum,
    field: `${dimensionName}.review.independentScore`,
    issues,
  });
  const delta = rawReview.delta;
  if (!Number.isInteger(delta) || (typeof delta === "number" && delta < 0)) {
    issues.push(`${dimensionName}.review.delta 必须是非负整数`);
  }
  if (delta !== Math.abs(primary - independent)) issues.push(`${dimensionName}.review.delta 必须是两次评分差的绝对值`);
  if (rawReview.adjudicated !== true) issues.push(`${dimensionName}.review.adjudicated 必须为 true`);
}

function validateSubScore(
  rawSubScore: Record<string, unknown>,
  validation: SubScoreValidation,
): void {
  const { field: prefix, score, maximum, issues } = validation;
  const anchor = rawSubScore.anchor;
  if (typeof anchor !== "string" || !SCORE_ANCHORS.has(anchor)) issues.push(`${prefix}.anchor 非法`);
  if (anchor === "zero" && score !== 0) issues.push(`${prefix}: zero 只能得 0 分`);
  if (anchor === "full" && score !== maximum) issues.push(`${prefix}: full 必须得满分`);
  if (anchor === "partial" && (score <= 0 || score >= maximum)) issues.push(`${prefix}: partial 分数非法`);
  const confidence = rawSubScore.confidence;
  if (typeof confidence !== "string" || !CONFIDENCE_LEVELS.has(confidence)) issues.push(`${prefix}.confidence 非法`);
  const verification = rawSubScore.verification;
  if (typeof verification !== "string" || !VERIFICATION_LEVELS.has(verification)) issues.push(`${prefix}.verification 非法`);

  const evidence = rawSubScore.evidence;
  if (!Array.isArray(evidence)) {
    issues.push(`${prefix}.evidence 必须是数组`);
    return;
  }
  const verifiedEvidence = evidence.filter((item) => validateEvidence(item, prefix, issues)).length;
  if (score > 0 && (verification === "not_verifiable" || verifiedEvidence === 0)) {
    issues.push(`${prefix} 的正分缺少可验证证据`);
  }
}

function validateEvidence(rawEvidence: unknown, prefix: string, issues: string[]): boolean {
  if (!isRecord(rawEvidence)) {
    issues.push(`${prefix}.evidence 包含非对象项`);
    return false;
  }
  const valid = typeof rawEvidence.path === "string"
    && rawEvidence.path.trim().length > 0
    && Number.isInteger(rawEvidence.lineStart)
    && Number.isInteger(rawEvidence.lineEnd)
    && typeof rawEvidence.lineStart === "number"
    && typeof rawEvidence.lineEnd === "number"
    && rawEvidence.lineStart >= 1
    && rawEvidence.lineEnd >= rawEvidence.lineStart
    && typeof rawEvidence.quote === "string"
    && rawEvidence.quote.trim().length > 0
    && rawEvidence.verified === true;
  if (!valid) issues.push(`${prefix}.evidence 包含无效证据`);
  return valid;
}

function integerScore(value: unknown, validation: FieldValidation): number {
  const { maximum, field, issues } = validation;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) {
    issues.push(`${field} 必须是 0-${maximum} 的整数`);
    return 0;
  }
  return value;
}

function positiveInteger(value: unknown, field: string, issues: string[]): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 1) {
    issues.push(`${field} 必须是大于 1 的整数`);
    return 0;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
