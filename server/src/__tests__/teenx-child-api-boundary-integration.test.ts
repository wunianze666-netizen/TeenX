import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authUsers, createDb } from "@paperclipai/db";
import { createApp } from "../app.js";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import { createLocalDiskStorageProvider } from "../storage/local-disk-provider.js";
import { createStorageService } from "../storage/service.js";
import type { TeenxChildConfig } from "../teenx-child-config.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("TeenX child API boundary real-app integration", () => {
  let db: ReturnType<typeof createDb> | null = null;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let storageDirectory: string | null = null;

  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TEENX_PROFILE_PUBLIC_ID_SECRET", encodedSecret("public-id"));
    vi.stubEnv("TEENX_PROFILE_BRIDGE_BASE_URL", "https://profile.internal.example.test");
    vi.stubEnv("TEENX_PROFILE_BRIDGE_SECRET", encodedSecret("profile-bridge"));
    vi.stubEnv("TEENX_PROFILE_BRIDGE_KEY_ID", "test-bridge");
    vi.stubEnv("TEENX_PROFILE_SSO_MAINTENANCE_LOCK", "true");
    vi.stubEnv("TEENX_DISCOURSE_BASE_URL", "https://forum.example.test");
    vi.stubEnv("TEENX_DISCOURSE_CONNECT_SECRET", encodedSecret("discourse-connect"));
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-teenx-child-app-");
    db = createDb(tempDb.connectionString);
    const now = new Date("2026-07-25T00:00:00.000Z");
    await db.insert(authUsers).values({
      id: "local-board",
      name: "Local Captain",
      email: "local-captain@teenx.invalid",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });
    storageDirectory = await mkdtemp(path.join(os.tmpdir(), "paperclip-teenx-child-storage-"));
  }, 20_000);

  afterAll(async () => {
    await tempDb?.cleanup();
    if (storageDirectory) await rm(storageDirectory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("enforces the boundary before Better Auth and all downstream app routers", async () => {
    // Given: production apps with child mode enabled and disabled.
    const childApp = await createProductionApp({ enabled: true, allowLocalImplicit: false });
    const disabledApp = await createProductionApp({ enabled: false, allowLocalImplicit: false });

    try {
      // When: anonymous traffic reaches each production app surface.
      const [redactedSession, rawSession, operator, rootLlm, mcp, plugin, disabledRawSession, disabledBetterAuth] = await Promise.all([
        request(childApp).get("/api/advx/session"),
        request(childApp).get("/api/auth/get-session"),
        request(childApp).get("/api/companies"),
        request(childApp).get("/llms/provider"),
        request(childApp).post("/mcp"),
        request(childApp).get("/plugins/example.js"),
        request(disabledApp).get("/api/auth/get-session"),
        request(disabledApp).get("/api/auth/better-auth-probe"),
      ]);

      // Then: only the redacted session reaches its child-mode handler.
      expect(redactedSession.status).toBe(200);
      expect(redactedSession.body).toEqual({ authenticated: false });
      for (const response of [rawSession, operator, rootLlm, mcp, plugin]) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ code: "TEENX_CHILD_API_DENIED" });
      }
      expect(disabledRawSession.status).toBe(401);
      expect(disabledBetterAuth.status).toBe(204);
      expect(childApp.locals.teenxProfileConfig).toBeUndefined();
      expect(disabledApp.locals.teenxProfileConfig).toBeUndefined();
    } finally {
      await childApp.locals.paperclipShutdown();
      await disabledApp.locals.paperclipShutdown();
    }
  });

  it("uses one session contract and mounts safe SSO in child and non-child local apps", async () => {
    // Given: child and normal local development apps with the same explicit Profile trust configuration.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEENX_PROFILE_SSO_MAINTENANCE_LOCK", "false");
    const childApp = await createLocalApp({ enabled: true, allowLocalImplicit: true });
    const normalApp = await createLocalApp({ enabled: false, allowLocalImplicit: false });

    try {
      const incoming = Buffer.from(
        "nonce=nonce-1&return_sso_url=https%3A%2F%2Fforum.example.test%2Fsession%2Fsso_login",
      ).toString("base64");
      const signature = createHmac("sha256", encodedSecret("discourse-connect"))
        .update(incoming)
        .digest("hex");

      // When: both apps resolve session state and the normal app performs Connect SSO.
      const [childSession, normalSession, sso] = await Promise.all([
        request(childApp).get("/api/advx/session").set("Host", "localhost"),
        request(normalApp).get("/api/advx/session").set("Host", "localhost"),
        request(normalApp)
          .get("/api/advx/sso/discourse-connect")
          .set("Host", "localhost")
          .query({ sso: incoming, sig: signature }),
      ]);

      // Then: mode selection cannot change the DTO or hide the safe SSO implementation behind a 404.
      const expectedSession = {
        authenticated: true,
        authMode: "local_demo",
        captain: { nickname: "Local Board" },
      };
      expect(childSession.status).toBe(200);
      expect(childSession.body).toEqual(expectedSession);
      expect(normalSession.status).toBe(200);
      expect(normalSession.body).toEqual(expectedSession);
      expect(sso.status).toBe(302);
      const redirect = new URL(sso.headers.location, "http://localhost");
      const output = new URLSearchParams(
        Buffer.from(redirect.searchParams.get("sso") ?? "", "base64").toString("utf8"),
      );
      expect(output.get("external_id")).toBe(
        createTeenxPublicIdentity("local-board", encodedSecret("public-id")).publicId,
      );
      expect(output.get("admin")).toBe("false");
      expect(output.get("moderator")).toBe("false");
    } finally {
      await childApp.locals.paperclipShutdown();
      await normalApp.locals.paperclipShutdown();
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("TEENX_PROFILE_SSO_MAINTENANCE_LOCK", "true");
    }
  });

  async function createProductionApp(config: TeenxChildConfig) {
    if (!db || !storageDirectory) throw new Error("Test database and storage must be initialized");
    return await createApp(db, {
      uiMode: "static",
      serverPort: 0,
      storageService: createStorageService(createLocalDiskStorageProvider(storageDirectory)),
      deploymentMode: "authenticated",
      deploymentExposure: "public",
      allowedHostnames: [],
      bindHost: "127.0.0.1",
      authReady: true,
      companyDeletionEnabled: false,
      betterAuthHandler: (_request, response) => {
        response.status(204).end();
      },
      managedPluginAutoInstall: [],
      teenxChildConfig: config,
    });
  }

  async function createLocalApp(config: TeenxChildConfig) {
    if (!db || !storageDirectory) throw new Error("Test database and storage must be initialized");
    return await createApp(db, {
      uiMode: "static",
      serverPort: 0,
      storageService: createStorageService(createLocalDiskStorageProvider(storageDirectory)),
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      allowedHostnames: [],
      bindHost: "127.0.0.1",
      authReady: true,
      companyDeletionEnabled: false,
      managedPluginAutoInstall: [],
      teenxChildConfig: config,
    });
  }
});

function encodedSecret(label: string): string {
  return Buffer.from(`teenx-${label}-independent-secret-material-2026`).toString("base64url");
}
