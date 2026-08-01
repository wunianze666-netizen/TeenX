import { describe, expect, it } from "vitest";
import {
  canMutateArenaIssue,
  canReadArenaIssue,
  genericIssueMutationBlock,
  genericIssueReadScopeForActor,
  projectArenaIssueForGenericRead,
  projectArenaWorkProductForGenericRead,
} from "../services/advx-arena/generic-issue-boundary.js";
import { createArenaUploadAdmissionGate } from "../services/advx-arena/upload-admission.js";

describe("ADVX Arena release security boundaries", () => {
  it("authorizes generic Arena issue reads only for the recorded captain", () => {
    const issue = arenaIssue();
    expect(canReadArenaIssue({ type: "board", userId: "captain-a" }, issue)).toBe(true);
    expect(canReadArenaIssue({ type: "board", userId: "captain-b" }, issue)).toBe(false);
    expect(canReadArenaIssue({ type: "agent" }, issue)).toBe(false);
  });

  it("rejects every generic mutation of an Arena submission issue", () => {
    expect(canMutateArenaIssue(arenaIssue())).toBe(false);
    expect(canMutateArenaIssue({ id: "ordinary-issue" })).toBe(true);
  });

  it("returns a sanitized not-found block to foreign captains before immutable conflicts", () => {
    const issue = arenaIssue();
    expect(genericIssueMutationBlock({ type: "board", userId: "captain-b" }, issue)).toBe("not_found");
    expect(genericIssueMutationBlock({ type: "board", userId: "captain-a" }, issue)).toBe("immutable");
    expect(genericIssueMutationBlock({ type: "board", userId: "captain-b" }, { id: "ordinary" })).toBeNull();
  });

  it("derives fail-closed generic read scopes from actors", () => {
    expect(genericIssueReadScopeForActor({ type: "board", userId: "captain-a" })).toEqual({ captainId: "captain-a" });
    expect(genericIssueReadScopeForActor({ type: "agent" })).toEqual({ captainId: null });
  });

  it("redacts Arena execution and scorecard metadata on generic surfaces", () => {
    expect(projectArenaIssueForGenericRead(arenaIssue())).toMatchObject({
      executionState: null,
      originFingerprint: null,
    });
    expect(projectArenaWorkProductForGenericRead({
      id: "product-1",
      metadata: { arenaScore: { private: "payload" }, objectKey: "private/key" },
    })).toEqual({ id: "product-1", metadata: null });
  });

  it("bounds concurrent and rate-limited uploads before buffering", () => {
    let now = 1_000;
    const gate = createArenaUploadAdmissionGate({
      maxConcurrent: 1,
      maxGlobalConcurrent: 2,
      maxAttempts: 2,
      windowMs: 60_000,
      now: () => now,
    });
    const first = gate.acquire("captain-a");
    expect(first.allowed).toBe(true);
    expect(gate.acquire("captain-a")).toMatchObject({ allowed: false, reason: "concurrency" });
    if (!first.allowed) throw new TypeError("admission fixture missing");
    first.release();
    const second = gate.acquire("captain-a");
    expect(second.allowed).toBe(true);
    if (!second.allowed) throw new TypeError("second admission fixture missing");
    second.release();
    expect(gate.acquire("captain-a")).toMatchObject({ allowed: false, reason: "rate" });
    now += 60_001;
    expect(gate.acquire("captain-a").allowed).toBe(true);
  });

  it("bounds upload buffering globally across captains", () => {
    const gate = createArenaUploadAdmissionGate({
      maxConcurrent: 1,
      maxGlobalConcurrent: 2,
      maxAttempts: 5,
      windowMs: 60_000,
    });
    const first = gate.acquire("captain-a");
    const second = gate.acquire("captain-b");
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(gate.acquire("captain-c")).toMatchObject({ allowed: false, reason: "concurrency" });
    if (first.allowed) first.release();
    expect(gate.acquire("captain-c").allowed).toBe(true);
    if (second.allowed) second.release();
  });
});

function arenaIssue() {
  return {
    id: "issue-1",
    originKind: "advx_arena_submission",
    responsibleUserId: "captain-a",
    executionState: { arena: { private: "state" } },
    originFingerprint: "a".repeat(64),
  };
}
