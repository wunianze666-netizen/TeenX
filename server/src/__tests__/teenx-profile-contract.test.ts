import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  bridgePrivacyWriteSchema,
  bridgeProfileSchema,
  contactGrantPageSchema,
  contactMutationResponseSchema,
} from "../services/teenx-profile-contract.js";

describe("TeenX forum bridge DTO parsing", () => {
  it("maps the forum profile serializer from snake case without accepting extra fields", () => {
    // Given: the exact DTO emitted by the forum ProfileSerializer.
    const wire = {
      profile: {
        public_id: `captain_v1_${"a".repeat(43)}`,
        username: `tx_${"b".repeat(16)}`,
        avatar_path: "/user_avatar/forum/tx_user/120/1.png",
      },
      privacy: { show_team: true, show_forum_activity: false, accept_dm_requests: true },
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
    };
    // When: the response crosses the Paperclip bridge boundary.
    const parsed = bridgeProfileSchema.parse(wire);
    // Then: the internal contract is camel case and remains allowlisted.
    expect(parsed).toMatchObject({
      publicId: wire.profile.public_id,
      username: wire.profile.username,
      privacy: { showTeam: true, showForumActivity: false, acceptDmRequests: true },
      viewerActions: { contactState: "available", canRequestDm: true },
      forum: null,
    });
    expect(() => bridgeProfileSchema.parse({ ...wire, raw_user_id: 1 })).toThrow(z.ZodError);
  });

  it("maps privacy and contact mutation serializer keys", () => {
    // Given: mutation responses emitted by the forum bridge controller.
    const privacyWire = {
      ok: true,
      privacy: { show_team: false, show_forum_activity: true, accept_dm_requests: false },
    };
    const contactWire = {
      ok: true,
      viewer_actions: {
        is_self: false,
        contact_state: "blocked",
        can_request_dm: false,
        can_respond: false,
        can_message: false,
        can_block: false,
        can_unblock: true,
        request_id: null,
        forum_message_path: null,
      },
    };
    // When: both responses are parsed.
    const privacy = bridgePrivacyWriteSchema.parse(privacyWire);
    const contact = contactMutationResponseSchema.parse(contactWire);
    expect(privacy).toEqual({ showTeam: false, showForumActivity: true, acceptDmRequests: false });
    expect(contact.viewerActions).toMatchObject({ contactState: "blocked", canUnblock: true });
  });

  it("accepts the unavailable contact state emitted for severed or counterpart-blocked relationships", () => {
    // Given: the redacted contact projection emitted when the viewer must not learn who blocked whom.
    const wire = {
      items: [{
        counterpart: {
          public_id: `captain_v1_${"a".repeat(43)}`,
          nickname: "安全昵称",
          avatar_path: null,
        },
        state: "unavailable",
        established_at: null,
        can_message: false,
        can_sever: false,
        can_block: true,
        can_unblock: false,
      }],
      next_cursor: null,
    };

    // When: the Forum response crosses the ADVX boundary.
    const parsed = contactGrantPageSchema.parse(wire);

    // Then: the redacted state remains unavailable rather than becoming a bridge outage.
    expect(parsed.items[0]?.state).toBe("unavailable");
  });

  it("maps a bounded opaque contact cursor only from the Forum snake-case field", () => {
    // Given: the Forum returns a URL-sensitive opaque continuation token.
    const wire = {
      items: [],
      next_cursor: "cursor/+==",
    };

    // When: the contact page crosses the ADVX boundary.
    const parsed = contactGrantPageSchema.parse(wire);

    // Then: the token is unchanged and only the camel-case field leaves the parser.
    expect(parsed).toEqual({ items: [], nextCursor: "cursor/+==" });
    expect(() => contactGrantPageSchema.parse({ items: [], next_cursor: "" })).toThrow(z.ZodError);
    expect(() => contactGrantPageSchema.parse({ items: [], next_cursor: "x".repeat(501) })).toThrow(z.ZodError);
  });
});
