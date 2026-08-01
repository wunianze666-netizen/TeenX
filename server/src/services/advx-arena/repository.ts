import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { agents, companies, issues, type Db } from "@paperclipai/db";
import { agentService, issueService, logActivity } from "../index.js";
import { advxVersionService, type AdvxVersionSnapshot } from "../advx-versions.js";
import { getArenaChallenge } from "../advx-arena-catalog.js";
import type { StorageService } from "../../storage/types.js";
import { parseZipBuffer } from "./zip-parser.js";
import { createArenaCheckpointStore } from "./checkpoint-store.js";
import { createArenaScorecardStore } from "./scorecard-store.js";
import { createArenaRunRepository } from "./run-repository.js";
import { createArenaSubmissionSelector } from "./submission-selection.js";
import {
  readArenaSubmissionRecord,
  resolveArenaSubmissionRecord,
} from "./submission-record.js";
import { ArenaRepositoryError } from "./repository-error.js";
import { projectBoundTeamVersion } from "./public-projector.js";
import type { PublicArenaBoundTeamVersion, PublicArenaSubmission } from "./public-types.js";
import {
  type ArenaSubmissionRecord,
  type ArenaSubmissionState,
  readArenaSubmissionState,
} from "./types.js";

export { ArenaRepositoryError } from "./repository-error.js";

function asExecutionRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function advxArenaRepository(db: Db, storage: StorageService) {
  const issueSvc = issueService(db);
  const agentSvc = agentService(db);
  const versionSvc = advxVersionService(db);
  const checkpointStore = createArenaCheckpointStore();
  const scorecardStore = createArenaScorecardStore(db);

  async function getCaptainTeam(captainId: string) {
    return db
      .select()
      .from(companies)
      .where(eq(companies.defaultResponsibleUserId, captainId))
      .orderBy(desc(companies.createdAt))
      .then((rows) => rows[0] ?? null);
  }

  async function captainOwnsTeam(captainId: string, teamId: string): Promise<boolean> {
    const team = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, teamId), eq(companies.defaultResponsibleUserId, captainId)))
      .then((rows) => rows[0] ?? null);
    return Boolean(team);
  }

  async function createCurrentVersion(teamId: string, teamName: string): Promise<AdvxVersionSnapshot> {
    const members = await agentSvc.list(teamId);
    return versionSvc.create(teamId, {
      teamName,
      label: "Arena 自动封存",
      members: members.map((member) => {
        const metadata = (member as { metadata?: Record<string, unknown> }).metadata ?? {};
        return {
          id: member.id,
          name: member.name,
          roleTemplate: typeof metadata.roleTemplate === "string" ? metadata.roleTemplate : null,
          responsibilities: typeof metadata.responsibilities === "string" ? metadata.responsibilities : null,
          tools: Array.isArray(metadata.tools) ? metadata.tools.filter((item): item is string => typeof item === "string") : [],
          skills: Array.isArray(metadata.skills) ? metadata.skills.filter((item): item is string => typeof item === "string") : [],
        };
      }),
    });
  }

  async function updateSubmissionState(
    submissionId: string,
    updater: (arena: ArenaSubmissionState, row: typeof issues.$inferSelect) => ArenaSubmissionState,
  ): Promise<ArenaSubmissionRecord> {
    return db.transaction(async (tx) => {
      const row = await tx
        .select()
        .from(issues)
        .where(eq(issues.id, submissionId))
        .for("update")
        .then((rows) => rows[0] ?? null);
      if (!row) throw new ArenaRepositoryError("ARENA_SUBMISSION_NOT_FOUND", "提交不存在");
      const arena = readArenaSubmissionState(row.executionState);
      if (!arena || row.originKind !== "advx_arena_submission") {
        throw new ArenaRepositoryError("ARENA_SUBMISSION_NOT_FOUND", "提交不存在");
      }
      const nextArena = updater(arena, row);
      const executionState = { ...asExecutionRecord(row.executionState), arena: nextArena };
      const updated = await tx
        .update(issues)
        .set({ executionState, updatedAt: new Date() })
        .where(eq(issues.id, submissionId))
        .returning()
        .then((rows) => rows[0] ?? null);
      const record = updated ? readArenaSubmissionRecord(updated) : null;
      if (!record) throw new ArenaRepositoryError("ARENA_SUBMISSION_INVALID", "提交状态无效");
      return record;
    });
  }

  const submissionSelector = createArenaSubmissionSelector({
    db,
    issueService: issueSvc,
    versionService: versionSvc,
    getCaptainTeam,
  });

  const runRepository = createArenaRunRepository({
    db,
    storage,
    services: { issues: issueSvc, versions: versionSvc },
    submissions: { captainOwnsTeam, updateState: updateSubmissionState },
    checkpoints: checkpointStore,
  });

  return {
    getCaptainTeam,

    createSubmission: async (input: {
      captainId: string;
      challengeVersionId: string;
      challengeTitle: string;
      file: { buffer: Buffer; originalname: string };
      teamVersionId?: string;
    }): Promise<PublicArenaSubmission> => {
      await parseZipBuffer(input.file.buffer);
      const team = await getCaptainTeam(input.captainId);
      if (!team) throw new ArenaRepositoryError("ARENA_TEAM_REQUIRED", "请先创建队伍");
      const challenge = getArenaChallenge(input.challengeVersionId);
      if (!challenge) throw new ArenaRepositoryError("ARENA_INVALID_CHALLENGE", "赛题版本无效");

      let teamVersion: AdvxVersionSnapshot | null = null;
      let autoCreatedTeamVersion = false;
      if (input.teamVersionId) teamVersion = await versionSvc.getById(team.id, input.teamVersionId);
      else {
        teamVersion = await createCurrentVersion(team.id, team.name);
        autoCreatedTeamVersion = true;
      }
      if (!teamVersion) throw new ArenaRepositoryError("ARENA_TEAM_VERSION_NOT_FOUND", "队伍版本不存在");

      const artifactSha256 = createHash("sha256").update(input.file.buffer).digest("hex");
      const boundTeamVersion: PublicArenaBoundTeamVersion = {
        id: teamVersion.id,
        versionNumber: teamVersion.versionNumber,
        label: teamVersion.label,
        teamName: teamVersion.snapshot.teamName,
        createdAt: teamVersion.createdAt,
      };
      const initialState: ArenaSubmissionState = {
        schemaVersion: 1,
        challengeVersionId: input.challengeVersionId,
        teamVersionId: teamVersion.id,
        boundTeamVersion,
        attachmentId: "",
        artifactSha256,
        originalFilename: input.file.originalname.slice(0, 255),
        run: null,
        challengeDigest: challenge.contentDigest,
      };
      const issue = await issueSvc.create(team.id, {
        title: `[Arena] ${input.challengeTitle}`,
        description: `Official Arena submission for ${input.challengeVersionId}`,
        status: "todo",
        priority: "medium",
        originKind: "advx_arena_submission",
        originId: input.challengeVersionId,
        originFingerprint: artifactSha256,
        createdByUserId: input.captainId,
        responsibleUserId: input.captainId,
        actorResponsibleUserId: input.captainId,
        trustExplicitResponsibleUserId: true,
        allowDuplicate: true,
        executionState: { arena: initialState },
      });

      let stored: Awaited<ReturnType<StorageService["putFile"]>> | null = null;
      try {
        stored = await storage.putFile({
          companyId: team.id,
          namespace: "advx-arena/submissions",
          originalFilename: input.file.originalname,
          contentType: "application/zip",
          body: input.file.buffer,
        });
        if (stored.sha256 !== artifactSha256) throw new ArenaRepositoryError("ARENA_STORAGE_FAILED", "提交包保存失败");
        const attachment = await issueSvc.createAttachment({
          issueId: issue.id,
          provider: stored.provider,
          objectKey: stored.objectKey,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          sha256: stored.sha256,
          originalFilename: stored.originalFilename,
          createdByUserId: input.captainId,
        });
        await updateSubmissionState(issue.id, (arena) => ({ ...arena, attachmentId: attachment.id }));
        await logActivity(db, {
          companyId: team.id,
          actorType: "user",
          actorId: input.captainId,
          action: "arena.submission_created",
          entityType: "issue",
          entityId: issue.id,
          issueId: issue.id,
          details: { challengeVersionId: input.challengeVersionId, submissionId: issue.id, status: "created" },
        });
        return {
          id: issue.id,
          challengeVersionId: input.challengeVersionId,
          teamVersionId: teamVersion.id,
          boundTeamVersion: projectBoundTeamVersion(boundTeamVersion),
          filename: initialState.originalFilename,
          byteSize: stored.byteSize,
          sha256: artifactSha256,
          createdAt: issue.createdAt.toISOString(),
          autoCreatedTeamVersion,
          run: null,
        };
      } catch (error) {
        if (stored) await storage.deleteObject(team.id, stored.objectKey).catch(() => undefined);
        await issueSvc.remove(issue.id).catch(() => undefined);
        throw error;
      }
    },

    getSubmissionForCaptain: async (submissionId: string, captainId: string): Promise<ArenaSubmissionRecord | null> => {
      const row = await db.select().from(issues).where(eq(issues.id, submissionId)).then((rows) => rows[0] ?? null);
      const record = row ? readArenaSubmissionRecord(row) : null;
      if (!record || !(await captainOwnsTeam(captainId, record.teamId))) return null;
      const resolved = await resolveArenaSubmissionRecord(versionSvc, record);
      const challenge = getArenaChallenge(resolved.challengeVersionId);
      if (!challenge) return null;
      return { ...resolved, challengeDigest: resolved.challengeDigest ?? challenge.contentDigest };
    },

    getChallengeSubmissions: submissionSelector.getChallengeSubmissions,
    getLatestSubmission: submissionSelector.getLatestSubmission,

    createRunIfAbsent: runRepository.createRunIfAbsent,

    readCheckpoint: checkpointStore.readCheckpoint,
    listRecoverableCheckpoints: checkpointStore.listRecoverableCheckpoints,
    writeCheckpoint: checkpointStore.writeCheckpoint,

    updatePublicRunState: runRepository.updatePublicRunState,
    getCheckpointForCaptain: runRepository.getCheckpointForCaptain,
    loadArchive: runRepository.loadArchive,

    readStandard: checkpointStore.readStandard,
    writeStandard: checkpointStore.writeStandard,

    createScorecard: scorecardStore.createScorecard,
    logRunActivity: scorecardStore.logRunActivity,
  };
}
