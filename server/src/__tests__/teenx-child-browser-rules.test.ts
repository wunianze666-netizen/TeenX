import { describe, expect, it } from "vitest";
import { isTeenxChildBrowserRouteAllowed } from "../middleware/teenx-child-api-boundary.js";

describe("TeenX child browser route compatibility coverage", () => {
  it("matches anchored audited identifiers without broadening neighboring paths", () => {
    // Given: exact audited and close-variant paths.
    const teamId = "11111111-1111-4111-8111-111111111111";
    const requestId = "55555555-5555-4555-8555-555555555555";
    const cases = [
      ["GET", "/api/advx/session", true],
      ["GET", `/api/advx/teams/${teamId}/members`, true],
      ["PATCH", `/api/advx/contact-requests/${requestId}`, true],
      ["GET", "/api/advx/arena/challenges/todo-web:v1", true],
      ["GET", "/api/advx/arena/challenges/todo-web-v1", false],
      ["GET", `/api/advx/teams/${teamId}/members/`, false],
      ["GET", "/api/companies", false],
    ] as const;
    // When/Then: every route matches only its audited decision.
    for (const [method, path, expected] of cases) {
      expect(isTeenxChildBrowserRouteAllowed(method, path), `${method} ${path}`).toBe(expected);
    }
  });
});
