import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { authUsers, heartbeatRuns, type Db } from "@paperclipai/db";
import {
  accessService,
  activityService,
  agentService,
  companyService,
  logActivity,
} from "../services/index.js";
import { advxVersionService } from "../services/advx-versions.js";
import {
  ADVX_MAX_MEMBERS,
  ADVX_MIN_MEMBERS,
  ADVX_MODEL,
  ADVX_MODEL_LABEL,
  buildAgentMetadata,
  toMemberView,
  toTeamView,
} from "../services/advx-mapper.js";
import {
  ADVX_ROLE_TEMPLATES,
  ADVX_TEST_TASKS,
  ADVX_TOOLS,
  getRoleTemplate,
} from "../services/advx-catalog.js";
import { assertBoard, getActorInfo } from "./authz.js";
import { assertCaptain } from "./advx-auth.js";
import { conflict, forbidden, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import {
  toTeenxActivityView,
  toTeenxTeamView,
  toTeenxVersionView,
} from "../services/teenx-advx-dto.js";
import {
  createAdvxTestRunService,
  type AdvxTestRunOptions,
} from "../services/advx-test-runs.js";
import { loadTodoDemoFixture } from "../services/advx-demo/fixture.js";

const DISCOURSE_BASE_URL = process.env.TEENX_DISCOURSE_BASE_URL ?? "http://localhost:3000";

const createTeamSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
}).strict();

const updateTeamSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
}).strict();

const createMemberSchema = z.object({
  name: z.string().min(1).max(60),
  roleTemplate: z.string().min(1).max(40),
  responsibilities: z.string().max(1000).optional(),
  tools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  reportsTo: z.string().nullable().optional(),
  canDelegateTo: z.array(z.string()).optional(),
}).strict();

const updateMemberSchema = createMemberSchema.partial();

const createVersionSchema = z.object({
  label: z.string().max(80).nullable().optional(),
}).strict();

const createTestRunSchema = z.object({
  testTaskSlug: z.string().min(1).max(40),
}).strict();

const demoIdentitySchema = z.object({
  nickname: z.string().trim().min(1).max(24),
}).strict();

const demoPrivacySchema = z.object({
  showTeam: z.boolean(),
  showForumActivity: z.boolean(),
  acceptDmRequests: z.boolean(),
}).strict();

export type AdvxRoutesOptions = AdvxTestRunOptions;

export function advxRoutes(db: Db, options: AdvxRoutesOptions = {}) {
  const router = Router();
  const companies = companyService(db);
  const agents = agentService(db);
  const access = accessService(db);
  const activity = activityService(db);
  const versions = advxVersionService(db);
  const testRuns = createAdvxTestRunService(db, options);
  const profile = options.profile ?? "real";
  const demoNicknames = new Map<string, string>();
  const demoPrivacy = new Map<string, z.infer<typeof demoPrivacySchema>>();

  function requirePreparedProfile() {
    if (profile === "real") throw notFound("ADVX Demo capability is unavailable");
  }

  router.get("/demo/status", async (_req, res) => {
    if (profile !== "real") await loadTodoDemoFixture();
    res.json({ profile, enabled: profile !== "real" });
  });

  async function getTeamForActor(captainId: string) {
    const all = await companies.list();
    return all.find((c) => c.defaultResponsibleUserId === captainId) ?? null;
  }

  async function ensureMembership(teamId: string, captainId: string) {
    await access.ensureMembership(teamId, "user", captainId, "owner", "active");
  }

  async function countMembers(teamId: string) {
    const members = await agents.list(teamId);
    return members.length;
  }

  async function getCaptainIdentity(
    req: Parameters<typeof assertBoard>[0],
    captainId: string,
  ) {
    const user = await db
      .select({
        name: authUsers.name,
        email: authUsers.email,
        image: authUsers.image,
        createdAt: authUsers.createdAt,
      })
      .from(authUsers)
      .where(eq(authUsers.id, captainId))
      .then((rows) => rows[0] ?? null);

    const actorName = req.actor.type === "board" ? req.actor.userName : null;
    const rawName = demoNicknames.get(captainId) ?? (user?.name?.trim() || actorName?.trim() || captainId);
    const defaultLocalNames = new Set(["board", "local board", "local-board"]);
    const nickname = captainId === "local-board" && defaultLocalNames.has(rawName.toLowerCase())
      ? "小创"
      : rawName;

    return {
      id: captainId,
      nickname,
      email: user?.email || (req.actor.type === "board" ? req.actor.userEmail : null),
      image: user?.image ?? null,
      joinedAt: user?.createdAt?.toISOString() ?? null,
      authMode: req.actor.source === "local_implicit" ? "local_demo" as const : "signed_in" as const,
    };
  }

  router.get("/captain", (req, res) => {
    const captainId = assertCaptain(req);
    res.json({ captainId, model: { id: ADVX_MODEL, label: ADVX_MODEL_LABEL } });
  });

  router.post("/captain/claim", async (req, res) => {
    const captainId = assertCaptain(req);
    res.json({ claimed: true, captainId });
  });

  router.get("/me", async (req, res) => {
    const captainId = assertCaptain(req);
    const identity = await getCaptainIdentity(req, captainId);
    const team = await getTeamForActor(captainId);

    if (!team) {
      res.json({
        profile: {
          id: identity.id,
          nickname: identity.nickname,
          image: identity.image,
          joinedAt: identity.joinedAt,
          authMode: identity.authMode,
        },
        team: null,
        stats: { testRunCount: 0 },
      });
      return;
    }

    const [versionCount, memberCount, runStats] = await Promise.all([
      versions.count(team.id),
      countMembers(team.id),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, team.id),
            sql`${heartbeatRuns.contextSnapshot} ->> 'source' = 'advx_test_run'`,
          ),
        )
        .then((rows) => rows[0] ?? { count: 0 }),
    ]);

    res.json({
      profile: {
        id: identity.id,
        nickname: identity.nickname,
        image: identity.image,
        joinedAt: identity.joinedAt,
        authMode: identity.authMode,
      },
      team: toTeamView(team, { memberCount, versionCount }),
      stats: { testRunCount: Number(runStats.count) },
    });
  });

  router.patch("/me/identity", validate(demoIdentitySchema), async (req, res) => {
    requirePreparedProfile();
    const captainId = assertCaptain(req);
    demoNicknames.set(captainId, req.body.nickname);
    const identity = await getCaptainIdentity(req, captainId);
    res.json({
      profile: {
        publicId: "demo-captain",
        nickname: identity.nickname,
        joinedAt: identity.joinedAt,
      },
    });
  });

  router.get("/me/privacy", (req, res) => {
    requirePreparedProfile();
    const captainId = assertCaptain(req);
    res.json(demoPrivacy.get(captainId) ?? {
      showTeam: true,
      showForumActivity: true,
      acceptDmRequests: false,
    });
  });

  router.patch("/me/privacy", validate(demoPrivacySchema), (req, res) => {
    requirePreparedProfile();
    const captainId = assertCaptain(req);
    demoPrivacy.set(captainId, req.body);
    res.json(req.body);
  });

  router.get("/me/contact-requests", (req, res) => {
    requirePreparedProfile();
    assertCaptain(req);
    res.json({ items: [], nextCursor: null });
  });

  router.get("/me/contacts", (req, res) => {
    requirePreparedProfile();
    assertCaptain(req);
    res.json({ items: [], nextCursor: null });
  });

  router.get("/forum/session", async (req, res) => {
    assertCaptain(req);
    const discourseCookie = (req.header("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("_t=") || part.startsWith("_forum_session="))
      .join("; ");

    try {
      const response = await fetch(`${DISCOURSE_BASE_URL}/session/current.json`, {
        headers: {
          accept: "application/json",
          ...(discourseCookie ? { cookie: discourseCookie } : {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });

      if (response.status === 401 || response.status === 403 || response.status === 404) {
        res.json({ connected: false, username: null });
        return;
      }
      if (!response.ok) {
        res.status(502).json({ error: `论坛会话检查失败 (${response.status})` });
        return;
      }

      const payload = await response.json() as { current_user?: { username?: unknown } | null };
      const username = typeof payload.current_user?.username === "string"
        ? payload.current_user.username
        : null;
      res.json({ connected: Boolean(payload.current_user), username });
    } catch {
      res.status(503).json({ error: "论坛服务暂时不可用" });
    }
  });

  router.post("/teams", validate(createTeamSchema), async (req, res) => {
    const captainId = assertCaptain(req);
    const existing = await getTeamForActor(captainId);
    if (existing) {
      const versionCount = await versions.count(existing.id);
      const memberCount = await countMembers(existing.id);
      res.json(toTeenxTeamView(toTeamView(existing, { memberCount, versionCount })));
      return;
    }
    const teamName = req.body.name ?? "我的 AI 队伍";
    const created = await companies.create({
      name: teamName,
      description: req.body.description ?? null,
      budgetMonthlyCents: 0,
      defaultResponsibleUserId: captainId,
    });
    await ensureMembership(created.id, captainId);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: created.id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.created",
      entityType: "company",
      entityId: created.id,
      details: { name: created.name, advx: true },
    });
    res.status(201).json(toTeenxTeamView(toTeamView(created, { memberCount: 0, versionCount: 0 })));
  });

  router.get("/teams/mine", async (req, res) => {
    const captainId = assertCaptain(req);
    const team = await getTeamForActor(captainId);
    if (!team) {
      res.status(404).json({ error: "还没有队伍，先创建一支" });
      return;
    }
    const versionCount = await versions.count(team.id);
    const memberCount = await countMembers(team.id);
    res.json(toTeenxTeamView(toTeamView(team, { memberCount, versionCount })));
  });

  router.get("/teams", async (req, res) => {
    const captainId = assertCaptain(req);
    const team = await getTeamForActor(captainId);
    if (!team) {
      res.json([]);
      return;
    }
    const versionCount = await versions.count(team.id);
    const memberCount = await countMembers(team.id);
    res.json([toTeenxTeamView(toTeamView(team, { memberCount, versionCount }))]);
  });

  router.patch("/teams/:teamId", validate(updateTeamSchema), async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const team = await companies.getById(teamId);
    if (!team) throw notFound("队伍不存在");
    if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能改自己的队伍");
    const updated = await companies.update(teamId, {
      name: req.body.name,
      description: req.body.description,
    });
    if (!updated) throw notFound("队伍不存在");
    const versionCount = await versions.count(teamId);
    const memberCount = await countMembers(teamId);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: teamId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.updated",
      entityType: "company",
      entityId: teamId,
      details: { advx: true, ...req.body },
    });
    res.json(toTeenxTeamView(toTeamView(updated, { memberCount, versionCount })));
  });

  router.get("/teams/:teamId", async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const team = await companies.getById(teamId);
    if (!team) throw notFound("队伍不存在");
    if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能看自己的队伍");
    const versionCount = await versions.count(teamId);
    const memberCount = await countMembers(teamId);
    res.json(toTeenxTeamView(toTeamView(team, { memberCount, versionCount })));
  });

  router.get("/teams/:teamId/members", async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const team = await companies.getById(teamId);
    if (!team) throw notFound("队伍不存在");
    if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能看自己的队伍");
    const members = await agents.list(teamId);
    res.json(members.map(toMemberView));
  });

  router.post("/teams/:teamId/members", validate(createMemberSchema), async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const team = await companies.getById(teamId);
    if (!team) throw notFound("队伍不存在");
    if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能改自己的队伍");

    const currentMembers = await agents.list(teamId);
    if (currentMembers.length >= ADVX_MAX_MEMBERS) {
      throw conflict(`队伍最多 ${ADVX_MAX_MEMBERS} 个队员`);
    }

    const template = getRoleTemplate(req.body.roleTemplate);
    const tools = req.body.tools ?? template?.defaultTools ?? [];
    const skills = req.body.skills ?? template?.defaultSkills ?? [];
    const reportsToSlug = req.body.reportsTo ?? template?.collaboration.reportsTo ?? null;

    let reportsToAgentId: string | null = null;
    if (reportsToSlug && reportsToSlug !== "captain") {
      const target = currentMembers.find((m) => {
        const meta = (m as { metadata?: Record<string, unknown> }).metadata;
        return meta?.roleTemplate === reportsToSlug;
      });
      if (target) reportsToAgentId = target.id;
    }

    const delegateSlugs = req.body.canDelegateTo ?? template?.collaboration.canDelegateTo ?? [];
    const delegateIds: string[] = [];
    for (const slug of delegateSlugs) {
      const target = currentMembers.find((m) => {
        const meta = (m as { metadata?: Record<string, unknown> }).metadata;
        return meta?.roleTemplate === slug;
      });
      if (target) delegateIds.push(target.id);
    }

    const metadata = buildAgentMetadata({
      roleTemplate: req.body.roleTemplate,
      responsibilities: req.body.responsibilities ?? template?.responsibilities ?? null,
      tools,
      skills,
      reportsTo: reportsToAgentId,
      canDelegateTo: delegateIds,
    });

    const created = await agents.create(teamId, {
      name: req.body.name,
      role: req.body.roleTemplate === "custom" ? "general" : req.body.roleTemplate,
      title: template?.name ?? null,
      adapterType: "process",
      adapterConfig: { model: ADVX_MODEL },
      metadata,
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: teamId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "agent.created",
      entityType: "agent",
      entityId: created.id,
      details: { name: created.name, roleTemplate: req.body.roleTemplate, advx: true },
    });

    res.status(201).json(toMemberView(created));
  });

  router.patch("/teams/:teamId/members/:memberId", validate(updateMemberSchema), async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const memberId = req.params.memberId as string;
    const team = await companies.getById(teamId);
    if (!team) throw notFound("队伍不存在");
    if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能改自己的队伍");

    const existing = await agents.getById(memberId);
    if (!existing || existing.companyId !== teamId) throw notFound("队员不存在");

    const existingMeta = (existing as { metadata?: Record<string, unknown> }).metadata ?? {};
    const template = req.body.roleTemplate ? getRoleTemplate(req.body.roleTemplate) : null;
    const roleTemplate = req.body.roleTemplate ?? (existingMeta.roleTemplate as string | undefined) ?? "custom";
    const responsibilities = req.body.responsibilities ?? (existingMeta.responsibilities as string | undefined) ?? null;
    const tools = req.body.tools ?? (existingMeta.tools as string[] | undefined) ?? [];
    const skills = req.body.skills ?? (existingMeta.skills as string[] | undefined) ?? [];

    const currentMembers = await agents.list(teamId);
    let reportsToAgentId: string | null = null;
    const reportsToSlug = req.body.reportsTo ?? (existingMeta.collaboration as { reportsTo?: string } | undefined)?.reportsTo ?? null;
    if (reportsToSlug && reportsToSlug !== "captain") {
      const target = currentMembers.find((m) => {
        const meta = (m as { metadata?: Record<string, unknown> }).metadata;
        return meta?.roleTemplate === reportsToSlug && m.id !== memberId;
      });
      if (target) reportsToAgentId = target.id;
    }

    const delegateSlugs =
      req.body.canDelegateTo ??
      (existingMeta.collaboration as { canDelegateTo?: string[] } | undefined)?.canDelegateTo ??
      [];
    const delegateIds: string[] = [];
    for (const slug of delegateSlugs) {
      const target = currentMembers.find((m) => {
        const meta = (m as { metadata?: Record<string, unknown> }).metadata;
        return meta?.roleTemplate === slug && m.id !== memberId;
      });
      if (target) delegateIds.push(target.id);
    }

    const metadata = buildAgentMetadata({
      roleTemplate,
      responsibilities,
      tools,
      skills,
      reportsTo: reportsToAgentId,
      canDelegateTo: delegateIds,
    });

    const updated = await agents.update(memberId, {
      name: req.body.name,
      title: template?.name ?? existing.title,
      metadata,
    });

    if (!updated) throw notFound("队员不存在");
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: teamId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "agent.updated",
      entityType: "agent",
      entityId: memberId,
      details: { advx: true, ...req.body },
    });
    res.json(toMemberView(updated));
  });

  router.delete("/teams/:teamId/members/:memberId", async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const memberId = req.params.memberId as string;
    const team = await companies.getById(teamId);
    if (!team) throw notFound("队伍不存在");
    if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能改自己的队伍");

    const existing = await agents.getById(memberId);
    if (!existing || existing.companyId !== teamId) throw notFound("队员不存在");

    const currentMembers = await agents.list(teamId);
    if (currentMembers.length <= ADVX_MIN_MEMBERS) {
      throw conflict(`队伍至少保留 ${ADVX_MIN_MEMBERS} 个队员`);
    }

    await agents.remove(memberId);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: teamId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "agent.deleted",
      entityType: "agent",
      entityId: memberId,
      details: { advx: true },
    });
    res.json({ ok: true });
  });

  router.get("/role-templates", (_req, res) => {
    res.json(ADVX_ROLE_TEMPLATES);
  });

  router.get("/tools", (_req, res) => {
    res.json(ADVX_TOOLS);
  });

  router.get("/skills", (_req, res) => {
    res.json([]);
  });

  router.get("/test-tasks", (_req, res) => {
    res.json(ADVX_TEST_TASKS.map((task) => ({
      slug: task.slug,
      title: task.title,
      description: task.description,
    })));
  });

  router.post("/teams/:teamId/versions", validate(createVersionSchema), async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const team = await companies.getById(teamId);
    if (!team) throw notFound("队伍不存在");
    if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能封存自己的队伍");

    const members = await agents.list(teamId);
    const memberSnapshots = members.map((m) => {
      const meta = (m as { metadata?: Record<string, unknown> }).metadata ?? {};
      return {
        id: m.id,
        name: m.name,
        roleTemplate: (meta.roleTemplate as string | null) ?? null,
        responsibilities: (meta.responsibilities as string | null) ?? null,
        tools: (meta.tools as string[] | undefined) ?? [],
        skills: (meta.skills as string[] | undefined) ?? [],
      };
    });

    const snapshot = await versions.create(teamId, {
      teamName: team.name,
      members: memberSnapshots,
      label: req.body.label ?? null,
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: teamId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.updated",
      entityType: "company",
      entityId: teamId,
      details: { advx: true, action: "version_snapshot", versionId: snapshot.id },
    });

    res.status(201).json(toTeenxVersionView(snapshot));
  });

  router.get("/teams/:teamId/versions", async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const team = await companies.getById(teamId);
    if (!team) throw notFound("队伍不存在");
    if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能看自己的队伍");
    res.json((await versions.list(teamId)).map(toTeenxVersionView));
  });

  router.get("/teams/:teamId/versions/:versionId", async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const team = await companies.getById(teamId);
    if (!team) throw notFound("队伍不存在");
    if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能看自己的队伍");
    const version = await versions.getById(teamId, req.params.versionId as string);
    if (!version) throw notFound("版本不存在");
    res.json(toTeenxVersionView(version));
  });

  router.get("/teams/:teamId/activity", async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const team = await companies.getById(teamId);
    if (!team) throw notFound("队伍不存在");
    if (team.defaultResponsibleUserId !== captainId) throw forbidden("只能看自己的队伍");
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 100;
    const entries = await activity.list({
      companyId: teamId,
      limit,
      genericIssueReadScope: { captainId },
    });
    res.json(entries.map(toTeenxActivityView));
  });

  router.post("/teams/:teamId/test-runs", validate(createTestRunSchema), async (req, res) => {
    const captainId = assertCaptain(req);
    const teamId = req.params.teamId as string;
    const actor = getActorInfo(req);
    const result = await testRuns.launch({
      captainId,
      teamId,
      testTaskSlug: req.body.testTaskSlug,
      actor,
    });
    res.status(201).json(result);
  });

  router.get("/test-runs/:runId", async (req, res) => {
    const captainId = assertCaptain(req);
    const runId = req.params.runId as string;
    res.json(await testRuns.inspect(captainId, runId));
  });

  return router;
}
