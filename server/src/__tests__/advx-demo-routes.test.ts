import express, { type Request } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import { advxRoutes } from "../routes/advx.js";
import { advxDemoRoutes } from "../routes/advx-demo.js";
import type { AdvxServerProfile } from "../services/advx-demo/profile.js";
import type { AdvxDemoService } from "../services/advx-demo/service.js";
import { canonicalPublicScore } from "./advx-arena-score-fixtures.js";

const CAPTAIN_ID = "prepared-demo-captain";

function demoService(): AdvxDemoService {
  return {
    bootstrap: vi.fn(async () => ({
      profile: "prepared_demo" as const,
      team: {
        id: "team-1",
        name: "Todo Makers",
        description: null,
        status: "active",
        memberCount: 1,
        versionCount: 0,
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
      },
      members: [{
        id: "member-1",
        teamId: "team-1",
        name: "搭建员",
        roleTemplate: "builder",
        title: "搭建员",
        status: "idle",
        responsibilities: "Build the Todo demo",
        tools: ["write-code"],
        skills: [],
        collaboration: { reportsTo: null, canDelegateTo: [] },
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
      }],
      created: true,
    })),
    community: vi.fn(async () => ({
      profile: "prepared_demo" as const,
      mode: "local_demo" as const,
      currentUser: { username: "demo_captain", displayName: "小创" },
      stats: { topicCount: 3, postCount: 22, bookmarkCount: 2, unreadMessages: 1 },
      categories: [
        { id: "showcase", name: "作品展示", topicCount: 1 },
        { id: "build-log", name: "制作日志", topicCount: 1 },
        { id: "help", name: "互助问答", topicCount: 1 },
      ],
      topics: [{
        id: "topic-1",
        categoryId: "showcase",
        title: "Todo Makers",
        excerpt: "Demo topic",
        author: "Todo Makers",
        replyCount: 6,
        viewCount: 128,
        createdAt: "2026-07-31T10:20:00.000Z",
        tags: ["Web"],
        featured: true,
      }],
      bookmarks: ["topic-1"],
    })),
    leaderboard: vi.fn(async () => ({
      profile: "prepared_demo" as const,
      mode: "prepared_fixture" as const,
      official: false as const,
      challenge: { challengeVersionId: "todo-web:v1", title: "Todo Web", totalMaxScore: 1000 },
      entries: [{
        rank: 1,
        teamId: "team-1",
        teamName: "Todo Makers",
        score: 894,
        completedAt: "2026-07-25T00:00:00.000Z",
        isCurrent: true,
      }],
      currentTeamRank: 1,
    })),
    createPreparedSubmission: vi.fn(async () => ({
      submission: {
        id: "submission-1",
        challengeVersionId: "todo-web:v1",
        teamVersionId: "version-1",
        boundTeamVersion: {
          id: "version-1",
          versionNumber: 1,
          label: "Prepared Todo Demo",
          teamName: "Todo Makers",
          createdAt: "2026-07-25T00:00:00.000Z",
        },
        filename: "todo-demo.zip",
        byteSize: 8755,
        sha256: "8c9c22f4478de9cb56f9137f6fd1324f6267dc93312aeeafe6ed27c5a7b179b4",
        createdAt: "2026-07-25T00:00:00.000Z",
        autoCreatedTeamVersion: true,
        run: null,
      },
      run: { runId: "run-1", status: "queued" as const, reused: false },
    })),
    replay: vi.fn(async () => ({
      profile: "prepared_replay",
      fixtureId: "todo-web-v1-r1",
      fixtureRevision: "r1",
      challengeVersionId: "todo-web:v1",
      submissionSha256: "8c9c22f4478de9cb56f9137f6fd1324f6267dc93312aeeafe6ed27c5a7b179b4",
      official: false,
      aiInvoked: false,
      studioGenerated: false,
      result: {
        ...canonicalPublicScore(),
        totalScore: 894,
        submissionSha256: "8c9c22f4478de9cb56f9137f6fd1324f6267dc93312aeeafe6ed27c5a7b179b4",
      },
    })),
  };
}

function createApp(profile: AdvxServerProfile, service: AdvxDemoService) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = {
      type: "board",
      source: "local_implicit",
      userId: CAPTAIN_ID,
      companyIds: [],
      isInstanceAdmin: true,
    } satisfies Request["actor"];
    next();
  });
  app.use("/api/advx/demo", advxDemoRoutes(profile, service));
  app.use(errorHandler);
  return app;
}

describe("ADVX prepared Demo routes", () => {
  it.each([
    { profile: "real", enabled: false },
    { profile: "prepared_demo", enabled: true },
    { profile: "prepared_replay", enabled: true },
  ] as const)("reports only the server profile and readiness for $profile", async ({ profile, enabled }) => {
    // Given: the server-selected ADVX profile.
    const app = express();
    app.use("/api/advx", advxRoutes({} as never, { profile }));

    // When: readiness inspects the public-safe Demo status.
    const response = await request(app).get("/api/advx/demo/status");

    // Then: no configuration, path, or provider detail crosses the boundary.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ profile, enabled });
  });

  it("bootstraps from the authenticated Captain without client-selected behavior", async () => {
    // Given: a prepared Demo server and an empty request body.
    const service = demoService();

    // When: the local Captain requests bootstrap.
    const response = await request(createApp("prepared_demo", service))
      .post("/api/advx/demo/bootstrap")
      .send({});

    // Then: the server derives the Captain and profile itself.
    expect(response.status).toBe(200);
    expect(service.bootstrap).toHaveBeenCalledWith(CAPTAIN_ID);
  });

  it("rejects client attempts to select a profile or prepared fixture", async () => {
    // Given: a prepared Demo server and forbidden selection fields.
    const service = demoService();

    // When: the client attempts to override server-owned behavior.
    const response = await request(createApp("prepared_demo", service))
      .post("/api/advx/demo/prepared-submission")
      .send({ profile: "prepared_replay", fixtureId: "other" });

    // Then: strict boundary parsing rejects the request before persistence.
    expect(response.status).toBe(400);
    expect(service.createPreparedSubmission).not.toHaveBeenCalled();
  });

  it("serves offline community and leaderboard data only from a prepared profile", async () => {
    const service = demoService();

    const [community, leaderboard] = await Promise.all([
      request(createApp("prepared_demo", service)).get("/api/advx/demo/community"),
      request(createApp("prepared_demo", service)).get("/api/advx/demo/leaderboard"),
    ]);

    expect(community.status).toBe(200);
    expect(community.body).toMatchObject({
      mode: "local_demo",
      currentUser: { username: "demo_captain", displayName: "小创" },
      stats: { topicCount: 3 },
      categories: [
        { id: "showcase", topicCount: 1 },
        { id: "build-log", topicCount: 1 },
        { id: "help", topicCount: 1 },
      ],
    });
    expect(leaderboard.status).toBe(200);
    expect(leaderboard.body).toMatchObject({ mode: "prepared_fixture", official: false, currentTeamRank: 1 });
    expect(service.community).toHaveBeenCalledWith(CAPTAIN_ID);
    expect(service.leaderboard).toHaveBeenCalledWith(CAPTAIN_ID);
  });

  it("allows prepared submission creation only in prepared_demo", async () => {
    // Given: the explicit replay-only profile.
    const service = demoService();

    // When: a Captain requests a live prepared submission.
    const response = await request(createApp("prepared_replay", service))
      .post("/api/advx/demo/prepared-submission")
      .send({});

    // Then: the route fails closed without invoking the Arena lifecycle.
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "ADVX_DEMO_PROFILE_MISMATCH" });
    expect(service.createPreparedSubmission).not.toHaveBeenCalled();
  });

  it("allows fixture-backed replay only in prepared_replay", async () => {
    // Given: the explicit replay profile and its public fixture projection.
    const service = demoService();

    // When: the Captain reads the prepared replay.
    const response = await request(createApp("prepared_replay", service))
      .get("/api/advx/demo/replay");

    // Then: replay is non-official and contains no internal transport fields.
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      profile: "prepared_replay",
      official: false,
      aiInvoked: false,
      studioGenerated: false,
      result: { totalScore: 894, totalMaxScore: 1000, official: false },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/checkpoint|objectKey|modelEndpoint|tokenUsage|cost/i);
  });

  it("keeps every mutating Demo capability disabled in real", async () => {
    // Given: the unchanged real server profile.
    const service = demoService();

    // When: a client probes a prepared-only mutation.
    const response = await request(createApp("real", service))
      .post("/api/advx/demo/bootstrap")
      .send({});

    // Then: real never falls back to prepared fixture behavior.
    expect(response.status).toBe(404);
    expect(service.bootstrap).not.toHaveBeenCalled();
  });

  it("keeps demo community and leaderboard projections disabled in real", async () => {
    const service = demoService();

    const [community, leaderboard] = await Promise.all([
      request(createApp("real", service)).get("/api/advx/demo/community"),
      request(createApp("real", service)).get("/api/advx/demo/leaderboard"),
    ]);

    expect(community.status).toBe(404);
    expect(leaderboard.status).toBe(404);
    expect(service.community).not.toHaveBeenCalled();
    expect(service.leaderboard).not.toHaveBeenCalled();
  });

  it("provides local privacy and empty contact projections only in a prepared profile", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.actor = {
        type: "board",
        source: "local_implicit",
        userId: CAPTAIN_ID,
        companyIds: [],
        isInstanceAdmin: true,
      } satisfies Request["actor"];
      next();
    });
    app.use("/api/advx", advxRoutes({} as never, { profile: "prepared_demo" }));
    app.use(errorHandler);

    const privacy = await request(app).get("/api/advx/me/privacy");
    const [savedPrivacy, inbox, contacts] = await Promise.all([
      request(app).patch("/api/advx/me/privacy").send({ showTeam: false, showForumActivity: true, acceptDmRequests: false }),
      request(app).get("/api/advx/me/contact-requests?box=inbox"),
      request(app).get("/api/advx/me/contacts?limit=50"),
    ]);

    expect(privacy.body).toEqual({ showTeam: true, showForumActivity: true, acceptDmRequests: false });
    expect(savedPrivacy.body).toEqual({ showTeam: false, showForumActivity: true, acceptDmRequests: false });
    expect(inbox.body).toEqual({ items: [], nextCursor: null });
    expect(contacts.body).toEqual({ items: [], nextCursor: null });
  });
});
