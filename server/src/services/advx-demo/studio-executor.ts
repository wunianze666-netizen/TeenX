import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  activityLog,
  heartbeatRuns,
  issues as issuesTable,
  type Db,
} from "@paperclipai/db";
import { badRequest } from "../../errors.js";
import { advxVersionService } from "../advx-versions.js";
import { issueService } from "../issues.js";
import { logActivity } from "../activity-log.js";
import { workProductService } from "../work-products.js";
import { toTeenxTestRunView } from "../teenx-advx-dto.js";
import { loadTodoDemoFixture } from "./fixture.js";
import type { AdvxServerProfile } from "./profile.js";
import type {
  AdvxPreparedTestRunProvenance,
  AdvxTestRunExecutor,
  AdvxTestRunMember,
} from "../advx-test-runs.js";

const preparedProfileSchema = z.enum(["prepared_demo", "prepared_replay"]);
const preparedProvenanceSchema = z.object({
  profile: preparedProfileSchema,
  fixtureId: z.literal("todo-web-v1-r1"),
  fixtureRevision: z.literal("r1"),
  challengeVersionId: z.string().min(1),
  teamVersionId: z.string().min(1),
  archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
  official: z.literal(false),
  aiInvoked: z.literal(false),
  studioGenerated: z.literal(false),
}).strict();
const preparedRunContextSchema = z.object({
  issueId: z.string().uuid(),
  source: z.literal("advx_test_run"),
  provenance: preparedProvenanceSchema,
}).passthrough();
const preparedResultSchema = z.object({ summary: z.string().min(1) }).passthrough();
const PREPARED_RESULT_SUMMARY =
  "已加载并验证预置 Todo 演示产物。此产物不是本次 Studio 生成，且本次未调用 AI。";

class PreparedStudioPersistenceError extends Error {
  readonly name = "PreparedStudioPersistenceError";
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : [];
}

function versionMembers(members: readonly AdvxTestRunMember[]) {
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    roleTemplate: readString(member.metadata?.roleTemplate),
    responsibilities: readString(member.metadata?.responsibilities),
    tools: readStrings(member.metadata?.tools),
    skills: readStrings(member.metadata?.skills),
  }));
}

function provenance(
  profile: Exclude<AdvxServerProfile, "real">,
  teamVersionId: string,
  fixture: Awaited<ReturnType<typeof loadTodoDemoFixture>>,
): AdvxPreparedTestRunProvenance {
  return {
    profile,
    fixtureId: fixture.manifest.fixtureId,
    fixtureRevision: fixture.manifest.revision,
    challengeVersionId: fixture.manifest.challengeVersionId,
    teamVersionId,
    archiveSha256: fixture.archiveSha256,
    official: false,
    aiInvoked: false,
    studioGenerated: false,
  };
}

export function createPreparedStudioTestRunExecutor(
  db: Db,
  rawProfile: Exclude<AdvxServerProfile, "real">,
): AdvxTestRunExecutor {
  const profile = preparedProfileSchema.parse(rawProfile);
  const issueStore = issueService(db);
  const productStore = workProductService(db);
  const versionStore = advxVersionService(db);

  return {
    launch: async (input) => {
      if (input.task.slug !== "todo-maker") {
        throw badRequest("预置试跑只支持待办清单任务");
      }
      const fixture = await loadTodoDemoFixture();
      const version = await versionStore.create(input.team.id, {
        teamName: input.team.name,
        members: versionMembers(input.members),
        label: "Prepared Todo Studio run",
      });
      const runProvenance = provenance(profile, version.id, fixture);
      const issue = await issueStore.create(input.team.id, {
        title: `[试跑] ${input.task.title}`,
        description: input.task.prompt,
        status: "done",
        assigneeAgentId: input.member.id,
        priority: "medium",
        originKind: "manual",
        createdByUserId: input.captainId,
        executionState: { advxTestRun: { provenance: runProvenance } },
      });
      const now = new Date();
      const run = await db.insert(heartbeatRuns).values({
        companyId: input.team.id,
        agentId: input.member.id,
        invocationSource: "on_demand",
        triggerDetail: "manual",
        status: "succeeded",
        responsibleUserId: input.captainId,
        startedAt: now,
        finishedAt: now,
        resultJson: { summary: PREPARED_RESULT_SUMMARY },
        contextSnapshot: {
          issueId: issue.id,
          source: "advx_test_run",
          reason: input.task.slug,
          provenance: runProvenance,
        },
      }).returning().then((rows) => rows[0] ?? null);
      if (!run) throw new PreparedStudioPersistenceError("Prepared Studio run was not persisted");
      await db.update(issuesTable).set({
        executionRunId: run.id,
        executionState: { advxTestRun: { runId: run.id, provenance: runProvenance } },
        updatedAt: now,
      }).where(and(eq(issuesTable.id, issue.id), eq(issuesTable.companyId, input.team.id)));
      const product = await productStore.createForIssue(issue.id, input.team.id, {
        type: "artifact",
        provider: "custom",
        externalId: `${fixture.manifest.fixtureId}:${fixture.archiveSha256}`,
        title: "预置 Todo 演示产物",
        status: "ready_for_review",
        reviewState: "none",
        isPrimary: true,
        healthStatus: "healthy",
        summary: "已验证的预置待办清单演示；不是本次 Studio 试跑生成的产物。",
        createdByRunId: run.id,
        metadata: {
          advxPreparedStudio: runProvenance,
          fileNames: fixture.parsedSubmission.fileList,
        },
      });
      if (!product) throw new PreparedStudioPersistenceError("Prepared Studio product was not persisted");
      await logActivity(db, {
        companyId: input.team.id,
        actorType: input.actor.actorType,
        actorId: input.actor.actorId,
        action: "issue.created",
        entityType: "issue",
        entityId: issue.id,
        issueId: issue.id,
        runId: run.id,
        details: { advx: true, testTaskSlug: input.task.slug, provenance: runProvenance },
      });
      await logActivity(db, {
        companyId: input.team.id,
        actorType: "system",
        actorId: "advx-prepared-studio",
        action: "work_product.created",
        entityType: "issue",
        entityId: issue.id,
        issueId: issue.id,
        runId: run.id,
        details: { productId: product.id, provenance: runProvenance },
      });
      return { runId: run.id, status: "succeeded" };
    },
    inspect: async (runId) => {
      const run = await db.select().from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, runId)).then((rows) => rows[0] ?? null);
      if (!run) return null;
      const context = preparedRunContextSchema.safeParse(run.contextSnapshot);
      if (!context.success || context.data.provenance.profile !== profile) return null;
      const issue = await db.select({ id: issuesTable.id }).from(issuesTable)
        .where(and(
          eq(issuesTable.id, context.data.issueId),
          eq(issuesTable.companyId, run.companyId),
        )).then((rows) => rows[0] ?? null);
      if (!issue) return null;
      const [activity, products] = await Promise.all([
        db.select().from(activityLog)
          .where(and(eq(activityLog.companyId, run.companyId), eq(activityLog.runId, run.id)))
          .orderBy(desc(activityLog.createdAt)),
        productStore.listForIssue(issue.id),
      ]);
      const result = preparedResultSchema.safeParse(run.resultJson);
      return {
        companyId: run.companyId,
        body: {
          ...toTeenxTestRunView({
            run: {
              status: run.status,
              startedAt: run.startedAt,
              finishedAt: run.finishedAt,
              resultSummary: result.success ? result.data.summary : null,
            },
            activity,
            products,
          }),
          provenance: context.data.provenance,
        },
      };
    },
  };
}
