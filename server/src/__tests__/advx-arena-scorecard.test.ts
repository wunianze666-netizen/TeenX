import { randomUUID } from "node:crypto";
import { companies, createDb, issues } from "@paperclipai/db";
import { describe, expect, it } from "vitest";
import { buildArenaScorecardMetadata } from "../services/advx-arena/scorecard-metadata.js";
import type { PublicArenaScore } from "../services/advx-arena/public-types.js";
import type { ArenaRunCheckpoint } from "../services/advx-arena/types.js";
import { getArenaChallenge } from "../services/advx-arena-catalog.js";
import { createArenaScorecardStore } from "../services/advx-arena/scorecard-store.js";
import { canonicalPublicScore } from "./advx-arena-score-fixtures.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describe("ADVX Arena scorecard metadata", () => {
  it("recursively stores only projected public score fields", () => {
    const score = unsafeScore();
    const metadata = buildArenaScorecardMetadata(checkpoint(score), score);

    expect(metadata.arenaScore.dimensions[0]?.subScores[0]?.evidence[0]).toEqual({
      path: "src/app.ts",
      lineStart: 1,
      lineEnd: 1,
      quote: "const safe = true;",
      verified: true,
    });
    expect(metadata.challengeDigest).toMatch(/^[a-f0-9]{64}$/);
    const payload = JSON.stringify(metadata);
    for (const forbidden of ["objectKey", "prompt", "privateReview", "rawContent", "tokenUsage", "cost"]) {
      expect(payload).not.toContain(forbidden);
    }
  });

  it("rejects invalid score arithmetic before creating metadata", () => {
    const score = canonicalPublicScore();
    score.totalScore = 1;
    expect(() => buildArenaScorecardMetadata(checkpoint(score), score)).toThrow("公开评分不符合契约");
  });

  it.each([
    ["submission identity", (target: ArenaRunCheckpoint) => { target.submissionId = "different-submission"; }],
    ["team version identity", (target: ArenaRunCheckpoint) => { target.teamVersionId = "different-version"; }],
    ["artifact identity", (target: ArenaRunCheckpoint) => { target.submissionSha256 = "b".repeat(64); }],
    ["evaluation mode", (target: ArenaRunCheckpoint) => { target.official = true; }],
    ["challenge digest", (target: ArenaRunCheckpoint) => { target.challengeDigest = "b".repeat(64); }],
    ["standard challenge identity", (target: ArenaRunCheckpoint) => {
      if (!target.standard) throw new TypeError("standard fixture missing");
      target.standard.challengeVersionId = "different-challenge:v1";
    }],
    ["standard provenance", (target: ArenaRunCheckpoint) => {
      if (!target.standard) throw new TypeError("standard fixture missing");
      target.standard.provenance.mode = "official";
    }],
    ["standard model provenance", (target: ArenaRunCheckpoint) => {
      if (!target.standard) throw new TypeError("standard fixture missing");
      target.standard.provenance.model = "tampered-model";
    }],
    ["standard policy provenance", (target: ArenaRunCheckpoint) => {
      if (!target.standard) throw new TypeError("standard fixture missing");
      Reflect.set(target.standard.provenance, "policy", "tampered-policy");
    }],
  ])("rejects persisted score drift in %s", (_name, mutate) => {
    const score = canonicalPublicScore();
    const target = checkpoint(score);
    mutate(target);
    expect(() => buildArenaScorecardMetadata(target, score)).toThrow();
  });

  it("rejects a non-string recovered score id with a contract error", () => {
    const score = canonicalPublicScore();
    Reflect.set(score, "id", 42);
    expect(() => buildArenaScorecardMetadata(checkpoint(score), score)).toThrow("评分身份无效");
  });
});

describeEmbeddedPostgres("ADVX Arena scorecard dedup validation", () => {
  it("validates a recovered score before returning an existing scorecard", async () => {
    const database = await startEmbeddedPostgresTestDatabase("advx-scorecard-dedup-db-");
    const db = createDb(database.connectionString);
    try {
      const companyId = randomUUID();
      const submissionId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "Scorecard Validation Team",
        issuePrefix: `SC${companyId.slice(0, 6).toUpperCase()}`,
        defaultResponsibleUserId: "scorecard-captain",
      });
      await db.insert(issues).values({
        id: submissionId,
        companyId,
        title: "Scorecard validation submission",
        originKind: "advx_arena_submission",
        originId: "todo-web:v1",
        originFingerprint: "a".repeat(64),
        createdByUserId: "scorecard-captain",
        responsibleUserId: "scorecard-captain",
      });
      const score = canonicalPublicScore();
      score.submissionId = submissionId;
      const target = checkpoint(score);
      target.submissionId = submissionId;
      target.teamId = companyId;
      target.captainId = "scorecard-captain";
      const store = createArenaScorecardStore(db);
      const existingId = await store.createScorecard(target);
      const standard = target.standard;
      if (!standard) throw new TypeError("standard fixture missing");
      standard.provenance.model = "tampered-after-first-scorecard";

      await expect(store.createScorecard(target)).rejects.toThrow("评分来源与评审模式不一致");
      expect(existingId).toBeTruthy();
    } finally {
      await database.cleanup();
    }
  }, 30_000);
});

function checkpoint(score: PublicArenaScore): ArenaRunCheckpoint {
  const runId = "10000000-0000-4000-8000-000000000001";
  const challenge = getArenaChallenge(score.challengeVersionId);
  if (!challenge) throw new TypeError("challenge fixture missing");
  return {
    schemaVersion: 1,
    runId,
    submissionId: score.submissionId,
    teamId: "30000000-0000-4000-8000-000000000001",
    captainId: "captain-a",
    challengeVersionId: score.challengeVersionId,
    teamVersionId: score.teamVersionId,
    boundTeamVersion: {
      id: score.teamVersionId,
      versionNumber: 1,
      label: "Version 1",
      teamName: "Arena Team",
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    attachmentId: "40000000-0000-4000-8000-000000000001",
    submissionSha256: score.submissionSha256,
    originalFilename: "submission.zip",
    official: score.official,
    state: {
      runId,
      status: "completed",
      stage: "summary",
      completedDimensions: [],
      startedAt: "2026-07-25T00:00:00.000Z",
      finishedAt: "2026-07-25T00:01:00.000Z",
      failureCode: null,
      failureMessage: null,
      scoreWorkProductId: "50000000-0000-4000-8000-000000000001",
    },
    cancelRequestedAt: null,
    modelCallCount: 1,
    dimensionScores: {},
    score,
    events: [],
    challengeDigest: challenge.contentDigest,
    standard: {
      id: "standard-scorecard",
      challengeVersionId: challenge.challengeVersionId,
      criteria: [],
      totalMaxScore: 1000,
      rubricVersion: "arena-rubric-v3",
      generatedAt: "2026-07-25T00:00:00.000Z",
      challengeDigest: challenge.contentDigest,
      provenance: { mode: "mock", model: "mock", policy: "deepseek-fixed-v1" },
    },
  };
}

function unsafeScore(): PublicArenaScore {
  const score = canonicalPublicScore();
  const dimension = score.dimensions[0];
  const subScore = dimension?.subScores[0];
  if (!dimension || !subScore) throw new TypeError("canonical score fixture missing");
  const evidence = Object.assign({
    path: "src/app.ts",
    lineStart: 1,
    lineEnd: 1,
    quote: "const safe = true;",
    verified: true as const,
  }, { objectKey: "private/key" });
  subScore.evidence = [evidence];
  Object.assign(subScore, { prompt: "private" });
  Object.assign(dimension, { privateReview: "private" });
  return Object.assign(score, { rawContent: "private", tokenUsage: 100, cost: 1 });
}
