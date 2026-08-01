import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { HttpError, notFound } from "../errors.js";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import { safePublicNickname } from "../services/teenx-public-text.js";
import { assertInteractiveCaptain } from "./advx-auth.js";
import type { TeenxProfileRouteDependencies } from "./advx-profile.js";

export type TeenxProfileSsoDependencies = Pick<TeenxProfileRouteDependencies, "config" | "store">;

const ssoQuerySchema = z.object({
  sso: z.string().min(1),
  sig: z.string().regex(/^[a-fA-F0-9]{64}$/),
}).strict();

function verifySsoSignature(sso: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(sso).digest("hex"), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function decodeSsoPayload(value: string): URLSearchParams {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length % 4 !== 0) {
    throw new HttpError(400, "Invalid SSO request");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new HttpError(400, "Invalid SSO request");
  try {
    return new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(decoded));
  } catch (error) {
    if (error instanceof TypeError) throw new HttpError(400, "Invalid SSO request");
    throw error;
  }
}

export function advxProfileSsoRoutes(dependencies: TeenxProfileSsoDependencies) {
  const router = Router();
  router.get("/sso/discourse-connect", async (req, res) => {
    if (!dependencies.config.enabled || !dependencies.config.discourseBaseUrl) {
      throw new HttpError(503, "TeenX SSO is not configured");
    }
    if (dependencies.config.ssoMaintenanceLock) {
      throw new HttpError(503, "TeenX SSO is temporarily locked for maintenance");
    }
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const query = ssoQuerySchema.parse(req.query);
    if (!verifySsoSignature(query.sso, query.sig, dependencies.config.discourseConnectSecret)) {
      throw new HttpError(403, "SSO signature rejected");
    }
    const incoming = decodeSsoPayload(query.sso);
    const nonce = incoming.get("nonce");
    const returnUrlText = incoming.get("return_sso_url") ?? incoming.get("return_url");
    if (!nonce || !returnUrlText) {
      throw new HttpError(400, "Invalid SSO request");
    }
    let returnUrl: URL;
    try {
      returnUrl = new URL(returnUrlText);
    } catch (error) {
      if (error instanceof TypeError) throw new HttpError(400, "Invalid SSO return URL");
      throw error;
    }
    if (
      returnUrl.origin !== dependencies.config.discourseBaseUrl.origin
      || returnUrl.pathname !== "/session/sso_login"
      || returnUrl.username !== ""
      || returnUrl.password !== ""
      || returnUrl.search !== ""
      || returnUrl.hash !== ""
    ) {
      throw new HttpError(400, "Invalid SSO return URL");
    }
    const captain = await dependencies.store.getCaptain(captainId);
    if (!captain) throw notFound("Captain not found");
    const identity = createTeenxPublicIdentity(captainId, dependencies.config.publicIdSecret);
    const output = new URLSearchParams({
      nonce,
      external_id: identity.publicId,
      name: safePublicNickname(captain.nickname, identity.publicId),
      username: identity.forumUsername,
      admin: "false",
      moderator: "false",
    });
    const encoded = Buffer.from(output.toString(), "utf8").toString("base64");
    const signature = createHmac("sha256", dependencies.config.discourseConnectSecret)
      .update(encoded)
      .digest("hex");
    res.redirect(302, `/discourse/session/sso_login?sso=${encodeURIComponent(encoded)}&sig=${signature}`);
  });
  return router;
}
