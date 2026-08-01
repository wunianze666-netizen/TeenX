import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { teenxChildApiBoundary } from "../middleware/teenx-child-api-boundary.js";
import type { TeenxChildConfig } from "../teenx-child-config.js";

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

describe("TeenX child API gate compatibility coverage", () => {
  it("allows only exact audited interactive paths", async () => {
    // Given: a coherent authenticated child session.
    const app = createApp(sessionActor());
    // When: audited and unsafe paths are requested.
    const allowed = await request(app).get(`/api/advx/teams/${TEAM_ID}/members`);
    const arena = await request(app).get(`/api/advx/arena/runs/${RUN_ID}/result`);
    const unsafe = await Promise.all([
      request(app).post(`/api/advx/arena/runs/${RUN_ID}/events`),
      request(app).post("/api/advx/me"),
      request(app).get("/api/costs"),
      request(app).get("/llms/provider"),
      request(app).post("/mcp"),
      request(app).get("/plugins/example.js"),
    ]);
    // Then: only exact audited pairs continue.
    expect(allowed.status).toBe(204);
    expect(arena.status).toBe(204);
    for (const response of unsafe) expect(response.status).toBe(403);
  });

  it("allows the redacted session but not raw session data to an anonymous actor", async () => {
    // Given: the coherent anonymous actor.
    const app = createApp({ type: "none", source: "none" });
    // When: public, redacted, raw, and protected routes are requested.
    const responses = await Promise.all([
      request(app).get("/api/health"),
      request(app).post("/api/auth/sign-in/email"),
      request(app).post("/api/auth/sign-out"),
      request(app).get("/api/advx/session"),
      request(app).get("/api/auth/get-session"),
      request(app).get("/api/advx/me"),
    ]);
    // Then: only public routes and the redacted session continue.
    expect(responses.map((response) => response.status)).toEqual([204, 204, 204, 204, 403, 403]);
  });

  it.each(["board_key", "cloud_tenant"] as const)("fully rejects %s actors", async (source) => {
    // Given: a coherent non-interactive board credential.
    const app = createApp({ type: "board", source, userId: "user-id", keyId: "key-id" });
    // When: it requests an audited route.
    const response = await request(app).get("/api/advx/me");
    // Then: the boundary rejects it.
    expect(response.status).toBe(403);
  });

  it.each(["agent_key", "agent_jwt"] as const)("limits %s to enumerated runtime routes", async (source) => {
    // Given: a coherent agent credential.
    const app = createApp(agentActor(source));
    // When: core, Profile, and operator routes are requested.
    const core = await request(app).get("/api/issues");
    const denied = await Promise.all([
      request(app).get("/api/advx/session"),
      request(app).get("/api/advx/sso/discourse-connect"),
      request(app).patch("/api/auth/profile"),
      request(app).get("/api/companies"),
    ]);
    // Then: only the explicit runtime route continues.
    expect(core.status).toBe(204);
    for (const response of denied) expect(response.status).toBe(403);
  });

  it("rejects encoded and traversal-ambiguous paths", async () => {
    // Given: a coherent interactive session.
    const app = createApp(sessionActor());
    // When: ambiguous request targets are sent.
    const encoded = await request(app).get("/api%2Fadvx%2Fme");
    const traversal = await request(app).get("/api/advx/../costs");
    // Then: both fail closed.
    expect(encoded.status).toBe(403);
    expect(traversal.status).toBe(403);
  });

  it("requires explicit local implicit permission", async () => {
    // Given: local fixtures with and without the opt-in.
    const actor = { type: "board" as const, source: "local_implicit" as const, userId: "local-board" };
    // When: both request an audited route.
    const denied = await request(createApp(actor)).get("/api/advx/teams");
    const allowed = await request(createApp(actor, { allowLocalImplicit: true })).get("/api/advx/teams");
    // Then: only the opted-in fixture continues.
    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(204);
  });
});

function createApp(actor: Express.Request["actor"], overrides: Partial<TeenxChildConfig> = {}) {
  const app = express();
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use(teenxChildApiBoundary({ enabled: true, allowLocalImplicit: false, ...overrides }));
  app.all(/.*/, (_req, res) => res.status(204).end());
  return app;
}

function sessionActor(): Express.Request["actor"] {
  return { type: "board", source: "session", userId: "user-id", sessionId: "session-id" };
}

function agentActor(source: "agent_key" | "agent_jwt"): Express.Request["actor"] {
  return source === "agent_key"
    ? { type: "agent", source, agentId: "agent-id", companyId: TEAM_ID, keyId: "key-id" }
    : { type: "agent", source, agentId: "agent-id", companyId: TEAM_ID, runId: RUN_ID };
}
