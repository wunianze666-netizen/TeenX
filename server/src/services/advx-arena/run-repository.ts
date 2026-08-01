import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { companies, issues, type Db } from "@paperclipai/db";
import type { StorageService } from "../../storage/types.js";
import { issueService } from "../index.js";
import { advxVersionService } from "../advx-versions.js";
import { getArenaChallenge } from "../advx-arena-catalog.js";
import type { createArenaCheckpointStore } from "./checkpoint-store.js";
import type { PublicArenaRunState } from "./public-types.js";
import { ArenaRepositoryError } from "./repository-error.js";
import { resolveArenaBoundVersion } from "./submission-record.js";
import type { ArenaRunCheckpoint, ArenaSubmissionRecord, ArenaSubmissionState } from "./types.js";
import { readArenaSubmissionState } from "./types.js";
import { ARENA_MAX_ZIP_BYTES } from "./zip-parser.js";

type RunRepositoryContext = {
  readonly db: Db;
  readonly storage: StorageService;
  readonly services: {
    readonly issues: ReturnType<typeof issueService>;
    readonly versions: ReturnType<typeof advxVersionService>;
  };
  readonly submissions: {
    readonly captainOwnsTeam: (captainId: string, teamId: string) => Promise<boolean>;
    readonly updateState: (
      submissionId: string,
      updater: (arena: ArenaSubmissionState, row: typeof issues.$inferSelect) => ArenaSubmissionState,
    ) => Promise<ArenaSubmissionRecord>;
  };
  readonly checkpoints: ReturnType<typeof createArenaCheckpointStore>;
};

function asExecutionRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function createArenaRunRepository(context: RunRepositoryContext) {
  const { db, storage, services, submissions, checkpoints } = context;

  return {
    createRunIfAbsent: async (input: {
      submission: ArenaSubmissionRecord;
      official: boolean;
    }): Promise<{ checkpoint: ArenaRunCheckpoint; reused: boolean }> => {
      let createdRunId: string | null = null;
      try {
        return await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`advx-arena:${input.submission.id}`}, 0))`);
          const row = await tx.select().from(issues).where(eq(issues.id, input.submission.id)).for("update")
            .then((rows) => rows[0] ?? null);
          if (!row) throw new ArenaRepositoryError("ARENA_SUBMISSION_NOT_FOUND", "提交不存在");
          const arena = readArenaSubmissionState(row.executionState);
          if (!arena || arena.challengeVersionId !== input.submission.challengeVersionId || row.originId !== arena.challengeVersionId) {
            throw new ArenaRepositoryError("ARENA_SUBMISSION_INVALID", "提交与赛题版本不一致");
          }
          if (input.submission.boundTeamVersion.id !== arena.teamVersionId) {
            throw new ArenaRepositoryError("ARENA_SUBMISSION_INVALID", "提交与队伍版本不一致");
          }
          const challenge = getArenaChallenge(arena.challengeVersionId);
          const challengeDigest = arena.challengeDigest ?? input.submission.challengeDigest;
          if (!challenge || challengeDigest !== challenge.contentDigest) {
            throw new ArenaRepositoryError("ARENA_SUBMISSION_INVALID", "提交与赛题内容不一致");
          }
          const boundTeamVersion = input.submission.boundTeamVersion;
          if (arena.run) {
            if (arena.run.status === "interrupted") {
              await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`advx-arena-captain:${input.submission.captainId}`}, 0))`);
              const otherActive = await tx.select({ id: issues.id }).from(issues)
                .innerJoin(companies, eq(issues.companyId, companies.id))
                .where(and(
                  eq(companies.defaultResponsibleUserId, input.submission.captainId),
                  eq(issues.originKind, "advx_arena_submission"),
                  sql`${issues.id} <> ${row.id}`,
                  sql`${issues.executionState} -> 'arena' -> 'run' ->> 'status' in ('queued', 'running')`,
                ))
                .then((rows) => rows[0] ?? null);
              if (otherActive) throw new ArenaRepositoryError("ARENA_CAPTAIN_RUN_LIMIT", "同一时间只能进行一场 Arena 评审");
            }
            const checkpoint = await checkpoints.readCheckpoint(arena.run.runId);
            if (!checkpoint || checkpoint.submissionId !== row.id) {
              throw new ArenaRepositoryError("ARENA_CHECKPOINT_MISSING", "评审进度暂时无法恢复");
            }
            if (checkpoint.challengeDigest && checkpoint.challengeDigest !== challengeDigest) {
              throw new ArenaRepositoryError("ARENA_CHECKPOINT_INVALID", "评审赛题摘要不一致");
            }
            const migratedCheckpoint = { ...checkpoint, boundTeamVersion, challengeDigest };
            await checkpoints.writeCheckpoint(migratedCheckpoint);
            const executionState = { ...asExecutionRecord(row.executionState), arena: { ...arena, boundTeamVersion, challengeDigest } };
            await tx.update(issues).set({ executionState, updatedAt: new Date() }).where(eq(issues.id, row.id));
            return { checkpoint: migratedCheckpoint, reused: true };
          }

          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`advx-arena-captain:${input.submission.captainId}`}, 0))`);
          const active = await tx.select({ id: issues.id }).from(issues)
            .innerJoin(companies, eq(issues.companyId, companies.id))
            .where(and(
              eq(companies.defaultResponsibleUserId, input.submission.captainId),
              eq(issues.originKind, "advx_arena_submission"),
              sql`${issues.executionState} -> 'arena' -> 'run' ->> 'status' in ('queued', 'running')`,
            ))
            .then((rows) => rows[0] ?? null);
          if (active) throw new ArenaRepositoryError("ARENA_CAPTAIN_RUN_LIMIT", "同一时间只能进行一场 Arena 评审");

          const runId = randomUUID();
          createdRunId = runId;
          const state: PublicArenaRunState = {
            runId,
            status: "queued",
            stage: null,
            completedDimensions: [],
            startedAt: null,
            finishedAt: null,
            failureCode: null,
            failureMessage: null,
            scoreWorkProductId: null,
          };
          const checkpoint: ArenaRunCheckpoint = {
            schemaVersion: 1,
            runId,
            submissionId: row.id,
            teamId: row.companyId,
            captainId: input.submission.captainId,
            challengeVersionId: arena.challengeVersionId,
            teamVersionId: arena.teamVersionId,
            boundTeamVersion,
            attachmentId: arena.attachmentId,
            submissionSha256: arena.artifactSha256,
            originalFilename: arena.originalFilename,
            official: input.official,
            state,
            cancelRequestedAt: null,
            modelCallCount: 0,
            dimensionScores: {},
            events: [],
            challengeDigest,
          };
          await checkpoints.writeCheckpoint(checkpoint);
          const executionState = { ...asExecutionRecord(row.executionState), arena: { ...arena, boundTeamVersion, challengeDigest, run: state } };
          await tx.update(issues).set({ executionState, updatedAt: new Date() }).where(eq(issues.id, row.id));
          return { checkpoint, reused: false };
        });
      } catch (error) {
        if (createdRunId) await checkpoints.removeCheckpoint(createdRunId).catch(() => undefined);
        throw error;
      }
    },
    updatePublicRunState: async (checkpoint: ArenaRunCheckpoint): Promise<void> => {
      await submissions.updateState(checkpoint.submissionId, (arena) => {
        if (arena.run?.runId !== checkpoint.runId) throw new ArenaRepositoryError("ARENA_RUN_MISMATCH", "评审状态不一致");
        return { ...arena, run: checkpoint.state };
      });
    },
    getCheckpointForCaptain: async (runId: string, captainId: string): Promise<ArenaRunCheckpoint | null> => {
      const checkpoint = await checkpoints.readCheckpoint(runId);
      if (!checkpoint || !(await submissions.captainOwnsTeam(captainId, checkpoint.teamId))) return null;
      const submission = await db.select({ executionState: issues.executionState }).from(issues)
        .where(eq(issues.id, checkpoint.submissionId)).then((rows) => rows[0] ?? null);
      const arena = readArenaSubmissionState(submission?.executionState);
      if (arena?.run?.runId !== runId) return null;
      return {
        ...checkpoint,
        boundTeamVersion: await resolveArenaBoundVersion(services.versions, checkpoint.teamId, checkpoint.boundTeamVersion),
      };
    },
    loadArchive: async (checkpoint: ArenaRunCheckpoint): Promise<Buffer> => {
      const attachment = await services.issues.getAttachmentById(checkpoint.attachmentId);
      if (
        !attachment
        || attachment.issueId !== checkpoint.submissionId
        || attachment.companyId !== checkpoint.teamId
        || attachment.sha256 !== checkpoint.submissionSha256
      ) throw new ArenaRepositoryError("ARENA_SUBMISSION_INVALID", "提交包校验失败");
      const object = await storage.getObject(attachment.companyId, attachment.objectKey);
      if ((object.contentLength ?? 0) > ARENA_MAX_ZIP_BYTES) {
        throw new ArenaRepositoryError("ARENA_SUBMISSION_INVALID", "提交包超过大小限制");
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of object.stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += buffer.length;
        if (size > ARENA_MAX_ZIP_BYTES) throw new ArenaRepositoryError("ARENA_SUBMISSION_INVALID", "提交包超过大小限制");
        chunks.push(buffer);
      }
      return Buffer.concat(chunks);
    },
  };
}
