import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { advxSessionRoutes } from "../routes/advx-session.js";

describe("ADVX redacted session route", () => {
  it("returns only the unauthenticated marker without an actor", async () => {
    // Given: the session route with an anonymous actor.
    const app = createApp({ type: "none", source: "none" });

    // When: the browser requests its safe session state.
    const response = await request(app).get("/api/advx/session");

    // Then: no raw session or user identity fields are exposed.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: false });
  });

  it("returns a signed-in nickname without raw identity fields", async () => {
    // Given: a signed-in board actor carrying internal identity fields.
    const app = createApp({
      type: "board",
      source: "session",
      userId: "raw-user-id",
      sessionId: "raw-session-id",
      userName: "  小队长  ",
      userEmail: "private@example.com",
    });

    // When: the browser requests its safe session state.
    const response = await request(app).get("/api/advx/session");

    // Then: the response is the exact redacted DTO.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authenticated: true,
      authMode: "signed_in",
      captain: { nickname: "小队长" },
    });
  });

  it("labels an explicitly admitted local actor as a local demo", async () => {
    // Given: the local implicit actor admitted by the outer child boundary.
    const app = createApp({
      type: "board",
      source: "local_implicit",
      userId: "local-board",
      userName: "Local Board",
    });

    // When: the browser requests its safe session state.
    const response = await request(app).get("/api/advx/session");

    // Then: only the local-demo contract is returned.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authenticated: true,
      authMode: "local_demo",
      captain: { nickname: "Local Board" },
    });
  });

  it.each(["board_key", "agent_key", "agent_jwt", "cloud_tenant"] as const)(
    "rejects the non-browser %s source when mounted without the outer boundary",
    async (source) => {
      // Given: a non-browser credential reaching the route directly.
      const actor = source === "board_key" || source === "cloud_tenant"
        ? { type: "board" as const, source, userId: "raw-user-id" }
        : { type: "agent" as const, source, agentId: "raw-agent-id" };
      const app = createApp(actor);

      // When: the credential requests the browser session DTO.
      const response = await request(app).get("/api/advx/session");

      // Then: the route fails closed with the stable child-boundary code.
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: "TeenX child API access denied",
        code: "TEENX_CHILD_API_DENIED",
      });
    },
  );
});

function createApp(actor: Express.Request["actor"]) {
  const app = express();
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api/advx", advxSessionRoutes());
  return app;
}
