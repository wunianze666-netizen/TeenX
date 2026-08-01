import { DIMENSION_SKELETON, EvaluationContractError, TOTAL_MAX_SCORE, validateCriteria } from "./scoring-contract.js";
import { ARENA_RUBRIC_VERSION, type ArenaStandard, type ArenaStandardProvenance } from "./types.js";

export type ArenaStandardExpectation = {
  readonly challengeVersionId: string;
  readonly challengeDigest: string;
  readonly provenance: ArenaStandardProvenance;
};

export function validateArenaStandard(standard: ArenaStandard, expected: ArenaStandardExpectation): ArenaStandard {
  const issues: string[] = [];
  const rawStandard: unknown = standard;
  if (!rawStandard || typeof rawStandard !== "object" || Array.isArray(rawStandard)) {
    throw new EvaluationContractError("恢复的评判标准不符合契约", ["评判标准必须是对象"]);
  }
  if (standard.challengeVersionId !== expected.challengeVersionId) issues.push("challengeVersionId 与赛题不一致");
  if (standard.challengeDigest !== expected.challengeDigest) issues.push("challengeDigest 与赛题内容不一致");
  if (standard.rubricVersion !== ARENA_RUBRIC_VERSION) issues.push("rubricVersion 非法");
  if (standard.totalMaxScore !== TOTAL_MAX_SCORE) issues.push(`totalMaxScore 必须为 ${TOTAL_MAX_SCORE}`);
  if (
    standard.provenance?.mode !== expected.provenance.mode
    || standard.provenance?.model !== expected.provenance.model
    || standard.provenance?.policy !== expected.provenance.policy
  ) issues.push("评判标准来源与当前评审策略不一致");
  if (!Array.isArray(standard.criteria)) {
    throw new EvaluationContractError("恢复的评判标准不符合契约", ["criteria 必须是数组"]);
  }
  for (const [index, dimension] of DIMENSION_SKELETON.entries()) {
    const criterion = standard.criteria[index];
    if (criterion?.name !== dimension.name) issues.push(`criteria[${index}].name 必须为 ${dimension.name}`);
    if (criterion?.maxScore !== dimension.maxScore) issues.push(`${dimension.name}.maxScore 必须为 ${dimension.maxScore}`);
  }
  try {
    validateCriteria(standard.criteria);
  } catch (error) {
    if (error instanceof EvaluationContractError) issues.push(...error.issues);
    else throw error;
  }
  if (issues.length > 0) throw new EvaluationContractError("恢复的评判标准不符合契约", issues);
  return standard;
}

export function isValidArenaStandard(standard: ArenaStandard, expected: ArenaStandardExpectation): boolean {
  try {
    validateArenaStandard(standard, expected);
    return true;
  } catch {
    return false;
  }
}
