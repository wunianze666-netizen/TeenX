import { describe, expect, it, vi } from "vitest";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import {
  createTeenxPublicDirectory,
  TeenxPublicDirectoryCapacityError,
} from "../services/teenx-public-directory.js";
import { encodedSecret } from "./teenx-profile-test-fixtures.js";

describe("TeenX public ID reverse directory", () => {
  it("coalesces concurrent full scans and caches both hits and misses", async () => {
    // Given: two eligible Captains and a deterministic clock.
    const secret = "p".repeat(32);
    const eligible = [captain("captain-a"), captain("captain-b")];
    const load = vi.fn(async () => eligible);
    const directory = createTeenxPublicDirectory({
      secret,
      scanCap: 10,
      cacheTtlMs: 30_000,
      now: () => 1_000,
      loadEligibleCaptains: load,
    });
    const publicId = createTeenxPublicIdentity("captain-b", secret).publicId;
    // When: a hit and repeated random miss resolve concurrently.
    const [hit, missA, missB] = await Promise.all([
      directory.resolve(publicId),
      directory.resolve("captain_v1_missing"),
      directory.resolve("captain_v1_missing"),
    ]);
    // Then: one complete scan answers all requests and the miss is fail-closed.
    expect(hit?.captainId).toBe("captain-b");
    expect(missA).toBeNull();
    expect(missB).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(11);
  });

  it("fails closed when eligible Captains exceed the configured scan cap", async () => {
    // Given: a loader returning cap plus one records.
    const directory = createTeenxPublicDirectory({
      secret: "p".repeat(32),
      scanCap: 1,
      cacheTtlMs: 30_000,
      loadEligibleCaptains: async () => [captain("captain-a"), captain("captain-b")],
    });
    // When/Then: reverse lookup reports capacity failure instead of truncating.
    await expect(directory.resolve("captain_v1_missing")).rejects.toBeInstanceOf(
      TeenxPublicDirectoryCapacityError,
    );
  });

  it("caches an over-cap scan failure until the bounded cache window expires", async () => {
    // Given: an over-cap directory and a controllable cache clock.
    let now = 1_000;
    const load = vi.fn(async () => [captain("captain-a"), captain("captain-b")]);
    const directory = createTeenxPublicDirectory({
      secret: encodedSecret("public-id"),
      scanCap: 1,
      cacheTtlMs: 30_000,
      now: () => now,
      loadEligibleCaptains: load,
    });
    // When: repeated misses arrive before and after the failure cache expires.
    await expect(directory.resolve("captain_v1_missing-a")).rejects.toBeInstanceOf(
      TeenxPublicDirectoryCapacityError,
    );
    await expect(directory.resolve("captain_v1_missing-b")).rejects.toBeInstanceOf(
      TeenxPublicDirectoryCapacityError,
    );
    now = 31_001;
    await expect(directory.resolve("captain_v1_missing-c")).rejects.toBeInstanceOf(
      TeenxPublicDirectoryCapacityError,
    );
    // Then: misses cannot trigger an unbounded sequence of full scans.
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("returns the same closed result for zero and multiple eligible matches", async () => {
    // Given: duplicate eligible rows for one Captain and no row for another public ID.
    const secret = encodedSecret("public-id");
    const duplicate = captain("captain-a");
    const directory = createTeenxPublicDirectory({
      secret,
      scanCap: 10,
      cacheTtlMs: 30_000,
      loadEligibleCaptains: async () => [duplicate, { ...duplicate, teamId: "second-team" }],
    });
    // When: duplicate and absent identities are resolved.
    const duplicateResult = await directory.resolve(createTeenxPublicIdentity("captain-a", secret).publicId);
    const absentResult = await directory.resolve(createTeenxPublicIdentity("captain-b", secret).publicId);
    // Then: neither case reveals a Captain selection.
    expect(duplicateResult).toBeNull();
    expect(absentResult).toBeNull();
  });
});

function captain(captainId: string) {
  return {
    captainId,
    teamId: `team-${captainId}`,
    teamName: `Team ${captainId}`,
    teamCreatedAt: new Date("2026-07-25T00:00:00.000Z"),
  };
}
