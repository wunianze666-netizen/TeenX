import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import { fixtures, sessionActor, targetIdentity, createApp } from "./advx-profile-route-fixtures.js";

describe("ADVX TeenX Profile contact routes", () => {
  it("forwards contact requests without free text or raw actor IDs", async () => {
    // Given: an interactive viewer and a strict bridge fake.
    const dependencies = fixtures();
    const app = createApp(dependencies, sessionActor());
    const otherPublicId = createTeenxPublicIdentity("other-user", dependencies.config.publicIdSecret).publicId;
    // When: a valid request and a free-text request are submitted.
    const valid = await request(app).post("/api/advx/contact-requests").send({ targetPublicId: otherPublicId });
    const invalid = await request(app)
      .post("/api/advx/contact-requests")
      .send({ targetPublicId: otherPublicId, message: "contact me" });
    // Then: only public IDs reach the bridge and free text is rejected.
    expect(valid.status).toBe(200);
    expect(invalid.status).toBe(400);
    expect(dependencies.bridge.request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/contact-requests",
        body: { actorPublicId: targetIdentity().publicId, targetPublicId: otherPublicId },
      },
      expect.anything(),
    );
    expect(JSON.stringify(vi.mocked(dependencies.bridge.request).mock.calls)).not.toContain("raw-user-id");
  });

  it("forwards a bounded opaque contact cursor and limit without interpretation", async () => {
    // Given: a signed-in Captain and an opaque Forum continuation token.
    const dependencies = fixtures();
    dependencies.bridge.request = vi.fn(async () => ({ items: [], nextCursor: "next/+==" }));
    const app = createApp(dependencies, sessionActor());
    // When: the Captain requests the largest supported page with a URL-sensitive cursor.
    const response = await request(app).get("/api/advx/me/contacts").query({ cursor: "cursor/+==", limit: "50" });
    // Then: the exact token and normalized limit reach Forum and its next cursor is exposed only in camel case.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: "next/+==" });
    expect(dependencies.bridge.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/contacts",
      query: { actorPublicId: targetIdentity().publicId, cursor: "cursor/+==", limit: "50" },
    }, expect.anything());
  });

  it.each([
    ["empty cursor", { cursor: "", limit: "20" }],
    ["oversized cursor", { cursor: "x".repeat(501), limit: "20" }],
    ["zero limit", { limit: "0" }],
    ["oversized limit", { limit: "51" }],
  ])("rejects %s before contacting Forum", async (_label, query) => {
    // Given: a signed-in Captain and an out-of-contract contact page query.
    const dependencies = fixtures();
    const app = createApp(dependencies, sessionActor());

    // When: the invalid query reaches the ADVX boundary.
    const response = await request(app).get("/api/advx/me/contacts").query(query);

    // Then: ADVX rejects it without forwarding anything to Forum.
    expect(response.status).toBe(400);
    expect(dependencies.bridge.request).not.toHaveBeenCalled();
  });

  it("revokes a contact request with actor identity in the query", async () => {
    // Given: a signed-in Captain and a valid forum request UUID.
    const dependencies = fixtures();
    dependencies.bridge.request = vi.fn(async () => ({ ok: true }));
    const app = createApp(dependencies, sessionActor());
    const requestId = "55555555-5555-4555-8555-555555555555";
    // When: the Captain revokes the request.
    const response = await request(app).delete(`/api/advx/contact-requests/${requestId}`).send({});
    // Then: the forum-compatible DELETE has no JSON body.
    expect(response.status).toBe(200);
    expect(dependencies.bridge.request).toHaveBeenCalledWith({
      method: "DELETE",
      path: `/contact-requests/${requestId}`,
      query: { actorPublicId: targetIdentity().publicId },
    }, expect.anything());
  });

  it("changes a contact with actor and action in the query", async () => {
    // Given: a signed-in Captain and another opaque Captain identity.
    const dependencies = fixtures();
    dependencies.bridge.request = vi.fn(async () => ({ ok: true }));
    const app = createApp(dependencies, sessionActor());
    const otherPublicId = createTeenxPublicIdentity("other-user", dependencies.config.publicIdSecret).publicId;
    // When: the Captain blocks the contact.
    const response = await request(app).delete(`/api/advx/contacts/${otherPublicId}`).query({ action: "block" }).send({});
    // Then: the forum-compatible DELETE has both required query fields and no JSON body.
    expect(response.status).toBe(200);
    expect(dependencies.bridge.request).toHaveBeenCalledWith({
      method: "DELETE",
      path: `/contacts/${otherPublicId}`,
      query: { actorPublicId: targetIdentity().publicId, action: "block" },
    }, expect.anything());
  });
});
