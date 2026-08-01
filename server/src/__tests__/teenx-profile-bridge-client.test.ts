import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  createTeenxBridgeClient,
  signTeenxBridgeRequest,
} from "../services/teenx-profile-bridge-client.js";
import type { TeenxProfileConfig } from "../services/teenx-profile-config.js";
import { encodedSecret } from "./teenx-profile-test-fixtures.js";

describe("TeenX bridge request signing", () => {
  it("matches the forum CanonicalRequest golden vector byte for byte", () => {
    // Given: the same request values used by the forum bridge authenticator contract.
    const request = {
      method: "PATCH" as const,
      path: "/privacy",
      query: { z: "last", a: "first" },
      body: { actorPublicId: "captain_v1_actor" },
    };
    // When: the bridge request is signed.
    const signed = signTeenxBridgeRequest(request, {
      secret: "bridge-secret",
      timestamp: 1_721_843_200,
      nonce: "nonce-123",
    });
    // Then: the canonical wire representation and known signature are stable.
    expect(signed.canonicalPathAndQuery).toBe(
      "/teenx-profile/bridge/v1/privacy?a=first&z=last",
    );
    expect(signed.canonicalString).toBe(
      "PATCH\n/teenx-profile/bridge/v1/privacy?a=first&z=last\n1721843200\nnonce-123\neff88e213fdb1bccf290392559754e2e1843459703b70e05289adb8005d80a30",
    );
    expect(signed.bodySha256).toBe("eff88e213fdb1bccf290392559754e2e1843459703b70e05289adb8005d80a30");
    expect(signed.signature).toBe("66503420c6d06b467c14c3204970a31600806025d5972538da1afec1b67007ea");
  });

  it("orders canonical query keys by Unicode code point", () => {
    // Given: keys whose UTF-16 ordering differs from Unicode scalar ordering.
    const request = {
      method: "GET" as const,
      path: "/profile",
      query: { "😀": "grin", "\uE000": "private" },
    };
    // When: the bridge request is canonicalized.
    const signed = signTeenxBridgeRequest(request, {
      secret: "bridge-secret",
      timestamp: 1_721_843_200,
      nonce: "",
    });
    // Then: the lower Unicode code point is encoded first on every runtime locale.
    expect(signed.canonicalPathAndQuery).toBe(
      "/teenx-profile/bridge/v1/profile?%EE%80%80=private&%F0%9F%98%80=grin",
    );
  });

  it.each([
    "/privacy/%2e%2e/admin",
    "/privacy//admin",
    "/https://evil.example/path",
    "//evil.example/path",
  ])("rejects a non-canonical bridge operation path: %s", (path) => {
    // Given/When/Then: encoded traversal, duplicate separators, and scheme-like paths never enter a signature.
    expect(() => signTeenxBridgeRequest(
      { method: "GET", path },
      { secret: "bridge-secret", timestamp: 1_721_843_200, nonce: "" },
    )).toThrow(/path/i);
  });

  it("adds a nonce only to mutations and never retries a failed mutation", async () => {
    // Given: a bridge that always returns an upstream failure.
    const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const client = createTeenxBridgeClient(config(), {
      fetch: fetchImpl,
      now: () => 1_722_222_222_000,
      nonce: () => "mutation-nonce",
    });
    // When: one mutation is attempted.
    const result = client.request(
      { method: "POST", path: "/contact-requests", body: { targetPublicId: "captain_v1_target" } },
      z.object({ ok: z.literal(true) }).strict(),
    );
    // Then: it fails once and sends replay-protection headers without retrying.
    await expect(result).rejects.toMatchObject({ name: "TeenxBridgeHttpError", status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("x-teenx-nonce")).toBe("mutation-nonce");
    expect(headers.get("x-teenx-body-sha256")).toMatch(/^[0-9a-f]{64}$/);
    expect(headers.get("x-teenx-signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.credentials).toBe("omit");
  });

  it("uses an empty nonce for reads and rejects unknown response fields", async () => {
    // Given: an upstream response with an unapproved field.
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, rawUserId: "forbidden" }));
    const client = createTeenxBridgeClient(config(), {
      fetch: fetchImpl,
      now: () => 1_722_222_222_000,
      nonce: () => "must-not-be-used",
    });
    // When: a read response crosses the Zod boundary.
    const result = client.request(
      { method: "GET", path: "/profiles/captain_v1_target", query: { viewerPublicId: "captain_v1_viewer" } },
      z.object({ ok: z.literal(true) }).strict(),
    );
    // Then: the extra field is rejected and no mutation nonce is sent.
    await expect(result).rejects.toBeInstanceOf(z.ZodError);
    const init = fetchImpl.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("x-teenx-nonce")).toBeNull();
    expect(headers.get("x-teenx-body-sha256")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("rejects a successful bridge response once its raw body exceeds the cap", async () => {
    // Given: a bridge response whose JSON is valid but too large to admit into memory.
    const fetchImpl = vi.fn(async () => Response.json({ value: "x".repeat(300_000) }));
    const client = createTeenxBridgeClient(config(), { fetch: fetchImpl });
    // When: the response crosses the bridge boundary.
    const result = client.request(
      { method: "GET", path: "/profile" },
      z.object({ value: z.string() }).strict(),
    );
    // Then: raw response bytes are bounded before JSON parsing.
    await expect(result).rejects.toMatchObject({ name: "TeenxBridgeProtocolError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

function config(): TeenxProfileConfig {
  return {
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
  };
}
