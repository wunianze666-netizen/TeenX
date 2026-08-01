export type ArenaRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type ArenaStage = "challenge" | "standard" | "analysis" | "scoring" | "summary";

export interface PublicArenaBoundTeamVersion {
  id: string;
  versionNumber: number | null;
  label: string | null;
  teamName: string | null;
  createdAt: string | null;
}

export interface PublicArenaRunState {
  runId: string;
  status: ArenaRunStatus;
  stage: ArenaStage | null;
  completedDimensions: string[];
  startedAt: string | null;
  finishedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  scoreWorkProductId: string | null;
}

export type ArenaProgressEvent =
  | { type: "run_started"; runId: string; startedAt: string }
  | { type: "stage"; stage: ArenaStage; status: "started" | "completed" }
  | { type: "dimension"; name: string; index: number; total: 8; status: "started" | "completed" }
  | { type: "run_completed"; runId: string; scoreWorkProductId: string }
  | { type: "run_failed"; runId: string; code: string; message: string }
  | { type: "run_cancelled"; runId: string };

export interface PublicArenaEvidence {
  path: string;
  lineStart: number;
  lineEnd: number;
  quote: string;
  verified: true;
}

export interface PublicArenaSubScore {
  name: string;
  score: number;
  maxScore: number;
  comment: string;
  anchor: "zero" | "partial" | "full";
  confidence: "high" | "medium" | "low";
  verification: "source_verified" | "static_inference" | "not_verifiable";
  evidence: PublicArenaEvidence[];
  evidenceWarnings: string[];
}

export interface PublicArenaDimensionScore {
  name: string;
  score: number;
  maxScore: number;
  comment: string;
  subScores: PublicArenaSubScore[];
  review: {
    primaryScore: number;
    independentScore: number;
    delta: number;
    adjudicated: true;
  };
}

export interface PublicArenaScore {
  id: string;
  submissionId: string;
  challengeVersionId: string;
  teamVersionId: string;
  submissionSha256: string;
  rubricVersion: "arena-rubric-v3";
  official: boolean;
  totalScore: number;
  totalMaxScore: 1000;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  dimensions: PublicArenaDimensionScore[];
  scoredAt: string;
}

export interface PublicArenaSubmission {
  id: string;
  challengeVersionId: string;
  teamVersionId: string;
  boundTeamVersion: PublicArenaBoundTeamVersion;
  filename: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
  autoCreatedTeamVersion: boolean;
  run: PublicArenaRunState | null;
}

export interface PublicArenaRunDetail extends PublicArenaRunState {
  submissionId: string;
  challengeVersionId: string;
  challengeTitle: string;
  teamVersionId: string;
  boundTeamVersion: PublicArenaBoundTeamVersion;
  dimensions: Array<{ name: string; maxScore: number }>;
}

export type PublicArenaRun = PublicArenaRunDetail;
