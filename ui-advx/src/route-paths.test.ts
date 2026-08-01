import { describe, expect, it } from "vitest";
import { APP_ROUTE_PATHS } from "./route-paths";

describe("ADVX route parity", () => {
  it("preserves every existing route while adding the Profile workflow", () => {
    // Given: the finalized route contract.
    const expected = [
      "/",
      "/demo",
      "/studio",
      "/members/:memberId",
      "/members/new",
      "/test-run",
      "/test-run/:runId",
      "/versions",
      "/activity",
      "/forum",
      "/leaderboard",
      "/me",
      "/me/settings",
      "/me/contacts",
      "/captains/:publicId",
      "/arena",
      "/arena/challenges/:challengeVersionId",
      "/arena/runs/:runId",
      "/arena/runs/:runId/result",
    ];

    // When: the single router publishes its route inventory.
    // Then: no Landing, Studio, Forum, Me, or Arena route is lost.
    expect(APP_ROUTE_PATHS).toEqual(expected);
  });
});
