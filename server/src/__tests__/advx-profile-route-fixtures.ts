import express from "express";
import { vi } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import { advxProfileRoutes, type TeenxProfileRouteDependencies } from "../routes/advx-profile.js";
import { advxProfileSsoRoutes } from "../routes/advx-profile-sso.js";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import { encodedSecret } from "./teenx-profile-test-fixtures.js";

export function targetIdentity() {
  return createTeenxPublicIdentity("raw-user-id", encodedSecret("public-id"));
}

export function sessionActor(userId = "raw-user-id") {
  return {
    type: "board" as const,
    source: "session" as const,
    userId,
    sessionId: "session-1",
  };
}

export function fixtures(): TeenxProfileRouteDependencies {
  const identity = targetIdentity();
  return {
    config: {
      enabled: true,
      childMode: true,
      allowLocalFixture: false,
      publicIdSecret: encodedSecret("public-id"),
      bridgeBaseUrl: new URL("https://profile.internal.teenx.example"),
      bridgeSecret: encodedSecret("profile-bridge"),
      bridgeKeyId: "paperclip-primary",
      bridgeTimeoutMs: 5_000,
      publicIdCacheTtlMs: 30_000,
      publicIdScanCap: 10_000,
      ssoMaintenanceLock: false,
      discourseBaseUrl: new URL("https://forum.teenx.example"),
      discourseConnectSecret: encodedSecret("discourse-connect"),
    },
    directory: { resolve: vi.fn(async () => ({
      captainId: "raw-user-id",
      teamId: "team-internal",
      teamName: "安全队伍",
      teamCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    })) },
    store: {
      getCaptain: vi.fn(async () => ({ captainId: "raw-user-id", nickname: "安全昵称", joinedAt: new Date("2026-01-01T00:00:00.000Z") })),
      updateNickname: vi.fn(async (_captainId, nickname) => ({ captainId: "raw-user-id", nickname, joinedAt: new Date("2026-01-01T00:00:00.000Z") })),
      getTeamSummary: vi.fn(async () => ({ teamId: "team-internal", name: "安全队伍", memberCount: 4, versionCount: 2 })),
      auditIdentityChange: vi.fn(async () => undefined),
      loadEligibleCaptains: vi.fn(async () => []),
      getTestRunCount: vi.fn(async () => 3),
    },
    bridge: {
      request: vi.fn(async (bridgeRequest) => {
        if (bridgeRequest.path === "/profile") {
          return {
            publicId: identity.publicId,
            username: identity.forumUsername,
            avatarPath: "/letter_avatar/tx_target/2/120.png",
            privacy: { showTeam: true, showForumActivity: true, acceptDmRequests: true },
            forum: {
              topicCount: 1,
              recentTopics: [{ id: "topic-1", title: "安全主题", createdAt: "2026-07-25T00:00:00.000Z", path: "/t/safe-topic/1" }],
            },
            viewerActions: {
              isSelf: true,
              contactState: "available",
              canRequestDm: true,
              canRespond: false,
              canMessage: false,
              canBlock: false,
              canUnblock: false,
              requestId: null,
              forumMessagePath: null,
            },
          };
        }
        return { ok: true };
      }),
    },
  };
}

export function createApp(dependencies: TeenxProfileRouteDependencies, actor: Express.Request["actor"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api/advx", advxProfileSsoRoutes(dependencies));
  app.use("/api/advx", advxProfileRoutes(dependencies));
  app.use(errorHandler);
  return app;
}
