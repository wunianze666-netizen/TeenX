import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTeenxBridgeClient } from "../services/teenx-profile-bridge-client.js";
import { createTeenxPublicDirectory } from "../services/teenx-public-directory.js";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import { createApp, fixtures, sessionActor, targetIdentity } from "./advx-profile-route-fixtures.js";

const degradedProfile = (isSelf: boolean) => ({
  profile: {
    publicId: targetIdentity().publicId,
    nickname: "安全昵称",
    avatarPath: null,
    joinedAt: "2026-01-01T00:00:00.000Z",
  },
  viewerActions: {
    isSelf,
    contactState: "unavailable",
    canRequestDm: false,
    canRespond: false,
    canMessage: false,
    canBlock: false,
    canUnblock: false,
    requestId: null,
    forumMessagePath: null,
  },
});

const bridgeFetch = (handler: () => Promise<Response>): typeof fetch => vi.fn(handler);

const outageCases = [
  {
    name: "transport failure",
    fetchImpl: bridgeFetch(async () => {
      throw new TypeError("private bridge host failed");
    }),
  },
  {
    name: "timeout",
    fetchImpl: bridgeFetch(async () => {
      throw new DOMException("private timeout detail", "TimeoutError");
    }),
  },
  {
    name: "invalid JSON protocol failure",
    fetchImpl: bridgeFetch(async () => new Response("{private-forum-payload", { status: 200 })),
  },
  {
    name: "malformed wire DTO",
    fetchImpl: bridgeFetch(async () => Response.json({ profile: "private-forum-payload" })),
  },
  {
    name: "identity protocol mismatch",
    fetchImpl: bridgeFetch(async () => {
      const otherIdentity = createTeenxPublicIdentity("other-user", fixtures().config.publicIdSecret);
      return Response.json({
        profile: {
          public_id: otherIdentity.publicId,
          username: targetIdentity().forumUsername,
          avatar_path: "/letter_avatar/private/2/120.png",
        },
        privacy: {
          show_team: true,
          show_forum_activity: true,
          accept_dm_requests: true,
        },
        viewer_actions: {
          is_self: false,
          contact_state: "available",
          can_request_dm: true,
          can_respond: false,
          can_message: false,
          can_block: true,
          can_unblock: false,
          request_id: null,
          forum_message_path: null,
        },
      });
    }),
  },
  {
    name: "upstream 5xx",
    fetchImpl: bridgeFetch(async () => Response.json({
      error: "private Forum failure",
      details: { forumUserId: 4815 },
    }, { status: 503 })),
  },
] as const;

describe("ADVX public Profile bridge error classification", () => {
  it("makes a definitive Forum 404 indistinguishable from an absent directory target", async () => {
    // Given: one unknown local target and one locally eligible target rejected by the Forum bridge.
    const absentDependencies = fixtures();
    absentDependencies.directory.resolve = vi.fn(async () => null);
    const absentApp = createApp(absentDependencies, sessionActor("viewer-user"));
    const bridgeDependencies = fixtures();
    const fetchImpl = bridgeFetch(async () => Response.json({
      error: "private Forum eligibility reason",
      details: { forumUserId: 4815 },
    }, { status: 404 }));
    bridgeDependencies.bridge = createTeenxBridgeClient(bridgeDependencies.config, { fetch: fetchImpl });
    const bridgeApp = createApp(bridgeDependencies, sessionActor("viewer-user"));

    // When: the viewer opens each opaque public ID.
    const [absentResponse, bridgeResponse] = await Promise.all([
      request(absentApp).get(`/api/advx/captains/${targetIdentity().publicId}/profile`),
      request(bridgeApp).get(`/api/advx/captains/${targetIdentity().publicId}/profile`),
    ]);

    // Then: both paths return the same redacted public not-found response.
    expect(absentResponse.status).toBe(404);
    expect(bridgeResponse.status).toBe(404);
    expect(bridgeResponse.body).toEqual(absentResponse.body);
    expect(bridgeResponse.body).toEqual({ error: "Captain not found" });
    expect(JSON.stringify(bridgeResponse.body)).not.toMatch(/Forum|eligibility|forumUserId|4815/i);
    expect(absentDependencies.bridge.request).not.toHaveBeenCalled();
  });

  it("checks local active-Team eligibility before contacting the Forum bridge", async () => {
    // Given: a directory target whose local active Team is no longer available.
    const dependencies = fixtures();
    dependencies.store.getTeamSummary = vi.fn(async () => null);
    const fetchImpl = bridgeFetch(async () => new Response("private Forum response", { status: 500 }));
    dependencies.bridge = createTeenxBridgeClient(dependencies.config, { fetch: fetchImpl });
    const app = createApp(dependencies, sessionActor("viewer-user"));

    // When: another Captain opens the target public Profile.
    const response = await request(app).get(`/api/advx/captains/${targetIdentity().publicId}/profile`);

    // Then: local ineligibility is the definitive 404 and no bridge request is made.
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Captain not found" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(outageCases)("returns a minimal unavailable Profile for $name", async ({ fetchImpl }) => {
    // Given: a locally eligible Captain and a real bridge client receiving an outage-shaped wire failure.
    const dependencies = fixtures();
    dependencies.bridge = createTeenxBridgeClient(dependencies.config, { fetch: fetchImpl });
    const app = createApp(dependencies, sessionActor("viewer-user"));

    // When: another Captain opens the public Profile.
    const response = await request(app).get(`/api/advx/captains/${targetIdentity().publicId}/profile`);

    // Then: only Studio identity survives and every Forum-derived field fails closed.
    expect(response.status).toBe(200);
    expect(response.body).toEqual(degradedProfile(false));
    expect(JSON.stringify(response.body)).not.toMatch(/private|forumUserId|4815/i);
  });

  it("omits Team and reports unavailable contact for a self Profile during a bridge outage", async () => {
    // Given: the target Captain viewing self while the real bridge client receives a 5xx response.
    const dependencies = fixtures();
    dependencies.bridge = createTeenxBridgeClient(dependencies.config, {
      fetch: bridgeFetch(async () => new Response("private Forum failure", { status: 500 })),
    });
    const app = createApp(dependencies, sessionActor());

    // When: the Captain opens the public form of their Profile.
    const response = await request(app).get(`/api/advx/captains/${targetIdentity().publicId}/profile`);

    // Then: self status does not restore Team or claim contact availability during the outage.
    expect(response.status).toBe(200);
    expect(response.body).toEqual(degradedProfile(true));
  });

  it("returns 503 when the local public directory exceeds capacity", async () => {
    // Given: the real local directory cannot complete its bounded eligibility scan.
    const dependencies = fixtures();
    dependencies.directory = createTeenxPublicDirectory({
      secret: dependencies.config.publicIdSecret,
      scanCap: 1,
      cacheTtlMs: 30_000,
      loadEligibleCaptains: async () => [
        {
          captainId: "raw-user-id",
          teamId: "team-internal",
          teamName: "安全队伍",
          teamCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          captainId: "other-user",
          teamId: "other-team-internal",
          teamName: "其他队伍",
          teamCreatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
    });
    const app = createApp(dependencies, sessionActor("viewer-user"));

    // When: a viewer resolves an otherwise well-formed public Profile ID.
    const response = await request(app).get(`/api/advx/captains/${targetIdentity().publicId}/profile`);

    // Then: saturation is service unavailability, not a false target absence or raw internal error.
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Profile directory unavailable" });
    expect(dependencies.store.getCaptain).not.toHaveBeenCalled();
    expect(dependencies.bridge.request).not.toHaveBeenCalled();
  });
});
