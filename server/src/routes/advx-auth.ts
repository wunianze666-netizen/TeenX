import type { Request } from "express";
import { unauthorized } from "../errors.js";
import type { TeenxProfileConfig } from "../services/teenx-profile-config.js";
import { assertBoard } from "./authz.js";

export function assertCaptain(req: Request): string {
  assertBoard(req);
  return req.actor.userId ?? "local-board";
}

export function assertInteractiveCaptain(req: Request, config: TeenxProfileConfig): string {
  if (req.actor.type !== "board" || !req.actor.userId) {
    throw unauthorized("TeenX interactive session required");
  }
  if (req.actor.source === "session" && req.actor.sessionId) return req.actor.userId;
  if (req.actor.source === "local_implicit" && config.allowLocalFixture) return req.actor.userId;
  throw unauthorized("TeenX interactive session required");
}
