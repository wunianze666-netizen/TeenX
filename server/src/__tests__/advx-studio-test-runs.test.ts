import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import express, { type Request } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  agentWakeupRequests,
  agents,
  companies,
  createDb,
  heartbeatRuns,
  issues,
  issueWorkProducts,
} from "@paperclipai/db";
import type { AdvxServerProfile } from "../services/advx-demo/profile.js";

const heartbeatHarness = vi.hoisted(() => {
  const state: {
    companyId: string;
    agentId: string;
    issueId: string;
  } = { companyId: "", agentId: "", issueId: "" };
  const runId = "10000000-0000-4000-8000-000000000001";
  const startedAt = new Date("2026-07-25T10:00:00.000Z");
  const finishedAt = new Date("2026-07-25T10:00:01.000Z");
  const wakeup = vi.fn(async (agentId: string, input: { contextSnapshot: Record<string, unknown> }) => {
    state.agentId = agentId;
    state.issueId = String(input.contextSnapshot.issueId);
    return { id: runId };
  });
  const getRun = vi.fn(async (requestedRunId: string) => requestedRunId === runId
    ? {
        id: runId,
        companyId: state.companyId,
        agentId: state.agentId,
        status: "succeeded",
        startedAt,
        finishedAt,
        resultSummary: "Real executor summary",
        contextIssueId: state.issueId,
      }
    : null);
  const factory = vi.fn(() => ({ wakeup, getRun }));
  return { state, runId, startedAt, finishedAt, wakeup, getRun, factory };
});

vi.mock("../services/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/index.js")>();
  return { ...original, heartbeatService: heartbeatHarness.factory };
});

const { errorHandler } = await import("../middleware/error-handler.js");
const { advxRoutes } = await import("../routes/advx.js");
const { advxVersionService } = await import("../services/advx-versions.js");
const {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} = await import("./helpers/embedded-postgres.js");

const CAPTAIN_ID = "advx-studio-test-run-captain";
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;
type Db = ReturnType<typeof createDb>;

function createApp(db: Db, teamId: string, profile?: AdvxServerProfile) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = {
      type: "board",
      source: "local_implicit",
      userId: CAPTAIN_ID,
      companyIds: [teamId],
      isInstanceAdmin: true,
    } satisfies Request["actor"];
    next();
  });
  app.use("/api/advx", advxRoutes(db, profile ? { profile } : undefined));
  app.use(errorHandler);
  return app;
}

async function seedTeam(db: Db) {
  const teamId = randomUUID();
  const agentId = randomUUID();
  await db.insert(companies).values({
    id: teamId,
    name: "Prepared Studio Team",
    issuePrefix: `T${teamId.replaceAll("-", "").slice(0, 6).toUpperCase()}`,
    defaultResponsibleUserId: CAPTAIN_ID,
  });
  await db.insert(agents).values({
    id: agentId,
    companyId: teamId,
    name: "Todo Builder",
    role: "general",
    metadata: {
      roleTemplate: "builder",
      responsibilities: "Build the Todo artifact",
      tools: ["write-code"],
      skills: [],
    },
  });
  return { teamId, agentId };
}

describeEmbeddedPostgres("ADVX Studio test-run execution profiles", () => {
  let db: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let paperclipHome = "";
  const originalPaperclipHome = process.env.PAPERCLIP_HOME;
  const originalInstanceId = process.env.PAPERCLIP_INSTANCE_ID;

  beforeAll(async () => {
    paperclipHome = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-advx-studio-runs-"));
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = "advx-studio-runs-test";
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-advx-studio-test-runs-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    heartbeatHarness.state.companyId = "";
    heartbeatHarness.state.agentId = "";
    heartbeatHarness.state.issueId = "";
    heartbeatHarness.factory.mockClear();
    heartbeatHarness.wakeup.mockClear();
    heartbeatHarness.getRun.mockClear();
    await db.delete(issueWorkProducts);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(heartbeatRuns);
    await db.delete(agentWakeupRequests);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
    await fs.rm(paperclipHome, { recursive: true, force: true });
    if (originalPaperclipHome === undefined) delete process.env.PAPERCLIP_HOME;
    else process.env.PAPERCLIP_HOME = originalPaperclipHome;
    if (originalInstanceId === undefined) delete process.env.PAPERCLIP_INSTANCE_ID;
    else process.env.PAPERCLIP_INSTANCE_ID = originalInstanceId;
  });

  it.each(["prepared_demo", "prepared_replay"] as const)(
    "persists a truthful terminal Todo run without heartbeat in %s",
    async (profile) => {
      // Given: a real Team whose prepared profile is bound to the immutable Todo fixture.
      const { teamId } = await seedTeam(db);

      // When: the Captain launches and inspects the prepared Studio run.
      const launched = await request(createApp(db, teamId, profile))
        .post(`/api/advx/teams/${teamId}/test-runs`)
        .send({ testTaskSlug: "todo-maker" });
      await db.insert(activityLog).values({
        companyId: teamId,
        actorType: "system",
        actorId: "unrelated-test-activity",
        action: "agent.updated",
        entityType: "agent",
        entityId: randomUUID(),
      });
      const inspected = await request(createApp(db, teamId, profile))
        .get(`/api/advx/test-runs/${String(launched.body.runId)}`);
      const demoStatus = await request(createApp(db, teamId, profile)).get("/api/advx/demo/status");

      // Then: persisted records are terminal, inspectable, run-scoped, and explicit about provenance.
      const [run] = await db.select().from(heartbeatRuns)
        .where(eq(heartbeatRuns.id, String(launched.body.runId)));
      const [issue] = await db.select().from(issues)
        .where(eq(issues.executionRunId, String(launched.body.runId)));
      const activities = await db.select().from(activityLog)
        .where(eq(activityLog.runId, String(launched.body.runId)));
      const products = issue
        ? await db.select().from(issueWorkProducts).where(eq(issueWorkProducts.issueId, issue.id))
        : [];
      const teamVersion = await advxVersionService(db).getById(
        teamId,
        String(inspected.body.provenance?.teamVersionId),
      );
      expect(launched.status).toBe(201);
      expect(launched.body).toEqual({ runId: expect.any(String), status: "succeeded" });
      expect(inspected.status).toBe(200);
      expect(demoStatus.body).toEqual({ profile, enabled: true });
      expect(inspected.body).toMatchObject({
        status: "succeeded",
        resultSummary: expect.any(String),
        provenance: {
          profile,
          fixtureId: "todo-web-v1-r1",
          fixtureRevision: "r1",
          challengeVersionId: "todo-web:v1",
          teamVersionId: expect.any(String),
          archiveSha256: "8c9c22f4478de9cb56f9137f6fd1324f6267dc93312aeeafe6ed27c5a7b179b4",
          official: false,
          aiInvoked: false,
          studioGenerated: false,
        },
      });
      expect(inspected.body.activity).toHaveLength(activities.length);
      expect(inspected.body.activity).not.toContainEqual(expect.objectContaining({ action: "agent.updated" }));
      expect(inspected.body.products).toHaveLength(products.length);
      expect(activities.length).toBeGreaterThan(0);
      expect(products.length).toBeGreaterThan(0);
      expect(teamVersion).toMatchObject({
        id: inspected.body.provenance.teamVersionId,
        teamId,
        snapshot: { teamName: "Prepared Studio Team" },
      });
      expect(issue).toMatchObject({ status: "done", executionRunId: run?.id });
      expect(run).toMatchObject({
        status: "succeeded",
        usageJson: null,
        sessionIdBefore: null,
        sessionIdAfter: null,
        logStore: null,
        logRef: null,
        externalRunId: null,
        processPid: null,
        processGroupId: null,
      });
      expect(heartbeatHarness.factory).not.toHaveBeenCalled();
      expect(heartbeatHarness.wakeup).not.toHaveBeenCalled();
    },
  );

  it("rejects a prepared run whose persisted issue belongs to another team", async () => {
    // Given: a valid prepared run whose context is later corrupted to reference another Team's issue.
    const { teamId } = await seedTeam(db);
    const foreignTeamId = randomUUID();
    await db.insert(companies).values({
      id: foreignTeamId,
      name: "Foreign Team",
      issuePrefix: `F${foreignTeamId.replaceAll("-", "").slice(0, 6).toUpperCase()}`,
      defaultResponsibleUserId: "foreign-captain",
    });
    const [foreignIssue] = await db.insert(issues).values({
      companyId: foreignTeamId,
      title: "Foreign issue",
      originKind: "manual",
      createdByUserId: "foreign-captain",
    }).returning();
    const launched = await request(createApp(db, teamId, "prepared_demo"))
      .post(`/api/advx/teams/${teamId}/test-runs`)
      .send({ testTaskSlug: "todo-maker" });
    const [run] = await db.select().from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, String(launched.body.runId)));
    if (!run || !foreignIssue) throw new TypeError("prepared scoping fixture was not persisted");
    await db.update(heartbeatRuns).set({
      contextSnapshot: { ...run.contextSnapshot, issueId: foreignIssue.id },
    }).where(eq(heartbeatRuns.id, run.id));

    // When: the Captain inspects the corrupted run.
    const inspected = await request(createApp(db, teamId, "prepared_demo"))
      .get(`/api/advx/test-runs/${run.id}`);

    // Then: cross-Team issue data is never projected.
    expect(inspected.status).toBe(404);
  });

  it("preserves the real executor heartbeat call and response shape", async () => {
    // Given: the default real profile and a runnable Team member.
    const { teamId, agentId } = await seedTeam(db);
    heartbeatHarness.state.companyId = teamId;

    // When: the Captain launches and inspects a real Studio run.
    const launched = await request(createApp(db, teamId))
      .post(`/api/advx/teams/${teamId}/test-runs`)
      .send({ testTaskSlug: "hello-team" });
    const inspected = await request(createApp(db, teamId))
      .get(`/api/advx/test-runs/${heartbeatHarness.runId}`);

    // Then: wakeup occurs once with the legacy context and both response contracts are unchanged.
    expect(heartbeatHarness.wakeup).toHaveBeenCalledTimes(1);
    expect(heartbeatHarness.wakeup).toHaveBeenCalledWith(agentId, expect.objectContaining({
      source: "on_demand",
      triggerDetail: "manual",
      reason: "advx_test_run",
      contextSnapshot: expect.objectContaining({
        source: "advx_test_run",
        reason: "hello-team",
      }),
    }));
    expect(launched.status).toBe(201);
    expect(launched.body).toEqual({ runId: heartbeatHarness.runId, status: "queued" });
    expect(inspected.status).toBe(200);
    expect(inspected.body).toEqual({
      status: "succeeded",
      startedAt: heartbeatHarness.startedAt.toISOString(),
      finishedAt: heartbeatHarness.finishedAt.toISOString(),
      resultSummary: "Real executor summary",
      activity: [{ action: "issue.created", entityType: "issue", createdAt: expect.any(String) }],
      products: [],
    });
    expect(inspected.body).not.toHaveProperty("provenance");
  });
});
