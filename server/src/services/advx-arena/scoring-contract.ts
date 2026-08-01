import type { Criterion, CriterionScore, SubCriterion } from "./types.js";

export const TOTAL_MAX_SCORE = 1000;

export const DIMENSION_SKELETON = [
  { name: "需求符合度", maxScore: 200, focus: "逐项覆盖目标中的必做功能，并区分完整实现、部分实现和缺失" },
  { name: "规则遵循", maxScore: 150, focus: "逐条核对显式限制、提交约定和禁止事项，违规必须有证据" },
  { name: "代码/实现质量", maxScore: 150, focus: "正确性、架构、可维护性、测试、可靠性、安全性，以及性能和资源效率" },
  { name: "创新性", maxScore: 150, focus: "识别真正超出基础要求且有价值的原创设计，不把堆叠功能当创新" },
  { name: "趣味性/体验感", maxScore: 100, focus: "可用性、交互反馈、流程连贯性、可访问性和用户吸引力" },
  { name: "视觉/审美", maxScore: 100, focus: "视觉层级、排版、配色、一致性、响应式和输出呈现质量" },
  { name: "问题解决能力", maxScore: 100, focus: "方案是否抓住核心问题、技术取舍是否合理、复杂场景是否处理得当" },
  { name: "完成度与细节", maxScore: 50, focus: "边界状态、错误处理、文档、启动说明、收尾质量和可交付性" },
] as const;

export const DIMENSION_NAMES = DIMENSION_SKELETON.map((dimension) => dimension.name);

export class EvaluationContractError extends Error {
  constructor(message: string, readonly issues: string[] = []) {
    super(issues.length > 0 ? `${message}: ${issues.join("; ")}` : message);
    this.name = "EvaluationContractError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, issues: string[]): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${field} 必须是非空字符串`);
    return "";
  }
  return value.trim();
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new EvaluationContractError("模型回复中没有完整 JSON 对象");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new EvaluationContractError("模型回复不是有效 JSON");
  }
  if (!isRecord(parsed)) throw new EvaluationContractError("模型回复的 JSON 顶层必须是对象");
  return parsed;
}

export function parseAndValidateCriteria(text: string): Criterion[] {
  const parsed = parseJsonObject(text);
  if (!Array.isArray(parsed.criteria)) throw new EvaluationContractError("criteria 必须是数组");
  return validateCriteria(parsed.criteria);
}

export function validateCriteria(rawCriteria: unknown[]): Criterion[] {
  const issues: string[] = [];
  if (rawCriteria.length !== DIMENSION_SKELETON.length) {
    issues.push(`必须恰好有 ${DIMENSION_SKELETON.length} 个维度，实际为 ${rawCriteria.length}`);
  }
  const byName = new Map<string, Record<string, unknown>>();
  for (const [index, item] of rawCriteria.entries()) {
    if (!isRecord(item)) {
      issues.push(`第 ${index + 1} 个维度不是对象`);
      continue;
    }
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) {
      issues.push(`第 ${index + 1} 个维度缺少名称`);
      continue;
    }
    if (byName.has(name)) issues.push(`维度名称重复：${name}`);
    byName.set(name, item);
  }

  const criteria: Criterion[] = [];
  for (const expected of DIMENSION_SKELETON) {
    const item = byName.get(expected.name);
    if (!item) {
      issues.push(`缺少维度：${expected.name}`);
      continue;
    }
    if (item.maxScore !== expected.maxScore) issues.push(`${expected.name}.maxScore 必须为 ${expected.maxScore}`);
    const rubric = requiredText(item.rubric, `${expected.name}.rubric`, issues);
    const rawSubs = item.subCriteria;
    if (!Array.isArray(rawSubs) || rawSubs.length < 3 || rawSubs.length > 6) {
      issues.push(`${expected.name} 必须有 3-6 个子检查点`);
      continue;
    }
    const names = new Set<string>();
    const subCriteria: SubCriterion[] = [];
    for (const [subIndex, rawSub] of rawSubs.entries()) {
      const prefix = `${expected.name}.subCriteria[${subIndex}]`;
      if (!isRecord(rawSub)) {
        issues.push(`${prefix} 不是对象`);
        continue;
      }
      const name = requiredText(rawSub.name, `${prefix}.name`, issues);
      if (names.has(name)) issues.push(`${expected.name} 的子检查点名称重复：${name}`);
      names.add(name);
      const maxScore = rawSub.maxScore;
      if (typeof maxScore !== "number" || !Number.isInteger(maxScore) || maxScore <= 1) {
        issues.push(`${prefix}.maxScore 必须是大于 1 的整数`);
      }
      subCriteria.push({
        name,
        maxScore: typeof maxScore === "number" && Number.isFinite(maxScore) ? maxScore : 0,
        anchor0: requiredText(rawSub.anchor0, `${prefix}.anchor0`, issues),
        anchorPartial: requiredText(rawSub.anchorPartial, `${prefix}.anchorPartial`, issues),
        anchorFull: requiredText(rawSub.anchorFull, `${prefix}.anchorFull`, issues),
      });
    }
    const subTotal = subCriteria.reduce((sum, sub) => sum + sub.maxScore, 0);
    if (subTotal !== expected.maxScore) {
      issues.push(`${expected.name} 子检查点满分之和必须为 ${expected.maxScore}，实际为 ${subTotal}`);
    }
    criteria.push({ name: expected.name, maxScore: expected.maxScore, rubric, subCriteria });
  }
  for (const actualName of byName.keys()) {
    if (!(DIMENSION_NAMES as readonly string[]).includes(actualName)) issues.push(`存在未知维度：${actualName}`);
  }
  if (criteria.reduce((sum, item) => sum + item.maxScore, 0) !== TOTAL_MAX_SCORE) {
    issues.push(`八个维度满分之和必须为 ${TOTAL_MAX_SCORE}`);
  }
  if (issues.length > 0) throw new EvaluationContractError("评判标准不符合契约", issues);
  return criteria;
}

export function isValidCriteria(criteria: Criterion[]): boolean {
  try {
    validateCriteria(criteria);
    return true;
  } catch {
    return false;
  }
}

export function validateRecoveredDimensionScores(
  criteria: Criterion[],
  scores: Record<string, CriterionScore>,
): void {
  const rawScores: unknown = scores;
  if (!isRecord(rawScores)) throw new EvaluationContractError("恢复的维度评分不符合契约", ["维度评分必须是对象"]);
  const recoveredCriteria = criteria.filter((criterion) => scores[criterion.name] !== undefined);
  validateCompleteScores(recoveredCriteria, new Map(Object.entries(scores)));
}

export function validateCompleteScores(
  criteria: Criterion[],
  scores: ReadonlyMap<string, CriterionScore>,
): CriterionScore[] {
  const issues: string[] = [];
  if (scores.size !== criteria.length) issues.push(`必须完成 ${criteria.length} 个维度，实际完成 ${scores.size} 个`);
  const ordered: CriterionScore[] = [];
  for (const criterion of criteria) {
    const score = scores.get(criterion.name);
    if (!score) {
      issues.push(`缺少维度评分：${criterion.name}`);
      continue;
    }
    if (score.criterionName !== criterion.name || score.maxScore !== criterion.maxScore) {
      issues.push(`${criterion.name} 的名称或满分与标准不一致`);
    }
    if (!Array.isArray(score.subScores)) {
      issues.push(`${criterion.name} 的子项必须是数组`);
      ordered.push(score);
      continue;
    }
    if (score.subScores.length !== criterion.subCriteria.length) issues.push(`${criterion.name} 的子项数量不一致`);
    const seen = new Set<string>();
    for (const subScore of score.subScores) {
      if (seen.has(subScore.name)) issues.push(`${criterion.name} 的子项重复：${subScore.name}`);
      seen.add(subScore.name);
    }
    for (const [index, subCriterion] of criterion.subCriteria.entries()) {
      if (score.subScores[index]?.name !== subCriterion.name) {
        issues.push(`${criterion.name} 的第 ${index + 1} 个子项必须为 ${subCriterion.name}`);
      }
      const subScore = score.subScores.find((item) => item.name === subCriterion.name);
      if (!subScore) {
        issues.push(`${criterion.name} 缺少子项评分：${subCriterion.name}`);
        continue;
      }
      if (
        subScore.maxScore !== subCriterion.maxScore
        || !Number.isInteger(subScore.score)
        || subScore.score < 0
        || subScore.score > subCriterion.maxScore
      ) issues.push(`${criterion.name}/${subCriterion.name} 的分数或满分非法`);
      if (subScore.score > 0 && (!Array.isArray(subScore.evidenceRefs) || !subScore.evidenceRefs.some((reference) => reference.verified))) {
        issues.push(`${criterion.name}/${subCriterion.name} 的正分缺少可验证证据`);
      }
    }
    const computed = score.subScores.reduce((sum, item) => sum + item.score, 0);
    if (score.score !== computed || score.score < 0 || score.score > criterion.maxScore) {
      issues.push(`${criterion.name} 的维度得分与子项之和不一致`);
    }
    validateCriterionReview(score, criterion, issues);
    ordered.push(score);
  }
  const total = ordered.reduce((sum, item) => sum + item.score, 0);
  if (total < 0 || total > TOTAL_MAX_SCORE) issues.push(`总分越界：${total}`);
  if (issues.length > 0) throw new EvaluationContractError("评分结果不符合契约", issues);
  return ordered;
}

function validateCriterionReview(score: CriterionScore, criterion: Criterion, issues: string[]): void {
  const review = score.review;
  if (!review) {
    issues.push(`${criterion.name} 的复核结果缺失`);
    return;
  }
  const primaryValid = Number.isInteger(review.primaryScore) && review.primaryScore >= 0 && review.primaryScore <= criterion.maxScore;
  const independentValid = Number.isInteger(review.independentScore)
    && review.independentScore >= 0
    && review.independentScore <= criterion.maxScore;
  if (!primaryValid) issues.push(`${criterion.name}.review.primaryScore 非法`);
  if (!independentValid) issues.push(`${criterion.name}.review.independentScore 非法`);
  if (!Number.isInteger(review.delta) || review.delta < 0) issues.push(`${criterion.name}.review.delta 必须是非负整数`);
  if (review.delta !== Math.abs(review.primaryScore - review.independentScore)) {
    issues.push(`${criterion.name}.review.delta 必须是两次评分差的绝对值`);
  }
  if (review.adjudicated !== true) issues.push(`${criterion.name}.review.adjudicated 必须为 true`);
}
