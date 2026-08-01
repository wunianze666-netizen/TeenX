import type { Db } from "@paperclipai/db";
import {
  activityService,
  agentService,
  companyService,
  heartbeatService,
  issueService,
  logActivity,
  workProductService,
} from "./index.js";
import { ADVX_TEST_TASKS } from "./advx-catalog.js";
import type { AdvxServerProfile } from "./advx-demo/profile.js";
import { createPreparedStudioTestRunExecutor } from "./advx-demo/studio-executor.js";
import { toTeenxTestRunView } from "./teenx-advx-dto.js";
import { badRequest, forbidden, notFound, unprocessable } from "../errors.js";

export type AdvxTestRunTeam = {
  readonly id: string;
  readonly name: string;
  readonly defaultResponsibleUserId: string | null;
};

export type AdvxTestRunMember = {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly status: string;
  readonly metadata: Record<string, unknown> | null;
};

export type AdvxTestRunTask = {
  readonly slug: string;
  readonly title: string;
  readonly prompt: string;
};

export type AdvxPreparedTestRunProvenance = {
  readonly profile: Exclude<AdvxServerProfile, "real">;
  readonly fixtureId: "todo-web-v1-r1";
  readonly fixtureRevision: "r1";
  readonly challengeVersionId: string;
  readonly teamVersionId: string;
  readonly archiveSha256: string;
  readonly official: false;
  readonly aiInvoked: false;
  readonly studioGenerated: false;
};

export type AdvxTestRunLaunchInput = {
  readonly captainId: string;
  readonly actor: {
    readonly actorType: "agent" | "user" | "system" | "plugin";
    readonly actorId: string;
  };
  readonly team: AdvxTestRunTeam;
  readonly task: AdvxTestRunTask;
  readonly member: AdvxTestRunMember;
  readonly members: readonly AdvxTestRunMember[];
};

export type AdvxTestRunLaunchResult = {
  readonly runId: string | null;
  readonly status: "queued" | "skipped" | "succeeded";
};

export type AdvxTestRunInspection = {
  readonly companyId: string;
  readonly body: ReturnType<typeof toTeenxTestRunView> & {
    readonly provenance?: AdvxPreparedTestRunProvenance;
  };
};

export interface AdvxTestRunExecutor {
  launch(input: AdvxTestRunLaunchInput): Promise<AdvxTestRunLaunchResult>;
  inspect(runId: string): Promise<AdvxTestRunInspection | null>;
}

export type AdvxTestRunOptions = {
  readonly profile?: AdvxServerProfile;
  readonly testRunExecutor?: AdvxTestRunExecutor;
};

function selectLeadMember(members: readonly AdvxTestRunMember[]): AdvxTestRunMember {
  const active = (member: AdvxTestRunMember) => member.status !== "paused" && member.status !== "terminated";
  const member = members.find((candidate) =>
    (candidate.role === "ceo" || candidate.role === "general") && active(candidate))
    ?? members.find(active)
    ?? members[0];
  if (!member) throw unprocessable("找不到可执行的队员");
  return member;
}

function createRealTestRunExecutor(db: Db): AdvxTestRunExecutor {
  const heartbeat = heartbeatService(db);
  const issues = issueService(db);
  const activity = activityService(db);
  const products = workProductService(db);

  return {
    launch: async (input) => {
      const issue = await issues.create(input.team.id, {
        title: `[试跑] ${input.task.title}`,
        description: input.task.prompt,
        status: "todo",
        assigneeAgentId: input.member.id,
        priority: "medium",
        originKind: "manual",
        createdByUserId: input.captainId,
      });
      const run = await heartbeat.wakeup(input.member.id, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "advx_test_run",
        requestedByActorType: "user",
        requestedByActorId: input.captainId,
        contextSnapshot: {
          issueId: issue.id,
          source: "advx_test_run",
          reason: input.task.slug,
        },
      });
      await logActivity(db, {
        companyId: input.team.id,
        actorType: input.actor.actorType,
        actorId: input.actor.actorId,
        action: "issue.created",
        entityType: "issue",
        entityId: issue.id,
        details: { advx: true, testTaskSlug: input.task.slug, runId: run?.id ?? null },
      });
      return { runId: run?.id ?? null, status: run ? "queued" : "skipped" };
    },
    inspect: async (runId) => {
      const run = await heartbeat.getRun(runId);
      if (!run) return null;
      const activityEntries = await activity.list({ companyId: run.companyId, limit: 50 });
      const issueId = (run as { contextIssueId?: string | null }).contextIssueId ?? null;
      const runProducts = issueId ? await products.listForIssue(issueId) : [];
      return {
        companyId: run.companyId,
        body: toTeenxTestRunView({
          run: {
            status: run.status,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            resultSummary: (run as { resultSummary?: string | null }).resultSummary ?? null,
          },
          activity: activityEntries,
          products: runProducts,
        }),
      };
    },
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported ADVX test-run profile: ${String(value)}`);
}

function defaultExecutor(db: Db, profile: AdvxServerProfile): AdvxTestRunExecutor {
  switch (profile) {
    case "real":
      return createRealTestRunExecutor(db);
    case "prepared_demo":
    case "prepared_replay":
      return createPreparedStudioTestRunExecutor(db, profile);
    default:
      return assertNever(profile);
  }
}

export function createAdvxTestRunService(db: Db, options: AdvxTestRunOptions = {}) {
  const companies = companyService(db);
  const agents = agentService(db);
  const executor = options.testRunExecutor ?? defaultExecutor(db, options.profile ?? "real");

  return {
    launch: async (input: {
      readonly captainId: string;
      readonly teamId: string;
      readonly testTaskSlug: string;
      readonly actor: AdvxTestRunLaunchInput["actor"];
    }) => {
      const team = await companies.getById(input.teamId);
      if (!team) throw notFound("队伍不存在");
      if (team.defaultResponsibleUserId !== input.captainId) throw forbidden("只能跑自己的队伍");
      const task = ADVX_TEST_TASKS.find((candidate) => candidate.slug === input.testTaskSlug);
      if (!task) throw badRequest("未知的试跑任务");
      const members = await agents.list(input.teamId);
      if (members.length === 0) throw unprocessable("队伍还没有队员，先加队员");
      return executor.launch({
        captainId: input.captainId,
        actor: input.actor,
        team,
        task,
        member: selectLeadMember(members),
        members,
      });
    },
    inspect: async (captainId: string, runId: string) => {
      const inspected = await executor.inspect(runId);
      if (!inspected) throw notFound("试跑不存在");
      const team = await companies.getById(inspected.companyId);
      if (!team) throw notFound("队伍不存在");
      if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能看自己的试跑");
      return inspected.body;
    },
  };
}
