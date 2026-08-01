import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors.js";
import { validate } from "../middleware/validate.js";
import {
  TeenxBridgeHttpError,
  TeenxBridgeProtocolError,
  type TeenxBridgeRequest,
} from "../services/teenx-profile-bridge-client.js";
import {
  contactGrantPageSchema,
  contactCursorSchema,
  contactMutationResponseSchema,
  contactRequestPageSchema,
  publicIdSchema,
} from "../services/teenx-profile-contract.js";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import { safeAvatarPath, safePublicNickname } from "../services/teenx-public-text.js";
import { assertInteractiveCaptain } from "./advx-auth.js";
import type { TeenxProfileRouteDependencies } from "./advx-profile.js";

const createRequestSchema = z.object({ targetPublicId: publicIdSchema }).strict();
const decideRequestSchema = z.object({ decision: z.enum(["accept", "decline"]) }).strict();
const requestIdSchema = z.string().uuid();
const emptyBodySchema = z.object({}).strict().default({});
const listRequestsQuerySchema = z.object({
  box: z.enum(["inbox", "sent"]),
  cursor: contactCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict();
const listContactsQuerySchema = z.object({
  cursor: contactCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict();
const contactActionQuerySchema = z.object({ action: z.enum(["sever", "block"]) }).strict();

export function advxProfileContactRoutes(dependencies: TeenxProfileRouteDependencies) {
  const router = Router();
  const actorPublicId = (captainId: string) =>
    createTeenxPublicIdentity(captainId, dependencies.config.publicIdSecret).publicId;
  const bridgeRequest = async <T>(
    request: TeenxBridgeRequest,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> => {
    try {
      return await dependencies.bridge.request(request, schema);
    } catch (error) {
      if (error instanceof TeenxBridgeHttpError) {
        const status = [400, 404, 409, 422, 429].includes(error.status) ? error.status : 503;
        throw new HttpError(status, status === 404 ? "联络记录不存在" : "社区联络服务暂时不可用");
      }
      if (error instanceof TeenxBridgeProtocolError || error instanceof TypeError || error instanceof DOMException || error instanceof z.ZodError) {
        throw new HttpError(503, "社区联络服务暂时不可用");
      }
      throw error;
    }
  };
  const counterpart = (input: z.infer<typeof contactRequestPageSchema>["items"][number]["counterpart"]) => ({
    publicId: input.publicId,
    nickname: safePublicNickname(input.nickname, input.publicId),
    avatarPath: safeAvatarPath(input.avatarPath),
  });
  const requestPage = (input: z.infer<typeof contactRequestPageSchema>) => ({
    items: input.items.map((item) => ({ ...item, counterpart: counterpart(item.counterpart) })),
    nextCursor: input.nextCursor,
  });
  const grantPage = (input: z.infer<typeof contactGrantPageSchema>) => ({
    items: input.items.map((item) => ({ ...item, counterpart: counterpart(item.counterpart) })),
    nextCursor: input.nextCursor,
  });
  const mutation = (input: z.infer<typeof contactMutationResponseSchema>) => ({
    ok: true as const,
    ...(input.viewerActions ? { viewerActions: { ...input.viewerActions, forumMessagePath: null } } : {}),
    ...(input.request ? { request: { ...input.request, counterpart: counterpart(input.request.counterpart) } } : {}),
    ...(input.grant ? { grant: { ...input.grant, counterpart: counterpart(input.grant.counterpart) } } : {}),
  });

  router.get("/me/contact-requests", async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const query = listRequestsQuerySchema.parse(req.query);
    const result = await bridgeRequest({
      method: "GET",
      path: "/contact-requests",
      query: {
        actorPublicId: actorPublicId(captainId),
        box: query.box,
        cursor: query.cursor,
        limit: String(query.limit),
      },
    }, contactRequestPageSchema);
    res.json(requestPage(result));
  });

  router.get("/me/contacts", async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const query = listContactsQuerySchema.parse(req.query);
    const result = await bridgeRequest({
      method: "GET",
      path: "/contacts",
      query: {
        actorPublicId: actorPublicId(captainId),
        cursor: query.cursor,
        limit: String(query.limit),
      },
    }, contactGrantPageSchema);
    res.json(grantPage(result));
  });

  router.post("/contact-requests", validate(createRequestSchema), async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const result = await bridgeRequest({
      method: "POST",
      path: "/contact-requests",
      body: { actorPublicId: actorPublicId(captainId), targetPublicId: req.body.targetPublicId },
    }, contactMutationResponseSchema);
    res.json(mutation(result));
  });

  router.patch("/contact-requests/:requestId", validate(decideRequestSchema), async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const requestId = requestIdSchema.parse(req.params.requestId);
    const result = await bridgeRequest({
      method: "PATCH",
      path: `/contact-requests/${encodeURIComponent(requestId)}`,
      body: { actorPublicId: actorPublicId(captainId), decision: req.body.decision },
    }, contactMutationResponseSchema);
    res.json(mutation(result));
  });

  router.delete("/contact-requests/:requestId", validate(emptyBodySchema), async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const requestId = requestIdSchema.parse(req.params.requestId);
    const result = await bridgeRequest({
      method: "DELETE",
      path: `/contact-requests/${encodeURIComponent(requestId)}`,
      query: { actorPublicId: actorPublicId(captainId) },
    }, contactMutationResponseSchema);
    res.json(mutation(result));
  });

  router.delete("/contacts/:publicId", validate(emptyBodySchema), async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const targetPublicId = publicIdSchema.parse(req.params.publicId);
    const query = contactActionQuerySchema.parse(req.query);
    const result = await bridgeRequest({
      method: "DELETE",
      path: `/contacts/${encodeURIComponent(targetPublicId)}`,
      query: { actorPublicId: actorPublicId(captainId), action: query.action },
    }, contactMutationResponseSchema);
    res.json(mutation(result));
  });

  router.post("/contacts/:publicId/unblock", validate(emptyBodySchema), async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const targetPublicId = publicIdSchema.parse(req.params.publicId);
    const result = await bridgeRequest({
      method: "POST",
      path: `/contacts/${encodeURIComponent(targetPublicId)}/unblock`,
      body: { actorPublicId: actorPublicId(captainId) },
    }, contactMutationResponseSchema);
    res.json(mutation(result));
  });

  return router;
}
