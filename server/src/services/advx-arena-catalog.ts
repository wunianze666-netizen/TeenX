import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DIMENSION_SKELETON, TOTAL_MAX_SCORE } from "./advx-arena/scoring-contract.js";
import type { ArenaChallenge } from "./advx-arena/types.js";

const challengeSchema = z.object({
  id: z.string().min(1).max(80),
  version: z.number().int().positive(),
  challengeVersionId: z.string().min(3).max(120),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(2_000),
  goal: z.string().min(1).max(5_000),
  rules: z.string().min(1).max(8_000),
  submitType: z.literal("zip"),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  status: z.enum(["upcoming", "open", "closed"]),
});

function loadChallenges(): ArenaChallenge[] {
  const directory = fileURLToPath(new URL("../built-ins/advx-arena/challenges", import.meta.url));
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const challenge = challengeSchema.parse(JSON.parse(readFileSync(path.join(directory, name), "utf8")));
      if (challenge.challengeVersionId !== `${challenge.id}:v${challenge.version}`) {
        throw new Error(`Invalid Arena challenge version id in ${name}`);
      }
      if (Date.parse(challenge.opensAt) >= Date.parse(challenge.closesAt)) {
        throw new Error(`Invalid Arena challenge dates in ${name}`);
      }
      const canonicalContent = JSON.stringify({
        id: challenge.id,
        version: challenge.version,
        challengeVersionId: challenge.challengeVersionId,
        title: challenge.title,
        description: challenge.description,
        goal: challenge.goal,
        rules: challenge.rules,
        submitType: challenge.submitType,
        opensAt: challenge.opensAt,
        closesAt: challenge.closesAt,
      });
      return { ...challenge, contentDigest: createHash("sha256").update(canonicalContent).digest("hex") };
    });
}

const CHALLENGES = loadChallenges();

function currentStatus(challenge: ArenaChallenge, now = Date.now()): ArenaChallenge["status"] {
  if (now < Date.parse(challenge.opensAt)) return "upcoming";
  if (now > Date.parse(challenge.closesAt)) return "closed";
  return "open";
}

export function listArenaChallenges(): ArenaChallenge[] {
  return CHALLENGES.map((challenge) => ({ ...challenge, status: currentStatus(challenge) }));
}

export function getArenaChallenge(challengeVersionId: string): ArenaChallenge | null {
  const challenge = CHALLENGES.find((item) => item.challengeVersionId === challengeVersionId);
  return challenge ? { ...challenge, status: currentStatus(challenge) } : null;
}

export const ARENA_PUBLIC_DIMENSIONS = DIMENSION_SKELETON.map((dimension) => ({
  name: dimension.name,
  maxScore: dimension.maxScore,
  weight: dimension.maxScore / TOTAL_MAX_SCORE,
}));
