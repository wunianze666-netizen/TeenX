import { getArenaChallenge } from "../advx-arena-catalog.js";
import { ADVX_MODEL } from "../advx-mapper.js";
import {
  TODO_DEMO_CHALLENGE_VERSION_ID,
  TODO_DEMO_SUBMISSION_SHA256,
} from "../advx-demo/fixture.js";
import type { PublicArenaScore } from "./public-types.js";
import { validatePublicArenaScore } from "./public-score-validator.js";
import { EvaluationContractError } from "./scoring-contract.js";
import { ARENA_STANDARD_POLICY, type ArenaRunCheckpoint } from "./types.js";

const MOCK_MODEL = "mock";
const PREPARED_DEMO_MODEL = "demo-deterministic";

export function validateCheckpointArenaScore(checkpoint: ArenaRunCheckpoint): PublicArenaScore {
  const score = checkpoint.score;
  if (!score || typeof score.id !== "string" || !score.id.trim()) {
    throw new EvaluationContractError("评分身份无效");
  }
  validatePublicArenaScore(score);
  const challenge = getArenaChallenge(checkpoint.challengeVersionId);
  const standard = checkpoint.standard;
  const identityMatches = score.submissionId === checkpoint.submissionId
    && score.challengeVersionId === checkpoint.challengeVersionId
    && score.teamVersionId === checkpoint.teamVersionId
    && score.submissionSha256 === checkpoint.submissionSha256
    && score.official === checkpoint.official;
  if (!identityMatches) throw new EvaluationContractError("评分身份与评审进度不一致");
  if (!challenge || checkpoint.challengeDigest !== challenge.contentDigest) {
    throw new EvaluationContractError("评分赛题摘要不一致");
  }
  if (
    !standard
    || standard.challengeVersionId !== checkpoint.challengeVersionId
    || standard.challengeDigest !== challenge.contentDigest
  ) throw new EvaluationContractError("评分赛题来源不一致");
  const provenance = standard.provenance;
  const provenanceMatches = provenance.policy === ARENA_STANDARD_POLICY && (checkpoint.official
    ? provenance.mode === "official" && provenance.model === ADVX_MODEL
    : (provenance.mode === "mock" && provenance.model === MOCK_MODEL)
      || (provenance.mode === "prepared_demo"
        && provenance.model === PREPARED_DEMO_MODEL
        && checkpoint.challengeVersionId === TODO_DEMO_CHALLENGE_VERSION_ID
        && checkpoint.submissionSha256 === TODO_DEMO_SUBMISSION_SHA256));
  if (!provenanceMatches) throw new EvaluationContractError("评分来源与评审模式不一致");
  return score;
}
