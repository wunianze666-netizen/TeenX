import { afterEach, describe, expect, it, vi } from "vitest";
import { AdvxApiError, profileApi } from "./profile-api";

const PUBLIC_ID = `captain_v1_${"a".repeat(43)}`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Profile API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a typed API error when the server rejects a Profile request", async () => {
    // Given: the server returns a stable status and code.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: "申请已在等待处理", code: "CONTACT_REQUEST_PENDING" }, 409),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When: the client creates a contact request.
    const result = profileApi.createContactRequest(PUBLIC_ID);

    // Then: callers receive the structured Profile error.
    await expect(result).rejects.toEqual(
      new AdvxApiError("申请已在等待处理", 409, "CONTACT_REQUEST_PENDING"),
    );
  });

  it("uses a nonempty Chinese fallback when an error response is not JSON", async () => {
    // Given: the Profile service returns an empty non-JSON error without status text.
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      new Response("", { status: 503, statusText: "" }),
    ));

    // When: the client reads the current Captain.
    const result = profileApi.me();

    // Then: the error remains actionable instead of becoming an empty message.
    await expect(result).rejects.toEqual(new AdvxApiError("个人资料请求失败", 503, null));
  });

  it("saves identity and privacy through independent exact request bodies", async () => {
    // Given: both Profile mutations succeed.
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ profile: { publicId: PUBLIC_ID, nickname: "新昵称", joinedAt: null } }))
      .mockResolvedValueOnce(jsonResponse({ showTeam: true, showForumActivity: false, acceptDmRequests: true }));
    vi.stubGlobal("fetch", fetchMock);

    // When: identity and privacy are saved independently.
    await profileApi.updateIdentity({ nickname: "新昵称" });
    await profileApi.updatePrivacy({ showTeam: true, showForumActivity: false, acceptDmRequests: true });

    // Then: each route receives only its allowlisted payload.
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/advx/me/identity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "新昵称" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/advx/me/privacy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showTeam: true, showForumActivity: false, acceptDmRequests: true }),
    });
  });

  it("encodes opaque request and contact cursors without client interpretation", async () => {
    // Given: request and contact lists are available.
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    // When: the same opaque cursor continues each list.
    await profileApi.listContactRequests("inbox", "cursor/+==");
    await profileApi.listContacts("cursor/+==");

    // Then: each request contains the exact encoded token and contacts request the maximum bounded page.
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/advx/me/contact-requests?box=inbox&cursor=cursor%2F%2B%3D%3D",
      undefined,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/advx/me/contacts?cursor=cursor%2F%2B%3D%3D&limit=50",
      undefined,
    );
  });

  it("sends only contract fields for contact decisions and relationship actions", async () => {
    // Given: every relationship mutation succeeds.
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const requestId = "00000000-0000-4000-8000-000000000001";

    // When: all supported contact mutations are called.
    await profileApi.decideContactRequest(requestId, "accept");
    await profileApi.revokeContactRequest(requestId);
    await profileApi.changeContact(PUBLIC_ID, "block");
    await profileApi.unblockContact(PUBLIC_ID);

    // Then: requests contain no note, actor, or unsupported policy field.
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/api/advx/contact-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/advx/contact-requests/${requestId}`, { method: "DELETE" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/advx/contacts/${encodeURIComponent(PUBLIC_ID)}?action=block`, { method: "DELETE" });
    expect(fetchMock).toHaveBeenNthCalledWith(4, `/api/advx/contacts/${encodeURIComponent(PUBLIC_ID)}/unblock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });
});
