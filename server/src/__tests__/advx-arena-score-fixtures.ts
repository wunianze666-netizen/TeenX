import type { PublicArenaDimensionScore, PublicArenaScore } from "../services/advx-arena/public-types.js";
import { DIMENSION_SKELETON, TOTAL_MAX_SCORE } from "../services/advx-arena/scoring-contract.js";
import { ARENA_RUBRIC_VERSION } from "../services/advx-arena/types.js";

export function canonicalPublicScore(): PublicArenaScore {
  return {
    id: "score-1",
    submissionId: "20000000-0000-4000-8000-000000000001",
    challengeVersionId: "todo-web:v1",
    teamVersionId: "v1-test",
    submissionSha256: "a".repeat(64),
    rubricVersion: ARENA_RUBRIC_VERSION,
    official: false,
    totalScore: 0,
    totalMaxScore: TOTAL_MAX_SCORE,
    summary: "safe",
    strengths: ["safe"],
    weaknesses: [],
    dimensions: DIMENSION_SKELETON.map(zeroDimension),
    scoredAt: "2026-07-25T00:01:00.000Z",
  };
}

function zeroDimension(dimension: (typeof DIMENSION_SKELETON)[number]): PublicArenaDimensionScore {
  return {
    name: dimension.name,
    score: 0,
    maxScore: dimension.maxScore,
    comment: "safe",
    subScores: [{
      name: `${dimension.name}-criterion`,
      score: 0,
      maxScore: dimension.maxScore,
      comment: "safe",
      anchor: "zero",
      confidence: "low",
      verification: "not_verifiable",
      evidence: [],
      evidenceWarnings: [],
    }],
    review: { primaryScore: 0, independentScore: 0, delta: 0, adjudicated: true },
  };
}
