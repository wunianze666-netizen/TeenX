import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { appendArenaEvent } from "../services/advx-arena/event-projector.js";
import { ArenaRepositoryError } from "../services/advx-arena/repository.js";
import {
  boardActor,
  boundTeamVersion,
  createArenaRouteTestApp,
  echoUploadArenaRuntime,
  fakeArenaRuntime,
  publicSubmission,
  rawMultipartFile,
  runningCheckpoint,
  terminalCheckpoint,
  unsafeScore,
} from "./advx-arena-route-fixtures.js";

describe("ADVX Arena public routes", () => {
  it("requires an authenticated captain", async () => {
    const app = createArenaRouteTestApp({ actor: { type: "none" }, runtime: fakeArenaRuntime() });
    const response = await request(app).get("/api/advx/arena/challenges");
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Board access required");
  });

  it("rejects upload admission before Multer buffers the request", async () => {
    const runtime = fakeArenaRuntime();
    const app = createArenaRouteTestApp({
      actor: boardActor(),
      runtime,
      uploadAdmission: {
        acquire: () => ({ allowed: false, reason: "concurrency", retryAfterSeconds: 1 }),
      },
    });
    const response = await request(app)
      .post("/api/advx/arena/challenges/todo-web:v1/submissions")
      .attach("file", Buffer.from("not parsed"), "submission.zip");
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ code: "ARENA_UPLOAD_RATE_LIMITED" });
    expect(runtime.repository.createSubmission).not.toHaveBeenCalled();
  });

  it("accepts a multipart upload with an explicit team version", async () => {
    const runtime = echoUploadArenaRuntime();
    const app = createArenaRouteTestApp({ actor: boardActor(), runtime });
    const explicitTeamVersionId = boundTeamVersion(1).id;

    const response = await request(app)
      .post("/api/advx/arena/challenges/todo-web:v1/submissions")
      .attach("file", Buffer.from("PK\u0003\u0004test"), "submission.zip")
      .field("teamVersionId", explicitTeamVersionId);

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(runtime.repository.createSubmission).toHaveBeenCalledWith(expect.objectContaining({
      teamVersionId: explicitTeamVersionId,
    }));
  });

  it.each([
    { label: "omitted", teamVersionId: undefined },
    { label: "blank", teamVersionId: "" },
  ])("keeps auto-snapshot selection when teamVersionId is $label", async ({ teamVersionId }) => {
    const runtime = echoUploadArenaRuntime();
    const app = createArenaRouteTestApp({ actor: boardActor(), runtime });
    const uploadRequest = request(app)
      .post("/api/advx/arena/challenges/todo-web:v1/submissions")
      .attach("file", Buffer.from("PK\u0003\u0004test"), "submission.zip");
    if (teamVersionId !== undefined) uploadRequest.field("teamVersionId", teamVersionId);

    const response = await uploadRequest;

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(runtime.repository.createSubmission).toHaveBeenCalledWith(expect.objectContaining({
      teamVersionId: undefined,
    }));
  });

  it.each([
    { label: "POSIX path", filename: "../../private/build/submission.zip", expectedFilename: "submission.zip" },
    { label: "Windows path", filename: "C:\\private\\build\\submission.zip", expectedFilename: "submission.zip" },
    { label: "UNC path", filename: "\\\\server\\share\\submission.zip", expectedFilename: "submission.zip" },
    { label: "mixed-separator path", filename: "/private\\build/final.zip", expectedFilename: "final.zip" },
    { label: "Unicode normalization", filename: "cafe\u0301.zip", expectedFilename: "caf\u00e9.zip" },
    { label: "control and bidi controls", filename: "safe\u0001\u202e\u2066.zip", expectedFilename: "safe.zip" },
    { label: "unsafe surrounding dots and spaces", filename: "... submission.zip ...", expectedFilename: "submission.zip" },
    { label: "overlong Unicode name", filename: `${"界".repeat(100)}.zip`, expectedFilename: `${"界".repeat(83)}.zip` },
  ])("canonicalizes a $label multipart filename before persistence", async ({ filename, expectedFilename }) => {
    const runtime = echoUploadArenaRuntime();
    const app = createArenaRouteTestApp({ actor: boardActor(), runtime });
    const multipart = rawMultipartFile(filename);
    const response = await request(app)
      .post("/api/advx/arena/challenges/todo-web:v1/submissions")
      .set("Content-Type", multipart.contentType)
      .send(multipart.body);
    expect(response.status).toBe(201);
    expect(response.body.filename).toBe(expectedFilename);
    expect(runtime.repository.createSubmission).toHaveBeenCalledWith(expect.objectContaining({
      file: expect.objectContaining({ originalname: expectedFilename }),
    }));
  });

  it.each([
    { label: "dot-and-space-only name", filename: "...   ..." },
    { label: "extension-only name", filename: ".zip" },
    { label: "non-ZIP basename", filename: "private/build/submission.txt" },
  ])("rejects a $label after multipart filename canonicalization", async ({ filename }) => {
    const runtime = echoUploadArenaRuntime();
    const app = createArenaRouteTestApp({ actor: boardActor(), runtime });
    const multipart = rawMultipartFile(filename);
    const response = await request(app)
      .post("/api/advx/arena/challenges/todo-web:v1/submissions")
      .set("Content-Type", multipart.contentType)
      .send(multipart.body);
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: "ARENA_INVALID_ZIP" });
    expect(runtime.repository.createSubmission).not.toHaveBeenCalled();
  });

  it("returns the same 404 for cross-team run access", async () => {
    const runtime = fakeArenaRuntime();
    runtime.repository.getCheckpointForCaptain = vi.fn(async () => null);
    const app = createArenaRouteTestApp({ actor: boardActor(), runtime });
    const response = await request(app).get("/api/advx/arena/runs/10000000-0000-4000-8000-000000000001");
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: "评审不存在", code: "ARENA_RUN_NOT_FOUND" });
  });

  it("replays only whitelisted SSE events after Last-Event-ID", async () => {
    const checkpoint = terminalCheckpoint();
    const app = createArenaRouteTestApp({ actor: boardActor(), runtime: fakeArenaRuntime(checkpoint) });
    const response = await request(app)
      .get(`/api/advx/arena/runs/${checkpoint.runId}/events`)
      .set("Accept", "application/json;q=0.2, text/event-stream")
      .set("Last-Event-ID", "1");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.headers["x-accel-buffering"]).toBe("no");
    expect(response.text).toContain("id: 2\n");
    expect(response.text).toContain('"type":"run_completed"');
    expect(response.text).not.toContain("id: 1\n");
  });

  it("merges synchronous live SSE events with a second checkpoint read in contiguous order", async () => {
    const first = runningCheckpoint();
    const second = terminalCheckpoint();
    const originalTerminalEvent = second.events[1]?.event;
    second.events.splice(1);
    appendArenaEvent(second.events, { type: "stage", stage: "summary", status: "completed" });
    if (!originalTerminalEvent) throw new Error("terminal event fixture missing");
    const terminalEvent = appendArenaEvent(second.events, originalTerminalEvent);
    const runtime = fakeArenaRuntime(first);
    runtime.repository.getCheckpointForCaptain = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    runtime.subscribe = vi.fn((_runId, listener) => {
      listener(terminalEvent);
      return vi.fn();
    });
    const app = createArenaRouteTestApp({ actor: boardActor(), runtime });
    const response = await request(app)
      .get(`/api/advx/arena/runs/${first.runId}/events`)
      .set("Accept", "text/event-stream")
      .set("Last-Event-ID", "1");
    expect([...response.text.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]))).toEqual([2, 3]);
    expect(response.text).toContain('"type":"run_completed"');
    expect(runtime.repository.getCheckpointForCaptain).toHaveBeenCalledTimes(2);
  });

  it("waits for startup recovery before serving Arena routes", async () => {
    let releaseRecovery: (() => void) | undefined;
    const recovery = new Promise<void>((resolve) => { releaseRecovery = resolve; });
    const runtime = fakeArenaRuntime();
    const getChallengeSubmissions = vi.fn(async () => ({ activeSubmission: null, latestSubmission: null }));
    Object.assign(runtime.repository, { getChallengeSubmissions });
    const app = createArenaRouteTestApp({ actor: boardActor(), runtime, recovery });
    const pending = request(app).get("/api/advx/arena/challenges/todo-web:v1").then((response) => response);
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(getChallengeSubmissions).not.toHaveBeenCalled();
    releaseRecovery?.();
    expect((await pending).status).toBe(200);
    expect(getChallengeSubmissions).toHaveBeenCalledOnce();
  });

  it("returns separate active and latest submissions with immutable bound version descriptors", async () => {
    const runtime = fakeArenaRuntime();
    const activeSubmission = publicSubmission("20000000-0000-4000-8000-000000000001", "running", 1);
    const latestSubmission = publicSubmission("20000000-0000-4000-8000-000000000002", "completed", 2);
    Object.assign(runtime.repository, {
      getChallengeSubmissions: vi.fn(async () => ({ activeSubmission, latestSubmission })),
    });
    const response = await request(createArenaRouteTestApp({ actor: boardActor(), runtime }))
      .get("/api/advx/arena/challenges/todo-web:v1");
    expect(response.body.activeSubmission.id).toBe(activeSubmission.id);
    expect(response.body.latestSubmission.id).toBe(latestSubmission.id);
    expect(response.body.activeSubmission.boundTeamVersion).toEqual(boundTeamVersion(1));
    expect(response.body.activeSubmission.boundTeamVersion).not.toHaveProperty("members");
  });

  it("returns a redacted run projection rather than its checkpoint", async () => {
    const checkpoint = terminalCheckpoint();
    Object.assign(checkpoint.state, { nestedSecret: { prompt: "do not expose" } });
    const response = await request(createArenaRouteTestApp({ actor: boardActor(), runtime: fakeArenaRuntime(checkpoint) }))
      .get(`/api/advx/arena/runs/${checkpoint.runId}`);
    expect(response.body).toMatchObject({
      runId: checkpoint.runId,
      submissionId: checkpoint.submissionId,
      status: "completed",
      boundTeamVersion: boundTeamVersion(1),
    });
    expect(response.body.dimensions).toHaveLength(8);
    expect(response.body).not.toHaveProperty("nestedSecret");
  });

  it("projects a pre-remediation checkpoint with an ID-only bound version", async () => {
    const checkpoint = terminalCheckpoint();
    Reflect.deleteProperty(checkpoint, "boundTeamVersion");
    const response = await request(createArenaRouteTestApp({ actor: boardActor(), runtime: fakeArenaRuntime(checkpoint) }))
      .get(`/api/advx/arena/runs/${checkpoint.runId}`);
    expect(response.status).toBe(200);
    expect(response.body.boundTeamVersion).toEqual({
      id: checkpoint.teamVersionId,
      versionNumber: null,
      label: null,
      teamName: null,
      createdAt: null,
    });
  });

  it("recursively projects result score fields from an exact public allowlist", async () => {
    const checkpoint = terminalCheckpoint();
    checkpoint.score = unsafeScore();
    const response = await request(createArenaRouteTestApp({ actor: boardActor(), runtime: fakeArenaRuntime(checkpoint) }))
      .get(`/api/advx/arena/runs/${checkpoint.runId}/result`);
    expect(response.body.dimensions[0].subScores[0].evidence[0]).toEqual({
      path: "src/app.ts",
      lineStart: 1,
      lineEnd: 1,
      quote: "const safe = true;",
      verified: true,
    });
    expect(JSON.stringify(response.body)).not.toContain("objectKey");
  });

  it("rejects tampered persisted result data with a sanitized public error", async () => {
    const checkpoint = terminalCheckpoint();
    const score = unsafeScore();
    firstDimension(score).name = "private-malformed-dimension";
    checkpoint.score = score;
    const response = await request(createArenaRouteTestApp({ actor: boardActor(), runtime: fakeArenaRuntime(checkpoint) }))
      .get(`/api/advx/arena/runs/${checkpoint.runId}/result`);
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: "ARENA_RESULT_INVALID", error: "评分结果暂时不可用" });
    expect(JSON.stringify(response.body)).not.toContain("private-malformed-dimension");
  });

  it("maps repository failures to explicit safe public errors", async () => {
    const runtime = fakeArenaRuntime();
    runtime.repository.getCheckpointForCaptain = vi.fn(async () => {
      throw new ArenaRepositoryError("ARENA_CHECKPOINT_INVALID", "private checkpoint path leaked");
    });
    const response = await request(createArenaRouteTestApp({ actor: boardActor(), runtime }))
      .get("/api/advx/arena/runs/10000000-0000-4000-8000-000000000001");
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: "ARENA_CHECKPOINT_INVALID", error: "评审进度无效" });
    expect(JSON.stringify(response.body)).not.toContain("private checkpoint path leaked");
  });
});

function firstDimension(score: ReturnType<typeof unsafeScore>) {
  const dimension = score.dimensions[0];
  if (!dimension) throw new TypeError("canonical score fixture missing");
  return dimension;
}
