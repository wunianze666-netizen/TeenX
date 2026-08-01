import { issues } from "@paperclipai/db";
import { advxVersionService } from "../advx-versions.js";
import type { PublicArenaBoundTeamVersion } from "./public-types.js";
import type { ArenaSubmissionRecord } from "./types.js";
import { readArenaSubmissionState } from "./types.js";

type VersionService = ReturnType<typeof advxVersionService>;

export function readArenaSubmissionRecord(row: typeof issues.$inferSelect): ArenaSubmissionRecord | null {
  if (row.originKind !== "advx_arena_submission") return null;
  const arena = readArenaSubmissionState(row.executionState);
  if (
    !arena
    || arena.attachmentId.length === 0
    || row.originId !== arena.challengeVersionId
    || row.originFingerprint !== arena.artifactSha256
  ) return null;
  const captainId = row.responsibleUserId ?? row.createdByUserId;
  if (!captainId) return null;
  return {
    id: row.id,
    teamId: row.companyId,
    captainId,
    challengeVersionId: arena.challengeVersionId,
    teamVersionId: arena.teamVersionId,
    boundTeamVersion: arena.boundTeamVersion,
    attachmentId: arena.attachmentId,
    artifactSha256: arena.artifactSha256,
    originalFilename: arena.originalFilename,
    createdAt: row.createdAt.toISOString(),
    run: arena.run,
    challengeDigest: arena.challengeDigest,
  };
}

export async function resolveArenaBoundVersion(
  versionService: VersionService,
  teamId: string,
  boundTeamVersion: PublicArenaBoundTeamVersion,
): Promise<PublicArenaBoundTeamVersion> {
  if (
    boundTeamVersion.versionNumber !== null
    && boundTeamVersion.teamName !== null
    && boundTeamVersion.createdAt !== null
  ) return boundTeamVersion;
  const exactVersion = await versionService.getById(teamId, boundTeamVersion.id);
  if (!exactVersion) return boundTeamVersion;
  return {
    id: exactVersion.id,
    versionNumber: exactVersion.versionNumber,
    label: exactVersion.label,
    teamName: exactVersion.snapshot.teamName,
    createdAt: exactVersion.createdAt,
  };
}

export async function resolveArenaSubmissionRecord(
  versionService: VersionService,
  record: ArenaSubmissionRecord,
): Promise<ArenaSubmissionRecord> {
  return {
    ...record,
    boundTeamVersion: await resolveArenaBoundVersion(versionService, record.teamId, record.boundTeamVersion),
  };
}
