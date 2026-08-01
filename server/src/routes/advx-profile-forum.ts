import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors.js";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import { assertInteractiveCaptain } from "./advx-auth.js";
import type { TeenxProfileRouteDependencies } from "./advx-profile.js";

const discourseSessionSchema = z.object({
  current_user: z.object({ username: z.string() }).passthrough().nullable().optional(),
}).passthrough();

export function advxProfileForumRoutes(dependencies: TeenxProfileRouteDependencies) {
  const router = Router();
  router.get("/forum/session", async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    if (!dependencies.config.enabled || !dependencies.config.discourseBaseUrl) {
      throw new HttpError(503, "论坛服务暂时不可用");
    }
    const discourseBaseUrl = dependencies.config.discourseBaseUrl;
    const discourseCookie = (req.header("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("_t=") || part.startsWith("_forum_session="))
      .join("; ");
    const forumFetch = dependencies.forumFetch ?? fetch;
    let response: Response;
    try {
      response = await forumFetch(`${discourseBaseUrl.origin}/session/current.json`, {
        headers: {
          accept: "application/json",
          ...(discourseCookie ? { cookie: discourseCookie } : {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(dependencies.config.bridgeTimeoutMs),
      });
    } catch (error) {
      if (error instanceof TypeError || error instanceof DOMException) {
        throw new HttpError(503, "论坛服务暂时不可用");
      }
      throw error;
    }
    if ([401, 403, 404].includes(response.status)) {
      res.json({ connected: false, username: null, reconnectRequired: false });
      return;
    }
    if (!response.ok) throw new HttpError(503, "论坛服务暂时不可用");
    const payload = discourseSessionSchema.parse(await response.json());
    const username = payload.current_user?.username ?? null;
    const expected = createTeenxPublicIdentity(captainId, dependencies.config.publicIdSecret).forumUsername;
    if (username !== expected) {
      res.json({ connected: false, username: null, reconnectRequired: username !== null });
      return;
    }
    res.json({ connected: true, username, reconnectRequired: false });
  });
  return router;
}
