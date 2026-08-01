import type { ArenaProgressEvent, PublicArenaBoundTeamVersion, PublicArenaRunState, PublicArenaScore } from "./public-types.js";

export const ARENA_RUBRIC_VERSION = "arena-rubric-v3" as const;
export const ARENA_STANDARD_POLICY = "deepseek-fixed-v1" as const;

export interface ArenaChallenge {
  id: string;
  version: number;
  challengeVersionId: string;
  title: string;
  description: string;
  goal: string;
  rules: string;
  submitType: "zip";
  opensAt: string;
  closesAt: string;
  status: "upcoming" | "open" | "closed";
  contentDigest: string;
}

export interface ArenaStandardProvenance {
  mode: "mock" | "official" | "prepared_demo";
  model: string;
  policy: typeof ARENA_STANDARD_POLICY;
}

export interface SubCriterion {
  name: string;
  maxScore: number;
  anchor0: string;
  anchorPartial: string;
  anchorFull: string;
}

export interface Criterion {
  name: string;
  maxScore: number;
  rubric: string;
  subCriteria: SubCriterion[];
}

export interface ArenaStandard {
  id: string;
  challengeVersionId: string;
  criteria: Criterion[];
  totalMaxScore: number;
  rubricVersion: typeof ARENA_RUBRIC_VERSION;
  generatedAt: string;
  challengeDigest: string;
  provenance: ArenaStandardProvenance;
}

export interface OmittedFile {
  path: string;
  reason: string;
}

export interface ParsedFile {
  path: string;
  content: string;
  size: number;
  redactedLines?: number[];
}

export interface ParsedSubmission {
  fileList: string[];
  files: ParsedFile[];
  totalSize: number;
  includedCharacters: number;
  omittedFiles: OmittedFile[];
  truncatedFiles: string[];
}

export interface AnalysisPass {
  name: string;
  focus: string;
  content: string;
}

export interface SubmissionCoverage {
  listedFileCount: number;
  includedFileCount: number;
  includedCharacters: number;
  omittedFiles: OmittedFile[];
  truncatedFiles: string[];
  limitations: string[];
}

export interface AnalysisReport {
  fileCount: number;
  totalLines: number;
  totalSize: number;
  fileList: string[];
  languages: string[];
  analysis: string;
  analysisPasses: AnalysisPass[];
  coverage: SubmissionCoverage;
  rawContent: string;
}

export interface EvidenceReference {
  path: string;
  lineStart: number;
  lineEnd: number;
  quote: string;
  verified: true;
}

export type ScoreAnchor = "zero" | "partial" | "full";
export type EvidenceConfidence = "high" | "medium" | "low";
export type VerificationLevel = "source_verified" | "static_inference" | "not_verifiable";

export interface SubCriterionScore {
  name: string;
  score: number;
  maxScore: number;
  comment: string;
  anchor: ScoreAnchor;
  confidence: EvidenceConfidence;
  verification: VerificationLevel;
  evidenceRefs: EvidenceReference[];
  evidenceWarnings: string[];
}

export interface CriterionScore {
  criterionName: string;
  score: number;
  maxScore: number;
  subScores: SubCriterionScore[];
  comment: string;
  review: {
    primaryScore: number;
    independentScore: number;
    delta: number;
    adjudicated: true;
  };
}

export interface ArenaSubmissionState {
  schemaVersion: 1;
  challengeVersionId: string;
  teamVersionId: string;
  boundTeamVersion: PublicArenaBoundTeamVersion;
  attachmentId: string;
  artifactSha256: string;
  originalFilename: string;
  run: PublicArenaRunState | null;
  challengeDigest?: string;
}

export interface ArenaSubmissionRecord {
  id: string;
  teamId: string;
  captainId: string;
  challengeVersionId: string;
  teamVersionId: string;
  boundTeamVersion: PublicArenaBoundTeamVersion;
  attachmentId: string;
  artifactSha256: string;
  originalFilename: string;
  createdAt: string;
  run: PublicArenaRunState | null;
  challengeDigest?: string;
}

export interface ArenaCheckpointEvent {
  id: number;
  createdAt: string;
  event: ArenaProgressEvent;
}

export interface ArenaRunCheckpoint {
  schemaVersion: 1;
  runId: string;
  submissionId: string;
  teamId: string;
  captainId: string;
  challengeVersionId: string;
  teamVersionId: string;
  boundTeamVersion: PublicArenaBoundTeamVersion;
  attachmentId: string;
  submissionSha256: string;
  originalFilename: string;
  official: boolean;
  state: PublicArenaRunState;
  cancelRequestedAt: string | null;
  modelCallCount: number;
  standard?: ArenaStandard;
  parsedSubmission?: ParsedSubmission;
  sourceText?: string;
  evidenceFiles?: ParsedFile[];
  analysis?: AnalysisReport;
  dimensionScores: Record<string, CriterionScore>;
  score?: PublicArenaScore;
  events: ArenaCheckpointEvent[];
  challengeDigest?: string;
}

export function readArenaSubmissionState(executionState: unknown): ArenaSubmissionState | null {
  if (!executionState || typeof executionState !== "object" || Array.isArray(executionState)) return null;
  const arena = (executionState as Record<string, unknown>).arena;
  if (!arena || typeof arena !== "object" || Array.isArray(arena)) return null;
  const value = arena as Record<string, unknown>;
  if (
    value.schemaVersion !== 1
    || typeof value.challengeVersionId !== "string"
    || typeof value.teamVersionId !== "string"
    || typeof value.attachmentId !== "string"
    || typeof value.artifactSha256 !== "string"
    || typeof value.originalFilename !== "string"
  ) return null;
  return {
    schemaVersion: 1,
    challengeVersionId: value.challengeVersionId,
    teamVersionId: value.teamVersionId,
    boundTeamVersion: readBoundTeamVersion(value.teamVersionId, value.boundTeamVersion),
    attachmentId: value.attachmentId,
    artifactSha256: value.artifactSha256,
    originalFilename: value.originalFilename,
    run: value.run as PublicArenaRunState | null,
    ...(typeof value.challengeDigest === "string" ? { challengeDigest: value.challengeDigest } : {}),
  };
}

export function readBoundTeamVersion(teamVersionId: string, value: unknown): PublicArenaBoundTeamVersion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return unavailableBoundTeamVersion(teamVersionId);
  const record = value as Record<string, unknown>;
  if (
    record.id !== teamVersionId
    || typeof record.versionNumber !== "number"
    || !Number.isSafeInteger(record.versionNumber)
    || record.versionNumber < 1
    || !(typeof record.label === "string" || record.label === null)
    || typeof record.teamName !== "string"
    || typeof record.createdAt !== "string"
  ) return unavailableBoundTeamVersion(teamVersionId);
  return {
    id: record.id,
    versionNumber: record.versionNumber,
    label: record.label,
    teamName: record.teamName,
    createdAt: record.createdAt,
  };
}

function unavailableBoundTeamVersion(teamVersionId: string): PublicArenaBoundTeamVersion {
  return {
    id: teamVersionId,
    versionNumber: null,
    label: null,
    teamName: null,
    createdAt: null,
  };
}
