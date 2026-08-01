import express from "express";
import { vi } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import { advxArenaRoutes, type AdvxArenaRuntime } from "../routes/advx-arena.js";
import { appendArenaEvent } from "../services/advx-arena/event-projector.js";
import type { PublicArenaScore } from "../services/advx-arena/public-types.js";
import type { ArenaRunCheckpoint } from "../services/advx-arena/types.js";
import type { ArenaUploadAdmissionGate } from "../services/advx-arena/upload-admission.js";
import { canonicalPublicScore } from "./advx-arena-score-fixtures.js";
import { getArenaChallenge } from "../services/advx-arena-catalog.js";

export function createArenaRouteTestApp(input: {
  actor: Record<string, unknown>;
  runtime: AdvxArenaRuntime;
  recovery?: Promise<void>;
  uploadAdmission?: ArenaUploadAdmissionGate;
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { actor: input.actor });
    next();
  });
  app.use(
    "/api/advx/arena",
    advxArenaRoutes({} as never, {} as never, input.runtime, input.recovery ?? Promise.resolve(), input.uploadAdmission),
  );
  app.use(errorHandler);
  return app;
}

export function rawMultipartFile(filename: string, contents = Buffer.from("PK\u0003\u0004test")) {
  const boundary = "advx-arena-upload-boundary";
  const encodedFilename = encodeURIComponent(filename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename*=UTF-8''${encodedFilename}\r\nContent-Type: application/zip\r\n\r\n`,
      ),
      contents,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

export function boardActor() {
  return {
    type: "board",
    userId: "captain-a",
    source: "local_implicit",
    isInstanceAdmin: false,
    companyIds: ["30000000-0000-4000-8000-000000000001"],
  };
}

export function fakeArenaRuntime(checkpoint: ArenaRunCheckpoint | null = null): AdvxArenaRuntime {
  const runtime = {
    repository: {
      getLatestSubmission: vi.fn(async () => null),
      createSubmission: vi.fn(),
      getChallengeSubmissions: vi.fn(async () => ({ activeSubmission: null, latestSubmission: null })),
      getCheckpointForCaptain: vi.fn(async () => checkpoint),
    },
    start: vi.fn(),
    cancel: vi.fn(),
    recover: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    shutdown: vi.fn(),
    health: vi.fn(() => ({
      enabled: true,
      status: "ok" as const,
      singleServerOnly: true as const,
      activeRuns: 0,
      modelAvailable: true,
      mockEnabled: true,
    })),
  };
  return runtime as never;
}

export function echoUploadArenaRuntime(): AdvxArenaRuntime {
  const runtime = fakeArenaRuntime();
  runtime.repository.createSubmission = vi.fn(async (input) => ({
    ...publicSubmission("20000000-0000-4000-8000-000000000009", "completed", 1),
    filename: input.file.originalname,
    byteSize: input.file.buffer.length,
    run: null,
  }));
  return runtime;
}

export function runningCheckpoint(): ArenaRunCheckpoint {
  const checkpoint = terminalCheckpoint();
  checkpoint.state.status = "running";
  checkpoint.state.stage = "analysis";
  checkpoint.state.finishedAt = null;
  checkpoint.state.scoreWorkProductId = null;
  checkpoint.events.splice(1);
  return checkpoint;
}

export function boundTeamVersion(versionNumber: number) {
  return {
    id: `v${versionNumber}-test`,
    versionNumber,
    label: `Version ${versionNumber}`,
    teamName: `Team ${versionNumber}`,
    createdAt: "2026-07-25T00:00:00.000Z",
  };
}

export function publicSubmission(id: string, status: "running" | "completed", versionNumber: number) {
  return {
    id,
    challengeVersionId: "todo-web:v1",
    teamVersionId: `v${versionNumber}-test`,
    boundTeamVersion: boundTeamVersion(versionNumber),
    filename: `submission-${versionNumber}.zip`,
    byteSize: 100,
    sha256: String(versionNumber).repeat(64),
    createdAt: `2026-07-25T00:0${versionNumber}:00.000Z`,
    autoCreatedTeamVersion: false,
    run: {
      runId: `10000000-0000-4000-8000-00000000000${versionNumber}`,
      status,
      stage: status === "running" ? "analysis" as const : "summary" as const,
      completedDimensions: [],
      startedAt: "2026-07-25T00:00:00.000Z",
      finishedAt: status === "completed" ? "2026-07-25T00:01:00.000Z" : null,
      failureCode: null,
      failureMessage: null,
      scoreWorkProductId: status === "completed" ? "50000000-0000-4000-8000-000000000001" : null,
    },
  };
}

export function unsafeScore(): PublicArenaScore {
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

export function terminalCheckpoint(): ArenaRunCheckpoint {
  const runId = "10000000-0000-4000-8000-000000000001";
  const challenge = getArenaChallenge("todo-web:v1");
  if (!challenge) throw new TypeError("challenge fixture missing");
  const checkpoint: ArenaRunCheckpoint = {
    schemaVersion: 1,
    runId,
    submissionId: "20000000-0000-4000-8000-000000000001",
    teamId: "30000000-0000-4000-8000-000000000001",
    captainId: "captain-a",
    challengeVersionId: "todo-web:v1",
    teamVersionId: "v1-test",
    boundTeamVersion: boundTeamVersion(1),
    attachmentId: "40000000-0000-4000-8000-000000000001",
    submissionSha256: "a".repeat(64),
    originalFilename: "submission.zip",
    official: false,
    state: {
      runId,
      status: "completed",
      stage: "summary",
      completedDimensions: ["需求符合度", "规则遵循", "代码/实现质量", "创新性", "趣味性/体验感", "视觉/审美", "问题解决能力", "完成度与细节"],
      startedAt: "2026-07-25T00:00:00.000Z",
      finishedAt: "2026-07-25T00:01:00.000Z",
      failureCode: null,
      failureMessage: null,
      scoreWorkProductId: "50000000-0000-4000-8000-000000000001",
    },
    cancelRequestedAt: null,
    modelCallCount: 30,
    dimensionScores: {},
    sourceText: "private source",
    events: [],
    challengeDigest: challenge.contentDigest,
    standard: {
      id: "standard-route",
      challengeVersionId: challenge.challengeVersionId,
      criteria: [],
      totalMaxScore: 1000,
      rubricVersion: "arena-rubric-v3",
      generatedAt: "2026-07-25T00:00:00.000Z",
      challengeDigest: challenge.contentDigest,
      provenance: { mode: "mock", model: "mock", policy: "deepseek-fixed-v1" },
    },
  };
  appendArenaEvent(checkpoint.events, { type: "run_started", runId, startedAt: checkpoint.state.startedAt ?? "" });
  appendArenaEvent(checkpoint.events, {
    type: "run_completed",
    runId,
    scoreWorkProductId: checkpoint.state.scoreWorkProductId ?? "",
  });
  return checkpoint;
}
