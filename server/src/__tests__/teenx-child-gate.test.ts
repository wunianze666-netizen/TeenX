import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { teenxChildApiBoundary } from "../middleware/teenx-child-api-boundary.js";
import { readTeenxProfileConfig } from "../services/teenx-profile-config.js";
import type { TeenxChildConfig } from "../teenx-child-config.js";

const COMPLETE_ENV = {
  NODE_ENV: "production",
  TEENX_PROFILE_PUBLIC_ID_SECRET: encodedSecret("public-id"),
  TEENX_PROFILE_BRIDGE_BASE_URL: "https://profile.internal.teenx.example",
  TEENX_PROFILE_BRIDGE_SECRET: encodedSecret("profile-bridge"),
  TEENX_PROFILE_BRIDGE_KEY_ID: "paperclip-primary",
  TEENX_DISCOURSE_BASE_URL: "https://forum.teenx.example",
  TEENX_DISCOURSE_CONNECT_SECRET: encodedSecret("discourse-connect"),
  TEENX_PROFILE_SSO_MAINTENANCE_LOCK: "true",
} satisfies NodeJS.ProcessEnv;

describe("TeenX Profile configuration compatibility coverage", () => {
  it("fails startup when child mode lacks persistent identity material", () => {
    // Given: enabled child mode without its public identity secret.
    const env = { ...COMPLETE_ENV };
    delete env.TEENX_PROFILE_PUBLIC_ID_SECRET;
    // When/Then: Profile parsing fails closed.
    expect(() => readTeenxProfileConfig(env, enabledConfig(), productionDeployment())).toThrow(/PUBLIC_ID_SECRET/);
  });

  it("rejects local fixture authentication in production", () => {
    // Given: a production child deployment with local implicit enabled.
    const config = { enabled: true, allowLocalImplicit: true } as const;
    // When/Then: Profile parsing applies the production fixture prohibition.
    expect(() => readTeenxProfileConfig(COMPLETE_ENV, config, {
      deploymentMode: "local_trusted", deploymentExposure: "private",
    })).toThrow(/non-production/);
  });

  it("requires authenticated deployment without a local fixture", () => {
    // Given: enabled child mode on a private local deployment.
    const env = { ...COMPLETE_ENV, NODE_ENV: "development" };
    // When/Then: Profile parsing rejects the invalid deployment mode.
    expect(() => readTeenxProfileConfig(env, enabledConfig(), {
      deploymentMode: "local_trusted", deploymentExposure: "private",
    })).toThrow(/authenticated public/);
  });
});

describe("TeenX child boundary compatibility coverage", () => {
  it("allows only audited method and path pairs", async () => {
    // Given: a coherent session actor.
    const app = createApp(sessionActor());
    // When: one audited and representative unsafe paths are requested.
    const allowed = await request(app).get("/api/advx/me");
    const denied = await Promise.all([
      request(app).post("/api/advx/me"),
      request(app).get("/api/costs"),
      request(app).get("/llms/provider"),
      request(app).post("/mcp"),
      request(app).get("/plugins/example.js"),
    ]);
    // Then: only the audited pair continues.
    expect(allowed.status).toBe(204);
    for (const response of denied) expect(response.status).toBe(403);
  });

  it("allows minimal authentication and the redacted anonymous session", async () => {
    // Given: a coherent anonymous actor.
    const app = createApp({ type: "none", source: "none" });
    // When: public and raw authentication routes are requested.
    const signIn = await request(app).post("/api/auth/sign-in/email");
    const signOut = await request(app).post("/api/auth/sign-out");
    const redacted = await request(app).get("/api/advx/session");
    const raw = await request(app).get("/api/auth/get-session");
    // Then: minimal auth and redacted session continue while raw session fails.
    expect([signIn.status, signOut.status, redacted.status, raw.status]).toEqual([204, 204, 204, 403]);
  });

  it.each(["board_key", "cloud_tenant"] as const)("rejects %s actors on audited routes", async (source) => {
    // Given: a coherent non-interactive board actor.
    const app = createApp({ type: "board", source, userId: "user-id", keyId: "key-id" });
    // When: it requests an audited route.
    const response = await request(app).get("/api/advx/me");
    // Then: it is rejected.
    expect(response.status).toBe(403);
  });

  it.each(["agent_key", "agent_jwt"] as const)("isolates Profile from %s actors", async (source) => {
    // Given: a coherent agent actor.
    const actor: Express.Request["actor"] = source === "agent_key"
      ? { type: "agent", source, agentId: "agent-id", companyId: "company-id", keyId: "key-id" }
      : { type: "agent", source, agentId: "agent-id", companyId: "company-id", runId: "run-id" };
    const app = createApp(actor);
    // When: it requests an enumerated runtime route and Profile.
    const core = await request(app).get("/api/issues");
    const profile = await request(app).get("/api/advx/me");
    // Then: only the runtime route continues.
    expect(core.status).toBe(204);
    expect(profile.status).toBe(403);
  });
});

function enabledConfig(): TeenxChildConfig {
  return { enabled: true, allowLocalImplicit: false };
}

function productionDeployment() {
  return { deploymentMode: "authenticated" as const, deploymentExposure: "public" as const };
}

function sessionActor(): Express.Request["actor"] {
  return { type: "board", source: "session", userId: "user-id", sessionId: "session-id" };
}

function createApp(actor: Express.Request["actor"]) {
  const app = express();
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use(teenxChildApiBoundary(enabledConfig()));
  app.all(/.*/, (_req, res) => res.status(204).end());
  return app;
}

function encodedSecret(label: string): string {
  return Buffer.from(`teenx-${label}-independent-secret-material-2026`).toString("base64url");
}
