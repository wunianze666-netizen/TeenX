import { describe, expect, it } from "vitest";
import type { ContactGrantSummary, ContactRequestSummary } from "./profile-contracts";
import { appendContactGrants, appendContactRequests, captainProfilePath, reconcileSavedValue } from "./profile-state";

const request = (requestId: string): ContactRequestSummary => ({
  requestId,
  direction: "incoming",
  state: "pending",
  counterpart: {
    publicId: `captain_v1_${"a".repeat(43)}`,
    nickname: "小蓝",
    avatarPath: null,
  },
  createdAt: "2026-07-20T00:00:00.000Z",
  expiresAt: "2026-07-27T00:00:00.000Z",
});

const grant = (publicId: string): ContactGrantSummary => ({
  counterpart: { publicId, nickname: "小蓝", avatarPath: null },
  state: "approved",
  establishedAt: "2026-07-20T00:00:00.000Z",
  canMessage: true,
  canSever: true,
  canBlock: true,
  canUnblock: false,
});

describe("Profile UI state guards", () => {
  it("keeps edits made after a save started while recording the saved value", () => {
    // Given: revision 2 was submitted and revision 3 is now visible.
    // When: revision 2 completes.
    const result = reconcileSavedValue({
      currentRevision: 3,
      submittedRevision: 2,
      current: "继续输入",
      saved: "已保存版本",
    });

    // Then: the visible edit survives while the baseline advances.
    expect(result).toEqual({ current: "继续输入", saved: "已保存版本" });
  });

  it("applies a save response when no newer edit exists", () => {
    // Given: the submitted revision is still current.
    // When: the save completes with a normalized value.
    const result = reconcileSavedValue({
      currentRevision: 2,
      submittedRevision: 2,
      current: " 提交值 ",
      saved: "提交值",
    });

    // Then: both current and saved values use the server result.
    expect(result).toEqual({ current: "提交值", saved: "提交值" });
  });

  it("deduplicates contact requests when opaque cursor pages overlap", () => {
    // Given: the next page repeats the final item from the previous page.
    const first = request("00000000-0000-4000-8000-000000000001");
    const second = request("00000000-0000-4000-8000-000000000002");

    // When: the pages are merged.
    const merged = appendContactRequests([first], [first, second]);

    // Then: each request appears exactly once in stable order.
    expect(merged.map((item) => item.requestId)).toEqual([first.requestId, second.requestId]);
  });

  it("deduplicates approved contacts by counterpart public ID when pages overlap", () => {
    // Given: the next page repeats the final public counterpart from the previous page.
    const first = grant(`captain_v1_${"a".repeat(43)}`);
    const second = grant(`captain_v1_${"b".repeat(43)}`);

    // When: the approved-contact pages are merged.
    const merged = appendContactGrants([first], [first, second]);

    // Then: each counterpart appears once in stable page order.
    expect(merged.map((item) => item.counterpart.publicId)).toEqual([
      first.counterpart.publicId,
      second.counterpart.publicId,
    ]);
  });

  it("builds counterpart links only from strict public Captain IDs", () => {
    // Given: one server-shaped public ID and one raw internal-looking value.
    const publicId = `captain_v1_${"A_-".repeat(14)}A`;

    // When: Profile paths are derived.
    const safePath = captainProfilePath(publicId);
    const unsafePath = captainProfilePath("internal-user-42");

    // Then: only the strict public identity becomes a route.
    expect(safePath).toBe(`/captains/${encodeURIComponent(publicId)}`);
    expect(unsafePath).toBeNull();
  });
});
