import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors.js";
import { validate } from "../middleware/validate.js";
import type { AdvxServerProfile } from "../services/advx-demo/profile.js";
import type { AdvxDemoService } from "../services/advx-demo/service.js";
import { assertCaptain } from "./advx-auth.js";

const emptyBodySchema = z.object({}).strict();

function requireProfile(
  actual: AdvxServerProfile,
  expected: Exclude<AdvxServerProfile, "real"> | "prepared",
): void {
  const matches = expected === "prepared" ? actual !== "real" : actual === expected;
  if (!matches) {
    throw new HttpError(404, "ADVX Demo capability is unavailable", {
      code: "ADVX_DEMO_PROFILE_MISMATCH",
    });
  }
}

export function advxDemoRoutes(profile: AdvxServerProfile, service: AdvxDemoService) {
  const router = Router();

  router.post("/bootstrap", validate(emptyBodySchema), async (req, res) => {
    requireProfile(profile, "prepared");
    res.json(await service.bootstrap(assertCaptain(req)));
  });

  router.get("/community", async (req, res) => {
    requireProfile(profile, "prepared");
    res.json(await service.community(assertCaptain(req)));
  });

  router.get("/leaderboard", async (req, res) => {
    requireProfile(profile, "prepared");
    res.json(await service.leaderboard(assertCaptain(req)));
  });

  router.post("/prepared-submission", validate(emptyBodySchema), async (req, res) => {
    requireProfile(profile, "prepared_demo");
    const result = await service.createPreparedSubmission(assertCaptain(req));
    res.status(result.run.reused ? 200 : 201).json(result);
  });

  router.get("/replay", async (req, res) => {
    requireProfile(profile, "prepared_replay");
    res.json(await service.replay(assertCaptain(req)));
  });

  return router;
}
