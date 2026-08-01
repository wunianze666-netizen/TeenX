import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  isTeenxChildBrowserRouteAllowed,
  teenxChildApiBoundary,
} from "../middleware/teenx-child-api-boundary.js";
import type { TeenxChildConfig } from "../teenx-child-config.js";

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const SUBMISSION_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const VERSION_ID = "v1-1721865600000";
const PUBLIC_ID = `captain_v1_${"a".repeat(43)}`;
const CHALLENGE_VERSION_ID = "todo-web:v1";

describe("TeenX child API boundary", () => {
  it("allows audited browser pairs while denying unsafe ADVX and operator routes", async () => {
    // Given: an interactive browser session behind the enabled boundary.
    const app = createBoundaryApp({
      type: "board",
      source: "session",
      userId: "raw-user-id",
      sessionId: "session-id",
    });

    // When: audited and representative unsafe routes are requested.
    const allowed = await request(app).get(`/api/advx/teams/${TEAM_ID}/members`);
    const arena = await request(app).get(`/api/advx/arena/runs/${RUN_ID}/result`);
    const denied = await Promise.all([
      request(app).get("/api/advx/captain"),
      request(app).post("/api/advx/captain/claim"),
      request(app).get(`/api/companies/${TEAM_ID}/costs/summary`),
      request(app).get(`/api/companies/${TEAM_ID}/approvals`),
      request(app).get(`/api/companies/${TEAM_ID}/secrets`),
      request(app).get("/api/adapters/process/config-schema"),
      request(app).get(`/api/companies/${TEAM_ID}/users/captain/profile`),
      request(app).get("/llms/provider"),
      request(app).post("/mcp"),
      request(app).get("/plugins/example.js"),
    ]);

    // Then: only audited browser requests reach downstream routing.
    expect(allowed.status).toBe(204);
    expect(arena.status).toBe(204);
    for (const response of denied) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: "TEENX_CHILD_API_DENIED" });
    }
  });

  it("fully denies board keys even on an audited route", async () => {
    // Given: a valid board-key actor behind the enabled boundary.
    const app = createBoundaryApp({
      type: "board",
      source: "board_key",
      userId: "raw-user-id",
      keyId: "board-key-id",
    });

    // When: the actor requests an otherwise allowed route.
    const response = await request(app).get("/api/advx/teams");

    // Then: board-key access fails with the stable boundary code.
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "TeenX child API access denied",
      code: "TEENX_CHILD_API_DENIED",
    });
  });

  it.each(["agent_key", "agent_jwt"] as const)(
    "preserves coherent %s access to core agent APIs while isolating browser routes",
    async (source) => {
      // Given: an agent credential behind the enabled boundary.
      const app = createBoundaryApp(agentActor(source));

      // When: a core agent route and browser identity routes are requested.
      const downstream = await request(app).get("/api/issues");
      const isolated = await Promise.all([
        request(app).get("/api/advx/session"),
        request(app).get("/api/advx/me"),
        request(app).get(`/api/advx/captains/${PUBLIC_ID}/profile`),
        request(app).get("/api/advx/me/privacy"),
        request(app).get("/api/advx/me/contacts"),
        request(app).get("/api/advx/forum/session"),
        request(app).get("/api/advx/sso/discourse-connect"),
        request(app).get("/api/auth/get-session"),
        request(app).post("/api/auth/sign-in/email"),
        request(app).patch("/api/auth/profile"),
      ]);

      // Then: downstream authorization remains authoritative outside isolated browser routes.
      expect(downstream.status).toBe(204);
      for (const response of isolated) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ code: "TEENX_CHILD_API_DENIED" });
      }
    },
  );

  it.each([
    { type: "board", source: "session", userId: "raw-user-id" },
    { type: "board", source: "agent_key", userId: "raw-user-id", keyId: "key-id" },
    { type: "agent", source: "agent_key", agentId: "agent-id", companyId: TEAM_ID },
    { type: "none", source: "session" },
  ] satisfies readonly Express.Request["actor"][])(
    "rejects incoherent actor type/source state %#",
    async (actor) => {
      // Given: an actor shape that actorMiddleware never emits.
      const app = createBoundaryApp(actor);

      // When: it requests a public child endpoint.
      const response = await request(app).get("/api/advx/session");

      // Then: the boundary fails closed before routing.
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: "TEENX_CHILD_API_DENIED" });
    },
  );

  it("allows only the redacted session endpoint to an anonymous actor", async () => {
    // Given: the coherent anonymous actor emitted by actorMiddleware.
    const app = createBoundaryApp({ type: "none", source: "none" });

    // When: redacted and raw session endpoints are requested.
    const redacted = await request(app).get("/api/advx/session");
    const raw = await request(app).get("/api/auth/get-session");

    // Then: only the redacted endpoint reaches its handler.
    expect(redacted.status).toBe(204);
    expect(raw.status).toBe(403);
  });

  it("rejects encoded and traversal-ambiguous request targets", async () => {
    // Given: a coherent interactive session behind the boundary.
    const app = createBoundaryApp({
      type: "board",
      source: "session",
      userId: "raw-user-id",
      sessionId: "session-id",
    });

    // When: encoded and traversal targets are requested.
    const encoded = await request(app).get("/api%2Fadvx%2Fme");
    const traversal = await request(app).get("/api/advx/../costs");

    // Then: neither ambiguous target reaches routing.
    expect(encoded.status).toBe(403);
    expect(traversal.status).toBe(403);
  });

  it("requires the local implicit opt-in and otherwise remains disabled by default", async () => {
    // Given: local actors behind denied, allowed, and disabled boundary configurations.
    const actor = { type: "board" as const, source: "local_implicit" as const, userId: "local-board" };
    const denied = createBoundaryApp(actor);
    const allowed = createBoundaryApp(actor, { allowLocalImplicit: true });
    const disabled = createBoundaryApp(actor, { enabled: false });

    // When: each actor requests an audited Studio route.
    const deniedResponse = await request(denied).get("/api/advx/teams");
    const allowedResponse = await request(allowed).get("/api/advx/teams");
    const disabledResponse = await request(disabled).get("/api/adapters");

    // Then: only explicit local access or a disabled boundary reaches downstream routing.
    expect(deniedResponse.status).toBe(403);
    expect(allowedResponse.status).toBe(204);
    expect(disabledResponse.status).toBe(204);
  });

  it("anchors method and path rules against close variants", () => {
    // Given: audited and ambiguous method/path pairs.
    const allowed = [
      ["GET", "/api/advx/session", true],
      ["GET", "/api/auth/callback/credentials/sign-in", true],
      ["GET", `/api/advx/teams/${TEAM_ID}/versions/${VERSION_ID}`, true],
      ["PATCH", `/api/advx/teams/${TEAM_ID}/members/${MEMBER_ID}`, true],
      ["GET", `/api/advx/captains/${PUBLIC_ID}/profile`, true],
      ["PATCH", `/api/advx/contact-requests/${REQUEST_ID}`, true],
      ["GET", `/api/advx/arena/challenges/${CHALLENGE_VERSION_ID}`, true],
      ["POST", `/api/advx/arena/challenges/${CHALLENGE_VERSION_ID}/submissions`, true],
      ["POST", `/api/advx/arena/submissions/${SUBMISSION_ID}/runs`, true],
      ["GET", `/api/advx/arena/runs/${RUN_ID}/events`, true],
    ] as const;
    const denied = [
      ["GET", "/api/advx/teams/team-1", false],
      ["GET", `/api/advx/teams/${TEAM_ID}.extra`, false],
      ["GET", "/api/advx/arena/challenges/todo-web-v1", false],
      ["GET", `/api/advx/arena/challenges/${CHALLENGE_VERSION_ID}/extra`, false],
      ["POST", `/api/advx/arena/runs/${RUN_ID}/events`, false],
      ["GET", `/api/advx/teams/${TEAM_ID}/members/`, false],
      ["GET", `/api/advx/teams/${TEAM_ID}/members/${MEMBER_ID}/extra`, false],
      ["GET", `/api/companies/${TEAM_ID}`, false],
    ] as const;

    // When/Then: only exact audited pairs match.
    for (const [method, path, expected] of [...allowed, ...denied]) {
      expect(isTeenxChildBrowserRouteAllowed(method, path), `${method} ${path}`).toBe(expected);
    }
  });
});

function createBoundaryApp(
  actor: Express.Request["actor"],
  overrides: Partial<TeenxChildConfig> = {},
) {
  const app = express();
  app.use((request, _response, next) => {
    request.actor = actor;
    next();
  });
  app.use(teenxChildApiBoundary({ enabled: true, allowLocalImplicit: false, ...overrides }));
  app.all(/.*/, (_request, response) => response.status(204).end());
  return app;
}

function agentActor(source: "agent_key" | "agent_jwt"): Express.Request["actor"] {
  return source === "agent_key"
    ? {
      type: "agent",
      source,
      agentId: "agent-id",
      companyId: TEAM_ID,
      keyId: "agent-key-id",
    }
    : {
      type: "agent",
      source,
      agentId: "agent-id",
      companyId: TEAM_ID,
      runId: RUN_ID,
    };
}
