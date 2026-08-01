export type ArenaChallengeStatus = "upcoming" | "open" | "closed";
export type ArenaRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type ArenaStage = "challenge" | "standard" | "analysis" | "scoring" | "summary";

export interface ArenaChallengeSummary {
  readonly id: string;
  readonly version: number;
  readonly challengeVersionId: string;
  readonly title: string;
  readonly description: string;
  readonly goal: string;
  readonly rules: string;
  readonly submitType: "zip";
  readonly opensAt: string;
  readonly closesAt: string;
  readonly status: ArenaChallengeStatus;
}

export interface ArenaDimensionDefinition {
  readonly name: string;
  readonly maxScore: number;
}

export interface PublicArenaBoundTeamVersion {
  readonly id: string;
  readonly versionNumber: number | null;
  readonly label: string | null;
  readonly teamName: string | null;
  readonly createdAt: string | null;
}

export interface PublicArenaRunState {
  readonly runId: string;
  readonly status: ArenaRunStatus;
  readonly stage: ArenaStage | null;
  readonly completedDimensions: readonly string[];
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly scoreWorkProductId: string | null;
}

export interface PublicSubmission {
  readonly id: string;
  readonly challengeVersionId: string;
  readonly teamVersionId: string;
  readonly boundTeamVersion: PublicArenaBoundTeamVersion;
  readonly filename: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly createdAt: string;
  readonly autoCreatedTeamVersion: boolean;
  readonly run: PublicArenaRunState | null;
}

export interface ArenaChallengeDetail extends ArenaChallengeSummary {
  readonly dimensions: readonly ArenaDimensionDefinition[];
  readonly activeSubmission: PublicSubmission | null;
  readonly latestSubmission: PublicSubmission | null;
}

export interface ArenaRunDimension {
  readonly name: string;
  readonly maxScore: number;
}

export interface PublicArenaRunDetail extends PublicArenaRunState {
  readonly submissionId: string;
  readonly challengeVersionId: string;
  readonly challengeTitle: string;
  readonly teamVersionId: string;
  readonly boundTeamVersion: PublicArenaBoundTeamVersion;
  readonly dimensions: readonly ArenaRunDimension[];
}

export type ArenaProgressEvent =
  | { readonly type: "run_started"; readonly runId: string; readonly startedAt: string }
  | { readonly type: "stage"; readonly stage: ArenaStage; readonly status: "started" | "completed" }
  | { readonly type: "dimension"; readonly name: string; readonly index: number; readonly total: 8; readonly status: "started" | "completed" }
  | { readonly type: "run_completed"; readonly runId: string; readonly scoreWorkProductId: string }
  | { readonly type: "run_failed"; readonly runId: string; readonly code: string; readonly message: string }
  | { readonly type: "run_cancelled"; readonly runId: string };

export type ArenaTerminalEvent = Extract<ArenaProgressEvent, { readonly type: "run_completed" | "run_failed" | "run_cancelled" }>;

export interface PublicArenaEvidence {
  readonly path: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly quote: string;
  readonly verified: true;
}

export interface PublicArenaSubScore {
  readonly name: string;
  readonly score: number;
  readonly maxScore: number;
  readonly comment: string;
  readonly anchor: "zero" | "partial" | "full";
  readonly confidence: "high" | "medium" | "low";
  readonly verification: "source_verified" | "static_inference" | "not_verifiable";
  readonly evidence: readonly PublicArenaEvidence[];
  readonly evidenceWarnings: readonly string[];
}

export interface PublicArenaDimensionScore {
  readonly name: string;
  readonly score: number;
  readonly maxScore: number;
  readonly comment: string;
  readonly subScores: readonly PublicArenaSubScore[];
  readonly review: {
    readonly primaryScore: number;
    readonly independentScore: number;
    readonly delta: number;
    readonly adjudicated: true;
  };
}

export interface PublicArenaScore {
  readonly id: string;
  readonly submissionId: string;
  readonly challengeVersionId: string;
  readonly teamVersionId: string;
  readonly submissionSha256: string;
  readonly rubricVersion: "arena-rubric-v3";
  readonly official: boolean;
  readonly totalScore: number;
  readonly totalMaxScore: 1000;
  readonly summary: string;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly dimensions: readonly PublicArenaDimensionScore[];
  readonly scoredAt: string;
}

export interface ArenaEventStreamOptions {
  readonly cursor?: number;
  readonly signal?: AbortSignal;
  readonly onOpen?: () => void;
  readonly onActivity?: () => void;
  readonly onCursor?: (cursor: number) => void;
  readonly onEvent: (event: ArenaProgressEvent, cursor: number) => void;
  readonly onTerminal?: (event: ArenaTerminalEvent, cursor: number) => void;
}

export interface ArenaEventStreamResult {
  readonly cursor: number | undefined;
  readonly terminal: ArenaTerminalEvent | null;
}

export interface ArenaEventConnection {
  readonly abort: (reason?: unknown) => void;
  readonly done: Promise<ArenaEventStreamResult>;
}

export const ARENA_DIMENSION_NAMES = [
  "需求符合度",
  "规则遵循",
  "代码/实现质量",
  "创新性",
  "趣味性/体验感",
  "视觉/审美",
  "问题解决能力",
  "完成度与细节",
] as const;
