import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import { fixtures, sessionActor, targetIdentity, createApp } from "./advx-profile-route-fixtures.js";

describe("ADVX TeenX Profile self and public routes", () => {
  it("returns self Profile and Team summaries without raw IDs or model data", async () => {
    // Given: a Captain with an active Team and private run count.
    const dependencies = fixtures();
    const app = createApp(dependencies, sessionActor());
    // When: the Captain opens the existing me endpoint.
    const response = await request(app).get("/api/advx/me");
    // Then: the endpoint uses a dedicated self allowlist.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      profile: {
        publicId: targetIdentity().publicId,
        nickname: "安全昵称",
        joinedAt: "2026-01-01T00:00:00.000Z",
        authMode: "signed_in",
      },
      team: { name: "安全队伍", memberCount: 4, versionCount: 2 },
      stats: { testRunCount: 3 },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/raw-user-id|team-internal|model|provider|cost|token/i);
  });

  it("requires an interactive session and rejects unknown identity keys", async () => {
    // Given: a board key and an interactive session.
    const dependencies = fixtures();
    const keyApp = createApp(dependencies, { type: "board", source: "board_key", userId: "raw-user-id" });
    const sessionApp = createApp(dependencies, sessionActor());
    // When: each attempts the identity mutation.
    const keyResponse = await request(keyApp).patch("/api/advx/me/identity").send({ nickname: "新昵称" });
    const extraKeyResponse = await request(sessionApp)
      .patch("/api/advx/me/identity")
      .send({ nickname: "新昵称", actorId: "other-user" });
    // Then: neither credential substitution nor body actor injection is accepted.
    expect(keyResponse.status).toBe(401);
    expect(extraKeyResponse.status).toBe(400);
    expect(dependencies.store.updateNickname).not.toHaveBeenCalled();
  });

  it("returns a public Profile with only safe Team/forum fields and no Arena", async () => {
    // Given: an eligible target whose bridge privacy explicitly publishes Team and forum activity.
    const dependencies = fixtures();
    const app = createApp(dependencies, sessionActor("viewer-user"));
    // When: a signed-in Captain opens the target Profile.
    const response = await request(app).get(`/api/advx/captains/${targetIdentity().publicId}/profile`);
    // Then: the allowlisted Profile is returned without internal identity or Arena data.
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      profile: { publicId: targetIdentity().publicId, nickname: "安全昵称", avatarPath: "/letter_avatar/tx_target/2/120.png" },
      team: { name: "安全队伍", memberCount: 4, versionCount: 2 },
      forum: { username: targetIdentity().forumUsername, topicCount: 1 },
      viewerActions: { contactState: "available", canRequestDm: true },
    });
    expect(dependencies.bridge.request).toHaveBeenCalledWith(
      {
        method: "GET",
        path: "/profile",
        query: { viewerPublicId: expect.any(String), targetPublicId: targetIdentity().publicId },
      },
      expect.anything(),
    );
    expect(JSON.stringify(response.body)).not.toMatch(/raw-user-id|team-internal|arena|model|provider|cost/i);
  });

  it("uses the forum privacy paths and nested mutation body", async () => {
    // Given: a signed-in Captain and bridge responses already parsed at the client boundary.
    const dependencies = fixtures();
    dependencies.bridge.request = vi.fn()
      .mockResolvedValueOnce({ showTeam: false, showForumActivity: false, acceptDmRequests: true })
      .mockResolvedValueOnce({ showTeam: true, showForumActivity: false, acceptDmRequests: true });
    const app = createApp(dependencies, sessionActor());
    // When: privacy is read and then updated.
    const readResponse = await request(app).get("/api/advx/me/privacy");
    const updateResponse = await request(app).patch("/api/advx/me/privacy").send({
      showTeam: true,
      showForumActivity: false,
      acceptDmRequests: true,
    });
    // Then: Paperclip uses the exact forum bridge path and payload shape.
    expect(readResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(dependencies.bridge.request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/privacy",
      query: { actorPublicId: targetIdentity().publicId },
    }, expect.anything());
    expect(dependencies.bridge.request).toHaveBeenNthCalledWith(2, {
      method: "PATCH",
      path: "/privacy",
      body: {
        actorPublicId: targetIdentity().publicId,
        privacy: { showTeam: true, showForumActivity: false, acceptDmRequests: true },
      },
    }, expect.anything());
  });

  it("keeps another Captain minimal and unavailable when the forum bridge is offline", async () => {
    // Given: an active owner-backed Captain and an unavailable bridge.
    const dependencies = fixtures();
    dependencies.bridge.request = vi.fn(async () => { throw new TypeError("offline"); });
    const app = createApp(dependencies, sessionActor("viewer-user"));
    // When: the viewer opens the Profile during the outage.
    const response = await request(app).get(`/api/advx/captains/${targetIdentity().publicId}/profile`);
    // Then: Studio identity remains, private aggregations disappear, and contact fails closed.
    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({ publicId: targetIdentity().publicId, nickname: "安全昵称", avatarPath: null });
    expect(response.body).not.toHaveProperty("team");
    expect(response.body).not.toHaveProperty("forum");
    expect(response.body.viewerActions).toEqual({
      isSelf: false,
      contactState: "unavailable",
      canRequestDm: false,
      canRespond: false,
      canMessage: false,
      canBlock: false,
      canUnblock: false,
      requestId: null,
      forumMessagePath: null,
    });
  });

  it("fails a public Profile closed when the bridge username is not derived from the target Captain", async () => {
    // Given: a valid bridge DTO that names a different opaque forum identity.
    const dependencies = fixtures();
    dependencies.bridge.request = vi.fn(async () => ({
      publicId: targetIdentity().publicId,
      username: createTeenxPublicIdentity("other-user", dependencies.config.publicIdSecret).forumUsername,
      avatarPath: "/letter_avatar/tx_target/2/120.png",
      privacy: { showTeam: true, showForumActivity: true, acceptDmRequests: true },
      forum: { topicCount: 1, recentTopics: [] },
      viewerActions: {
        isSelf: false,
        contactState: "available",
        canRequestDm: true,
        canRespond: false,
        canMessage: false,
        canBlock: true,
        canUnblock: false,
        requestId: null,
        forumMessagePath: null,
      },
    }));
    const app = createApp(dependencies, sessionActor("viewer-user"));
    // When: a signed-in Captain opens the target Profile.
    const response = await request(app).get(`/api/advx/captains/${targetIdentity().publicId}/profile`);
    // Then: bridge-owned public and action fields are withheld as unavailable.
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("team");
    expect(response.body).not.toHaveProperty("forum");
    expect(response.body.profile.avatarPath).toBeNull();
    expect(response.body.viewerActions.contactState).toBe("unavailable");
  });
});
