import { and, desc, eq } from "drizzle-orm";
import { issues, type Db } from "@paperclipai/db";
import { issueService } from "../index.js";
import { advxVersionService } from "../advx-versions.js";
import { projectBoundTeamVersion } from "./public-projector.js";
import type { PublicArenaSubmission } from "./public-types.js";
import { readArenaSubmissionRecord, resolveArenaSubmissionRecord } from "./submission-record.js";
import type { ArenaSubmissionRecord } from "./types.js";

type SubmissionSelectionContext = {
  readonly db: Db;
  readonly issueService: ReturnType<typeof issueService>;
  readonly versionService: ReturnType<typeof advxVersionService>;
  readonly getCaptainTeam: (captainId: string) => Promise<{ id: string } | null>;
};

export function createArenaSubmissionSelector(context: SubmissionSelectionContext) {
  const { db, issueService: issuesService, versionService, getCaptainTeam } = context;

  async function toPublicSubmission(record: ArenaSubmissionRecord): Promise<PublicArenaSubmission> {
    const resolved = await resolveArenaSubmissionRecord(versionService, record);
    const attachment = await issuesService.getAttachmentById(resolved.attachmentId);
    return {
      id: resolved.id,
      challengeVersionId: resolved.challengeVersionId,
      teamVersionId: resolved.teamVersionId,
      boundTeamVersion: projectBoundTeamVersion(resolved.boundTeamVersion),
      filename: resolved.originalFilename,
      byteSize: attachment?.byteSize ?? 0,
      sha256: resolved.artifactSha256,
      createdAt: resolved.createdAt,
      autoCreatedTeamVersion: false,
      run: resolved.run,
    };
  }

  async function getChallengeSubmissions(
    captainId: string,
    challengeVersionId: string,
  ): Promise<{ activeSubmission: PublicArenaSubmission | null; latestSubmission: PublicArenaSubmission | null }> {
    const team = await getCaptainTeam(captainId);
    if (!team) return { activeSubmission: null, latestSubmission: null };
    const rows = await db.select().from(issues).where(and(
      eq(issues.companyId, team.id),
      eq(issues.originKind, "advx_arena_submission"),
      eq(issues.originId, challengeVersionId),
    )).orderBy(desc(issues.createdAt));
    const records = rows
      .map(readArenaSubmissionRecord)
      .filter((record): record is ArenaSubmissionRecord => record !== null);
    const latestRecord = records[0] ?? null;
    const activeRecord = records.find((record) => (
      record.run !== null && ["queued", "running", "interrupted"].includes(record.run.status)
    )) ?? null;
    const latestSubmission = latestRecord ? await toPublicSubmission(latestRecord) : null;
    const activeSubmission = activeRecord
      ? activeRecord.id === latestRecord?.id
        ? latestSubmission
        : await toPublicSubmission(activeRecord)
      : null;
    return { activeSubmission, latestSubmission };
  }

  return {
    getChallengeSubmissions,
    getLatestSubmission: async (captainId: string, challengeVersionId: string): Promise<PublicArenaSubmission | null> => (
      getChallengeSubmissions(captainId, challengeVersionId).then((result) => result.latestSubmission)
    ),
  };
}
