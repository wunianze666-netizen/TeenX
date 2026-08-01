import type { PublicArenaScore } from "./public-types.js";
import { projectArenaScore } from "./public-projector.js";
import { validateCheckpointArenaScore } from "./checkpoint-score-validator.js";
import { EvaluationContractError } from "./scoring-contract.js";
import type { ArenaRunCheckpoint } from "./types.js";

export type ArenaScorecardMetadata = Record<string, unknown> & {
  arenaScore: PublicArenaScore;
  challengeVersionId: string;
  teamVersionId: string;
  submissionSha256: string;
  rubricVersion: PublicArenaScore["rubricVersion"];
  official: boolean;
  challengeDigest: string;
};

export function buildArenaScorecardMetadata(
  checkpoint: ArenaRunCheckpoint,
  score: PublicArenaScore,
): ArenaScorecardMetadata {
  if (!checkpoint.challengeDigest || !/^[a-f0-9]{64}$/.test(checkpoint.challengeDigest)) {
    throw new EvaluationContractError("赛题内容摘要无效");
  }
  return {
    arenaScore: projectArenaScore(validateCheckpointArenaScore({ ...checkpoint, score })),
    challengeVersionId: checkpoint.challengeVersionId,
    teamVersionId: checkpoint.teamVersionId,
    submissionSha256: checkpoint.submissionSha256,
    rubricVersion: score.rubricVersion,
    official: score.official,
    challengeDigest: checkpoint.challengeDigest,
  };
}
