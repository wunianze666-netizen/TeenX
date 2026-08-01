import type { ArenaChallenge, ArenaCheckpointEvent } from "./types.js";
import type {
  ArenaProgressEvent,
  PublicArenaBoundTeamVersion,
  PublicArenaDimensionScore,
  PublicArenaEvidence,
  PublicArenaRunState,
  PublicArenaScore,
  PublicArenaSubScore,
} from "./public-types.js";

export function projectArenaChallenge(challenge: ArenaChallenge): Omit<ArenaChallenge, "contentDigest"> {
  return {
    id: challenge.id,
    version: challenge.version,
    challengeVersionId: challenge.challengeVersionId,
    title: challenge.title,
    description: challenge.description,
    goal: challenge.goal,
    rules: challenge.rules,
    submitType: challenge.submitType,
    opensAt: challenge.opensAt,
    closesAt: challenge.closesAt,
    status: challenge.status,
  };
}

export function projectBoundTeamVersion(version: PublicArenaBoundTeamVersion): PublicArenaBoundTeamVersion {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    label: version.label,
    teamName: version.teamName,
    createdAt: version.createdAt,
  };
}

export function projectArenaRunState(state: PublicArenaRunState): PublicArenaRunState {
  return {
    runId: state.runId,
    status: state.status,
    stage: state.stage,
    completedDimensions: [...state.completedDimensions],
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    failureCode: state.failureCode,
    failureMessage: state.failureMessage,
    scoreWorkProductId: state.scoreWorkProductId,
  };
}

export function projectArenaScore(score: PublicArenaScore): PublicArenaScore {
  return {
    id: score.id,
    submissionId: score.submissionId,
    challengeVersionId: score.challengeVersionId,
    teamVersionId: score.teamVersionId,
    submissionSha256: score.submissionSha256,
    rubricVersion: score.rubricVersion,
    official: score.official,
    totalScore: score.totalScore,
    totalMaxScore: score.totalMaxScore,
    summary: score.summary,
    strengths: [...score.strengths],
    weaknesses: [...score.weaknesses],
    dimensions: score.dimensions.map(projectDimension),
    scoredAt: score.scoredAt,
  };
}

export function projectArenaCheckpointEvent(item: ArenaCheckpointEvent): ArenaCheckpointEvent {
  return {
    id: item.id,
    createdAt: item.createdAt,
    event: projectArenaProgressEvent(item.event),
  };
}

function projectDimension(dimension: PublicArenaDimensionScore): PublicArenaDimensionScore {
  return {
    name: dimension.name,
    score: dimension.score,
    maxScore: dimension.maxScore,
    comment: dimension.comment,
    subScores: dimension.subScores.map(projectSubScore),
    review: {
      primaryScore: dimension.review.primaryScore,
      independentScore: dimension.review.independentScore,
      delta: dimension.review.delta,
      adjudicated: true,
    },
  };
}

function projectSubScore(subScore: PublicArenaSubScore): PublicArenaSubScore {
  return {
    name: subScore.name,
    score: subScore.score,
    maxScore: subScore.maxScore,
    comment: subScore.comment,
    anchor: subScore.anchor,
    confidence: subScore.confidence,
    verification: subScore.verification,
    evidence: subScore.evidence.map(projectEvidence),
    evidenceWarnings: [...subScore.evidenceWarnings],
  };
}

function projectEvidence(evidence: PublicArenaEvidence): PublicArenaEvidence {
  return {
    path: evidence.path,
    lineStart: evidence.lineStart,
    lineEnd: evidence.lineEnd,
    quote: evidence.quote,
    verified: true,
  };
}

function projectArenaProgressEvent(event: ArenaProgressEvent): ArenaProgressEvent {
  switch (event.type) {
    case "run_started":
      return { type: event.type, runId: event.runId, startedAt: event.startedAt };
    case "stage":
      return { type: event.type, stage: event.stage, status: event.status };
    case "dimension":
      return { type: event.type, name: event.name, index: event.index, total: 8, status: event.status };
    case "run_completed":
      return { type: event.type, runId: event.runId, scoreWorkProductId: event.scoreWorkProductId };
    case "run_failed":
      return { type: event.type, runId: event.runId, code: event.code, message: event.message };
    case "run_cancelled":
      return { type: event.type, runId: event.runId };
    default:
      return assertNever(event);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Arena event: ${JSON.stringify(value)}`);
}
