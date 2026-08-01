import { randomUUID } from "node:crypto";
import express, { type Request } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { activityLog, agents, companies, createDb } from "@paperclipai/db";
import { errorHandler } from "../middleware/error-handler.js";
import { advxRoutes } from "../routes/advx.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const CAPTAIN_ID = "advx-studio-captain";
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

type Db = ReturnType<typeof createDb>;

function createApp(db: Db, teamIds: string[]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = {
      type: "board",
      source: "local_implicit",
      userId: CAPTAIN_ID,
      companyIds: teamIds,
      isInstanceAdmin: true,
    } satisfies Request["actor"];
    next();
  });
  app.use("/api/advx", advxRoutes(db));
  app.use(errorHandler);
  return app;
}

async function seedTeamPair(db: Db) {
  const primaryTeamId = randomUUID();
  const foreignTeamId = randomUUID();
  const deletableMemberId = randomUUID();
  const retainedMemberId = randomUUID();
  const foreignMemberId = randomUUID();

  await db.insert(companies).values([
    {
      id: primaryTeamId,
      name: "Primary Team",
      issuePrefix: `A${primaryTeamId.replaceAll("-", "").slice(0, 6).toUpperCase()}`,
      defaultResponsibleUserId: CAPTAIN_ID,
    },
    {
      id: foreignTeamId,
      name: "Foreign Team",
      issuePrefix: `B${foreignTeamId.replaceAll("-", "").slice(0, 6).toUpperCase()}`,
      defaultResponsibleUserId: CAPTAIN_ID,
    },
  ]);
  await db.insert(agents).values([
    {
      id: deletableMemberId,
      companyId: primaryTeamId,
      name: "Primary Builder",
      role: "builder",
    },
    {
      id: retainedMemberId,
      companyId: primaryTeamId,
      name: "Primary Critic",
      role: "critic",
    },
    {
      id: foreignMemberId,
      companyId: foreignTeamId,
      name: "Foreign Builder",
      role: "builder",
    },
  ]);

  return {
    primaryTeamId,
    foreignTeamId,
    deletableMemberId,
    retainedMemberId,
    foreignMemberId,
  };
}

describeEmbeddedPostgres("ADVX Studio member DELETE routes", () => {
  let db: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-advx-studio-member-delete-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("returns 404 without mutation or activity when the member belongs to another Team", async () => {
    // Given
    const fixture = await seedTeamPair(db);
    const expectedTeamIds = [fixture.primaryTeamId, fixture.foreignTeamId].sort();
    const expectedMemberIds = [
      fixture.deletableMemberId,
      fixture.retainedMemberId,
      fixture.foreignMemberId,
    ].sort();

    // When
    const response = await request(createApp(db, expectedTeamIds))
      .delete(`/api/advx/teams/${fixture.primaryTeamId}/members/${fixture.foreignMemberId}`);

    // Then
    const teamIds = (await db.select({ id: companies.id }).from(companies)).map(({ id }) => id).sort();
    const memberIds = (await db.select({ id: agents.id }).from(agents)).map(({ id }) => id).sort();
    const activityActions = (await db.select({ action: activityLog.action }).from(activityLog))
      .map(({ action }) => action);
    expect({ status: response.status, teamIds, memberIds, activityActions }).toEqual({
      status: 404,
      teamIds: expectedTeamIds,
      memberIds: expectedMemberIds,
      activityActions: [],
    });
  });

  it("deletes a member from the requested Team and records the activity", async () => {
    // Given
    const fixture = await seedTeamPair(db);

    // When
    const response = await request(createApp(db, [fixture.primaryTeamId, fixture.foreignTeamId]))
      .delete(`/api/advx/teams/${fixture.primaryTeamId}/members/${fixture.deletableMemberId}`);

    // Then
    const primaryMemberIds = (await db.select({ id: agents.id }).from(agents)
      .where(eq(agents.companyId, fixture.primaryTeamId))).map(({ id }) => id);
    const activities = await db.select({
      companyId: activityLog.companyId,
      action: activityLog.action,
      entityId: activityLog.entityId,
    }).from(activityLog);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(primaryMemberIds).toEqual([fixture.retainedMemberId]);
    expect(activities).toEqual([{
      companyId: fixture.primaryTeamId,
      action: "agent.deleted",
      entityId: fixture.deletableMemberId,
    }]);
  });

  it("returns 409 without mutation or activity when the Team has one member", async () => {
    // Given
    const fixture = await seedTeamPair(db);
    await db.delete(agents).where(eq(agents.id, fixture.retainedMemberId));

    // When
    const response = await request(createApp(db, [fixture.primaryTeamId, fixture.foreignTeamId]))
      .delete(`/api/advx/teams/${fixture.primaryTeamId}/members/${fixture.deletableMemberId}`);

    // Then
    const member = await db.select({ id: agents.id }).from(agents)
      .where(eq(agents.id, fixture.deletableMemberId));
    const activities = await db.select().from(activityLog);
    expect(response.status).toBe(409);
    expect(member).toEqual([{ id: fixture.deletableMemberId }]);
    expect(activities).toEqual([]);
  });
});
