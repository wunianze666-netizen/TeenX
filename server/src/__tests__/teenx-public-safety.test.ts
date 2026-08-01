import { describe, expect, it } from "vitest";
import identityFixture from "./fixtures/teenx-profile-identity-v1.json";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import {
  forumMessagePath,
  parsePublicText,
  safeAvatarPath,
  safePublicNickname,
  safePublicTeamName,
  safeTopicPath,
} from "../services/teenx-public-text.js";

describe("TeenX opaque Captain identity", () => {
  it("matches the canonical v1 golden vector", () => {
    // Given: the versioned cross-system identity fixture.
    expect(identityFixture.contractVersion).toBe("teenx-profile-identity-v1");

    // When: the public identity is projected.
    const identity = createTeenxPublicIdentity(
      identityFixture.captainId,
      identityFixture.publicIdSecret,
    );

    // Then: the full base64url HMAC and its embedded prefix are stable.
    expect(identity).toEqual({
      publicId: identityFixture.publicId,
      forumUsername: identityFixture.forumUsername,
    });
    expect(identity.publicId).toBe(`captain_v1_${identityFixture.digest}`);
    expect(identity.forumUsername).toBe(`tx_${identityFixture.digest.slice(0, 16)}`);
    expect(identity.publicId).toMatch(/^captain_v1_[A-Za-z0-9_-]{43}$/u);
    expect(identity.forumUsername).toMatch(/^tx_[A-Za-z0-9_-]{16}$/u);
    expect(JSON.stringify(identity)).not.toContain(identityFixture.captainId);
  });
});

describe("TeenX public text policy", () => {
  it("normalizes safe public text with NFKC and collapsed whitespace", () => {
    // Given: full-width and irregular whitespace in a harmless nickname.
    const input = "  ＴｅｅｎＸ\u3000小队  ";

    // When: the shared public-text boundary parses it.
    const result = parsePublicText(input, 24);

    // Then: callers receive one canonical safe value.
    expect(result).toEqual({ safe: true, value: "TeenX 小队" });
  });

  it.each([
    "kid@example.com",
    "https：／／example.com",
    "example．com",
    "captain.ai",
    "join-me.co",
    "例子。公司",
    "xn--fsqu00a.xn--55qx5d",
    "192.168.1.25",
    "[2001:db8::1]",
    "mailto：kid＠example.com",
    "tel：13800138000",
    "138 0013 8000",
    "@outside_friend",
    "加我＠outside_friend",
    "微信 abc123",
    "QQ 123456",
    "safe\u202Etxt",
    "line\nfeed",
  ])("rejects approval-bypassing public text: %s", (input) => {
    // Given: text carrying a contact channel or control character.
    // When: it crosses the shared public-text boundary.
    const result = parsePublicText(input, 24);

    // Then: it is unavailable for every public projection.
    expect(result).toEqual({ safe: false });
  });

  it("uses a stable fallback for unsafe legacy nicknames and omits unsafe Team names", () => {
    // Given: legacy public strings created before the safety policy.
    const publicId = "captain_v1_d1VDsSeOX3uhx8cwbeZixt4bQiaUppwrnlgh8iarxEA";

    // When/Then: nickname remains displayable without leaking text, while Team is omitted.
    expect(safePublicNickname("kid@example.com", publicId)).toBe("小队长-rxEA");
    expect(safePublicTeamName("加我 QQ 123456")).toBeNull();
  });
});

describe("TeenX forum path policy", () => {
  it.each([
    "/user_avatar/forum.teenx.example/tx_abcd/120/1.png",
    "/letter_avatar/tx_abcd/2/120.png",
    "/letter_avatar_proxy/v4/letter/t/f475e1/120.png",
  ])("allows an approved same-origin avatar path: %s", (path) => {
    // Given/When: an approved Discourse relative avatar path is parsed.
    const result = safeAvatarPath(path);

    // Then: the same relative path is retained.
    expect(result).toBe(path);
  });

  it.each([
    "https://tracker.example/avatar.png",
    "//tracker.example/avatar.png",
    "/user_avatar/../admin.png",
    "/uploads/tracking.png",
    "/user_avatar/name.png?token=secret",
    "/user_avatar/%2e%2e/admin.png",
    "/user_avatar/%2F%2Fevil.example/avatar.png",
    "/user_avatar/https://evil.example/avatar.png",
  ])("rejects an unsafe avatar path: %s", (path) => {
    // Given/When: an unapproved or cross-origin avatar path is parsed.
    const result = safeAvatarPath(path);

    // Then: no browser-loadable path is returned.
    expect(result).toBeNull();
  });

  it("allows only topic paths and generates the PM path from a safe username", () => {
    // Given: a topic path and generated forum username.
    // When/Then: only known same-origin forum routes are emitted.
    expect(safeTopicPath("/t/safe-topic/123/4")).toBe("/t/safe-topic/123/4");
    expect(safeTopicPath("/admin/users/1")).toBeNull();
    expect(safeTopicPath("/t/%2e%2e/123")).toBeNull();
    expect(safeTopicPath("https://forum.teenx.example/t/topic/123")).toBeNull();
    expect(forumMessagePath("tx_d1VDsSeOX3uhx8cw")).toBe("/new-message?username=tx_d1VDsSeOX3uhx8cw");
  });
});
