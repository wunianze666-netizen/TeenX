import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { HttpError } from "../errors.js";
import type { StorageService } from "../storage/types.js";
import { ARENA_PUBLIC_DIMENSIONS, getArenaChallenge, listArenaChallenges } from "../services/advx-arena-catalog.js";
import { parseArenaCursor } from "../services/advx-arena/event-projector.js";
import {
  projectArenaChallenge,
  projectArenaRunState,
  projectArenaScore,
  projectBoundTeamVersion,
} from "../services/advx-arena/public-projector.js";
import { validateCheckpointArenaScore } from "../services/advx-arena/checkpoint-score-validator.js";
import { throwPublicArenaError } from "../services/advx-arena/public-error.js";
import type { PublicArenaRunDetail, PublicArenaSubmission } from "../services/advx-arena/public-types.js";
import { EvaluationContractError } from "../services/advx-arena/scoring-contract.js";
import { advxArenaRunService } from "../services/advx-arena/run-service.js";
import { streamArenaEvents } from "../services/advx-arena/sse-stream.js";
import { readBoundTeamVersion } from "../services/advx-arena/types.js";
import { canonicalizeArenaUploadFilename } from "../services/advx-arena/upload-filename.js";
import { ARENA_MAX_ZIP_BYTES } from "../services/advx-arena/zip-parser.js";
import { createArenaUploadAdmissionGate, type ArenaUploadAdmissionGate } from "../services/advx-arena/upload-admission.js";
import { assertCaptain } from "./advx-auth.js";

const challengeVersionSchema = z.string().regex(/^[a-zA-Z0-9_-]+:v\d+$/).max(120);
const idSchema = z.string().uuid();
const submissionFieldsSchema = z.object({
  teamVersionId: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().max(120).optional(),
  ),
});

export type AdvxArenaRuntime = ReturnType<typeof advxArenaRunService>;

export function advxArenaRoutes(
  db: Db,
  storage: StorageService,
  runtime = advxArenaRunService(db, storage),
  recovery: Promise<void | boolean> = Promise.resolve(true),
  uploadAdmission: ArenaUploadAdmissionGate = createArenaUploadAdmissionGate({
    maxConcurrent: 1,
    maxGlobalConcurrent: 2,
    maxAttempts: 5,
    windowMs: 60_000,
  }),
) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fields: 1, files: 1, parts: 3, fileSize: ARENA_MAX_ZIP_BYTES },
  }).single("file");

  router.use(async (_req, _res, next) => {
    const recovered = await recovery;
    if (recovered === false) {
      throw new HttpError(503, "Arena 服务正在恢复，请稍后重试", { code: "ARENA_RECOVERY_UNAVAILABLE" });
    }
    next();
  });

  router.get("/challenges", (req, res) => {
    assertCaptain(req);
    res.json(listArenaChallenges().map(projectArenaChallenge));
  });

  router.get("/challenges/:challengeVersionId", async (req, res) => {
    const captainId = assertCaptain(req);
    const challengeVersionId = challengeVersionSchema.parse(req.params.challengeVersionId);
    const challenge = getArenaChallenge(challengeVersionId);
    if (!challenge) throw new HttpError(404, "赛题不存在", { code: "ARENA_CHALLENGE_NOT_FOUND" });
    const submissions = await runtime.repository
      .getChallengeSubmissions(captainId, challengeVersionId)
      .catch(throwPublicArenaError);
    res.json({
      ...projectArenaChallenge(challenge),
      dimensions: ARENA_PUBLIC_DIMENSIONS.map(({ name, maxScore }) => ({ name, maxScore })),
      activeSubmission: submissions.activeSubmission ? projectPublicSubmission(submissions.activeSubmission) : null,
      latestSubmission: submissions.latestSubmission ? projectPublicSubmission(submissions.latestSubmission) : null,
    });
  });

  router.post("/challenges/:challengeVersionId/submissions", async (req, res) => {
    const captainId = assertCaptain(req);
    const challengeVersionId = challengeVersionSchema.parse(req.params.challengeVersionId);
    const challenge = getArenaChallenge(challengeVersionId);
    if (!challenge) throw new HttpError(404, "赛题不存在", { code: "ARENA_CHALLENGE_NOT_FOUND" });
    if (challenge.status !== "open") {
      throw new HttpError(409, challenge.status === "upcoming" ? "赛题尚未开放" : "赛题已经结束", {
        code: challenge.status === "upcoming" ? "ARENA_CHALLENGE_UPCOMING" : "ARENA_CHALLENGE_CLOSED",
      });
    }
    const admission = uploadAdmission.acquire(captainId);
    if (!admission.allowed) {
      res.setHeader("Retry-After", String(admission.retryAfterSeconds));
      throw new HttpError(429, "提交上传过于频繁，请稍后重试", { code: "ARENA_UPLOAD_RATE_LIMITED" });
    }
    try {
      await receiveUpload(upload, req, res);
      const fields = submissionFieldsSchema.parse(req.body);
      if (!req.file?.buffer?.length) throw new HttpError(400, "请选择 ZIP 文件", { code: "ARENA_FILE_REQUIRED" });
      const originalFilename = canonicalizeArenaUploadFilename(req.file.originalname);
      if (!originalFilename?.toLowerCase().endsWith(".zip")) {
        throw new HttpError(422, "只接受 .zip 文件", { code: "ARENA_INVALID_ZIP" });
      }
      const submission = await runtime.repository.createSubmission({
        captainId,
        challengeVersionId,
        challengeTitle: challenge.title,
        file: { buffer: req.file.buffer, originalname: originalFilename },
        teamVersionId: fields.teamVersionId,
      }).catch(throwPublicArenaError);
      res.status(201).json(projectPublicSubmission(submission));
    } finally {
      admission.release();
    }
  });

  router.post("/submissions/:submissionId/runs", async (req, res) => {
    const captainId = assertCaptain(req);
    const submissionId = idSchema.parse(req.params.submissionId);
    const submission = await runtime.repository
      .getSubmissionForCaptain(submissionId, captainId)
      .catch(throwPublicArenaError);
    if (!submission) throw new HttpError(404, "提交不存在", { code: "ARENA_SUBMISSION_NOT_FOUND" });
    if (!getArenaChallenge(submission.challengeVersionId)) {
      throw new HttpError(422, "提交绑定的赛题版本无效", { code: "ARENA_SUBMISSION_INVALID" });
    }
    const result = await runtime.start(submission).catch(throwPublicArenaError);
    res.status(result.reused ? 200 : 201).json(result);
  });

  router.get("/runs/:runId", async (req, res) => {
    const captainId = assertCaptain(req);
    const runId = idSchema.parse(req.params.runId);
    const checkpoint = await getCheckpointForCaptain(runtime, runId, captainId);
    if (!checkpoint) throw new HttpError(404, "评审不存在", { code: "ARENA_RUN_NOT_FOUND" });
    res.json(toPublicRunDetail(checkpoint));
  });

  router.get("/runs/:runId/events", async (req, res) => {
    const captainId = assertCaptain(req);
    const runId = idSchema.parse(req.params.runId);
    if (req.accepts(["text/event-stream"]) !== "text/event-stream") {
      throw new HttpError(406, "此接口需要 text/event-stream", { code: "ARENA_SSE_REQUIRED" });
    }
    const checkpoint = await getCheckpointForCaptain(runtime, runId, captainId);
    if (!checkpoint) throw new HttpError(404, "评审不存在", { code: "ARENA_RUN_NOT_FOUND" });
    const cursor = Math.max(
      parseArenaCursor(req.get("last-event-id")),
      parseArenaCursor(typeof req.query.cursor === "string" ? req.query.cursor : undefined),
    );
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    await streamArenaEvents({ req, res, runtime, runId, captainId, cursor });
  });

  router.post("/runs/:runId/cancel", async (req, res) => {
    const captainId = assertCaptain(req);
    const runId = idSchema.parse(req.params.runId);
    const checkpoint = await getCheckpointForCaptain(runtime, runId, captainId);
    if (!checkpoint) throw new HttpError(404, "评审不存在", { code: "ARENA_RUN_NOT_FOUND" });
    res.json(await runtime.cancel(checkpoint).catch(throwPublicArenaError));
  });

  router.get("/runs/:runId/result", async (req, res) => {
    const captainId = assertCaptain(req);
    const runId = idSchema.parse(req.params.runId);
    const checkpoint = await getCheckpointForCaptain(runtime, runId, captainId);
    if (!checkpoint) throw new HttpError(404, "评审不存在", { code: "ARENA_RUN_NOT_FOUND" });
    if (checkpoint.state.status !== "completed" || !checkpoint.score || !checkpoint.state.scoreWorkProductId) {
      throw new HttpError(409, "成绩尚未生成", { code: "ARENA_RESULT_NOT_READY" });
    }
    try {
      res.json(projectArenaScore(validateCheckpointArenaScore(checkpoint)));
    } catch (error) {
      if (error instanceof EvaluationContractError) throwPublicArenaError(error);
      throw error;
    }
  });

  return router;
}

function toPublicRunDetail(
  checkpoint: Awaited<ReturnType<AdvxArenaRuntime["repository"]["readCheckpoint"]>> & object,
): PublicArenaRunDetail {
  const challenge = getArenaChallenge(checkpoint.challengeVersionId);
  return {
    ...projectArenaRunState(checkpoint.state),
    submissionId: checkpoint.submissionId,
    challengeVersionId: checkpoint.challengeVersionId,
    challengeTitle: challenge?.title ?? "Arena 赛题",
    teamVersionId: checkpoint.teamVersionId,
    boundTeamVersion: projectBoundTeamVersion(readBoundTeamVersion(checkpoint.teamVersionId, checkpoint.boundTeamVersion)),
    dimensions: ARENA_PUBLIC_DIMENSIONS.map(({ name, maxScore }) => ({ name, maxScore })),
  };
}

function projectPublicSubmission(submission: PublicArenaSubmission): PublicArenaSubmission {
  return {
    id: submission.id,
    challengeVersionId: submission.challengeVersionId,
    teamVersionId: submission.teamVersionId,
    boundTeamVersion: projectBoundTeamVersion(submission.boundTeamVersion),
    filename: submission.filename,
    byteSize: submission.byteSize,
    sha256: submission.sha256,
    createdAt: submission.createdAt,
    autoCreatedTeamVersion: submission.autoCreatedTeamVersion,
    run: submission.run ? projectArenaRunState(submission.run) : null,
  };
}

async function getCheckpointForCaptain(runtime: AdvxArenaRuntime, runId: string, captainId: string) {
  return runtime.repository.getCheckpointForCaptain(runId, captainId).catch(throwPublicArenaError);
}

function receiveUpload(
  upload: ReturnType<typeof multer>["single"] extends (...args: never[]) => infer T ? T : never,
  req: Request,
  res: Response,
): Promise<void> {
  return new Promise((resolve, reject) => {
    upload(req, res, (error) => {
      if (!error) {
        resolve();
        return;
      }
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        reject(new HttpError(413, "ZIP 文件不能超过 50 MB", { code: "ARENA_FILE_TOO_LARGE" }));
        return;
      }
      reject(new HttpError(400, "上传请求无效", { code: "ARENA_UPLOAD_INVALID" }));
    });
  });
}
