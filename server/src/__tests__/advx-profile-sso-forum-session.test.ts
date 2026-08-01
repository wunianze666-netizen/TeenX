import { createHmac } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { fixtures, sessionActor, targetIdentity, createApp } from "./advx-profile-route-fixtures.js";
import identityFixture from "./fixtures/teenx-profile-identity-v1.json";

describe("ADVX TeenX Profile SSO and forum session", () => {
  it("emits a locked-down SSO payload and honors the maintenance lock", async () => {
    // Given: a valid Discourse nonce request and an unlocked interactive session.
    const dependencies = fixtures();
    vi.spyOn(dependencies.store, "getCaptain").mockResolvedValue({
      captainId: "raw-user-id",
      nickname: identityFixture.nicknameInput,
      joinedAt: null,
    });
    const app = createApp(dependencies, sessionActor());
    const incoming = Buffer.from(
      "nonce=nonce-1&return_sso_url=https%3A%2F%2Fforum.teenx.example%2Fsession%2Fsso_login",
    ).toString("base64");
    const signature = createHmac("sha256", dependencies.config.discourseConnectSecret)
      .update(incoming)
      .digest("hex");
    // When: SSO is requested.
    const response = await request(app)
      .get("/api/advx/sso/discourse-connect")
      .query({ sso: incoming, sig: signature });
    // Then: the browser-visible payload contains only canonical, safe child identity.
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.location, "https://studio.teenx.example");
    const output = new URLSearchParams(Buffer.from(redirect.searchParams.get("sso") ?? "", "base64").toString("utf8"));
    expect(Object.fromEntries(output)).toEqual({
      nonce: "nonce-1",
      external_id: targetIdentity().publicId,
      name: identityFixture.safeNickname,
      username: targetIdentity().forumUsername,
      admin: "false",
      moderator: "false",
    });
    expect(output.get("admin")).not.toBe("true");
    expect(output.get("moderator")).not.toBe("true");
    expect(["email", "bio", "location", "website", "avatar_url"].filter((field) => output.has(field))).toEqual([]);
    expect(output.toString()).not.toContain("raw-user-id");
    expect(output.toString()).not.toContain(identityFixture.nicknameInput.trim());
    const lockedApp = createApp({ ...dependencies, config: { ...dependencies.config, ssoMaintenanceLock: true } }, sessionActor());
    const locked = await request(lockedApp).get("/api/advx/sso/discourse-connect").query({ sso: incoming, sig: signature });
    expect(locked.status).toBe(503);
  });

  it("rejects malformed SSO payloads and return URLs outside the trusted Discourse origin", async () => {
    // Given: an unlocked interactive session and signed malformed/cross-origin payloads.
    const dependencies = fixtures();
    const app = createApp(dependencies, sessionActor());
    const malformed = "not+canonical=base64";
    const crossOrigin = Buffer.from(
      "nonce=nonce-1&return_sso_url=https%3A%2F%2Fprofile.internal.teenx.example%2Fsession%2Fsso_login",
    ).toString("base64");
    const signature = (payload: string) => createHmac("sha256", dependencies.config.discourseConnectSecret)
      .update(payload)
      .digest("hex");
    // When: both requests reach the Connect boundary.
    const malformedResponse = await request(app)
      .get("/api/advx/sso/discourse-connect")
      .query({ sso: malformed, sig: signature(malformed) });
    const crossOriginResponse = await request(app)
      .get("/api/advx/sso/discourse-connect")
      .query({ sso: crossOrigin, sig: signature(crossOrigin) });
    // Then: neither payload is redirected or interpreted under bridge-origin trust.
    expect(malformedResponse.status).toBe(400);
    expect(crossOriginResponse.status).toBe(400);
  });

  it("fails the forum session closed when Discourse is connected as another Captain", async () => {
    // Given: an interactive session whose forwarded Discourse cookie resolves to another username.
    const dependencies = {
      ...fixtures(),
      forumFetch: vi.fn(async () => Response.json({ current_user: { username: "tx_wrong_identity" } })),
    };
    const app = createApp(dependencies, sessionActor());
    // When: the browser checks forum session state.
    const response = await request(app)
      .get("/api/advx/forum/session")
      .set("Cookie", "_t=forum-token; unrelated=must-not-forward");
    // Then: the mismatched community identity is unusable until reconnect.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ connected: false, username: null, reconnectRequired: true });
    expect(dependencies.forumFetch).toHaveBeenCalledWith(
      "https://forum.teenx.example/session/current.json",
      expect.objectContaining({ headers: { accept: "application/json", cookie: "_t=forum-token" } }),
    );
  });
});
