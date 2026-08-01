import { Router } from "express";
import { z } from "zod";
import { HttpError, notFound, unprocessable } from "../errors.js";
import { validate } from "../middleware/validate.js";
import {
  TeenxBridgeHttpError,
  TeenxBridgeProtocolError,
  type TeenxBridgeClient,
} from "../services/teenx-profile-bridge-client.js";
import type { TeenxProfileConfig } from "../services/teenx-profile-config.js";
import {
  TeenxPublicDirectoryCapacityError,
  type EligibleCaptain,
  type TeenxPublicDirectory,
} from "../services/teenx-public-directory.js";
import {
  bridgePrivacyReadSchema,
  bridgePrivacyWriteSchema,
  bridgeProfileSchema,
  privacySchema,
  publicIdSchema,
} from "../services/teenx-profile-contract.js";
import { createTeenxPublicIdentity } from "../services/teenx-public-identity.js";
import type { TeenxProfileRateLimiter } from "../services/teenx-profile-rate-limit.js";
import { createTeenxProfileRateLimiter } from "../services/teenx-profile-rate-limit.js";
import {
  forumMessagePath,
  parsePublicText,
  safeAvatarPath,
  safePublicNickname,
  safePublicTeamName,
  safeTopicPath,
} from "../services/teenx-public-text.js";
import { assertInteractiveCaptain } from "./advx-auth.js";
import { advxProfileContactRoutes } from "./advx-profile-contacts.js";
import { advxProfileForumRoutes } from "./advx-profile-forum.js";

export type TeenxCaptainRecord = {
  readonly captainId: string;
  readonly nickname: string;
  readonly joinedAt: Date | null;
};

export type TeenxTeamSummary = {
  readonly teamId: string;
  readonly name: string;
  readonly memberCount: number;
  readonly versionCount: number;
};

export type TeenxProfileStore = {
  getCaptain(captainId: string): Promise<TeenxCaptainRecord | null>;
  updateNickname(captainId: string, nickname: string): Promise<TeenxCaptainRecord | null>;
  getTeamSummary(captainId: string): Promise<TeenxTeamSummary | null>;
  auditIdentityChange(teamId: string, captainId: string): Promise<void>;
  loadEligibleCaptains(limit: number): Promise<readonly EligibleCaptain[]>;
  getTestRunCount(teamId: string): Promise<number>;
};

export type TeenxProfileRouteDependencies = {
  readonly config: TeenxProfileConfig;
  readonly bridge: TeenxBridgeClient;
  readonly directory: TeenxPublicDirectory;
  readonly store: TeenxProfileStore;
  readonly identityRateLimiter?: TeenxProfileRateLimiter;
  readonly forumFetch?: typeof fetch;
};

const identitySchema = z.object({ nickname: z.string() }).strict();
function isBridgeUnavailable(error: unknown): boolean {
  return (error instanceof TeenxBridgeHttpError && error.status !== 404)
    || error instanceof TeenxBridgeProtocolError
    || error instanceof TypeError
    || error instanceof DOMException
    || error instanceof z.ZodError;
}

export function advxProfileRoutes(dependencies: TeenxProfileRouteDependencies) {
  const router = Router();
  const identityRateLimiter = dependencies.identityRateLimiter ?? createTeenxProfileRateLimiter();

  router.get("/me", async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const [captain, team] = await Promise.all([
      dependencies.store.getCaptain(captainId),
      dependencies.store.getTeamSummary(captainId),
    ]);
    if (!captain) throw notFound("Captain not found");
    const identity = createTeenxPublicIdentity(captainId, dependencies.config.publicIdSecret);
    const testRunCount = team ? await dependencies.store.getTestRunCount(team.teamId) : 0;
    res.json({
      profile: {
        publicId: identity.publicId,
        nickname: safePublicNickname(captain.nickname, identity.publicId),
        joinedAt: captain.joinedAt?.toISOString() ?? null,
        authMode: req.actor.source === "session" ? "signed_in" : "local_fixture",
      },
      team: team ? { name: team.name, memberCount: team.memberCount, versionCount: team.versionCount } : null,
      stats: { testRunCount },
    });
  });

  router.patch("/me/identity", validate(identitySchema), async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const rateLimit = identityRateLimiter.consume(captainId);
    if (!rateLimit.allowed) {
      throw new HttpError(429, "昵称修改过于频繁", { retryAfterSeconds: rateLimit.retryAfterSeconds });
    }
    const publicText = parsePublicText(req.body.nickname, 24);
    if (!publicText.safe) throw unprocessable("昵称不符合公开文本安全规则");
    const captain = await dependencies.store.updateNickname(captainId, publicText.value);
    if (!captain) throw notFound("Captain not found");
    const team = await dependencies.store.getTeamSummary(captainId);
    if (team) await dependencies.store.auditIdentityChange(team.teamId, captainId);
    const publicId = createTeenxPublicIdentity(captainId, dependencies.config.publicIdSecret).publicId;
    res.json({ profile: { publicId, nickname: captain.nickname, joinedAt: captain.joinedAt?.toISOString() ?? null } });
  });

  router.get("/me/privacy", async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const publicId = createTeenxPublicIdentity(captainId, dependencies.config.publicIdSecret).publicId;
    const privacy = await dependencies.bridge.request({
      method: "GET",
      path: "/privacy",
      query: { actorPublicId: publicId },
    }, bridgePrivacyReadSchema);
    res.json(privacy);
  });

  router.patch("/me/privacy", validate(privacySchema), async (req, res) => {
    const captainId = assertInteractiveCaptain(req, dependencies.config);
    const publicId = createTeenxPublicIdentity(captainId, dependencies.config.publicIdSecret).publicId;
    const privacy = await dependencies.bridge.request({
      method: "PATCH",
      path: "/privacy",
      body: { actorPublicId: publicId, privacy: req.body },
    }, bridgePrivacyWriteSchema);
    res.json(privacy);
  });

  router.get("/captains/:publicId/profile", async (req, res) => {
    const viewerCaptainId = assertInteractiveCaptain(req, dependencies.config);
    const targetPublicId = publicIdSchema.parse(req.params.publicId);
    let target: EligibleCaptain | null;
    try {
      target = await dependencies.directory.resolve(targetPublicId);
    } catch (error) {
      if (error instanceof TeenxPublicDirectoryCapacityError) {
        throw new HttpError(503, "Profile directory unavailable");
      }
      throw error;
    }
    if (!target) throw notFound("Captain not found");
    const [captain, team] = await Promise.all([
      dependencies.store.getCaptain(target.captainId),
      dependencies.store.getTeamSummary(target.captainId),
    ]);
    if (!captain || !team) throw notFound("Captain not found");
    const viewerPublicId = createTeenxPublicIdentity(
      viewerCaptainId,
      dependencies.config.publicIdSecret,
    ).publicId;
    const targetIdentity = createTeenxPublicIdentity(target.captainId, dependencies.config.publicIdSecret);
    let bridgeProfile;
    try {
      bridgeProfile = await dependencies.bridge.request({
        method: "GET",
        path: "/profile",
        query: { viewerPublicId, targetPublicId },
      }, bridgeProfileSchema);
      if (
        bridgeProfile.publicId !== targetPublicId
        || bridgeProfile.username !== targetIdentity.forumUsername
      ) {
        throw new TeenxBridgeProtocolError("TeenX bridge identity mismatch");
      }
    } catch (error) {
      if (error instanceof TeenxBridgeHttpError && error.status === 404) {
        throw notFound("Captain not found");
      }
      if (!isBridgeUnavailable(error)) throw error;
      const isSelf = viewerPublicId === targetPublicId;
      res.json({
        profile: {
          publicId: targetPublicId,
          nickname: safePublicNickname(captain.nickname, targetPublicId),
          avatarPath: null,
          joinedAt: captain.joinedAt?.toISOString() ?? null,
        },
        viewerActions: {
          isSelf,
          contactState: "unavailable",
          canRequestDm: false,
          canRespond: false,
          canMessage: false,
          canBlock: false,
          canUnblock: false,
          requestId: null,
          forumMessagePath: null,
        },
      });
      return;
    }
    const isSelf = viewerPublicId === targetPublicId;
    const safeTeamName = safePublicTeamName(team.name);
    const recentTopics = (bridgeProfile.forum?.recentTopics ?? []).flatMap((topic) => {
      const path = safeTopicPath(topic.path);
      const title = parsePublicText(topic.title, 200);
      return path && title.safe ? [{ id: topic.id, title: title.value, createdAt: topic.createdAt, path }] : [];
    });
    const canMessage = !isSelf && bridgeProfile.viewerActions.canMessage;
    res.json({
      profile: {
        publicId: targetPublicId,
        nickname: safePublicNickname(captain.nickname, targetPublicId),
        avatarPath: safeAvatarPath(bridgeProfile.avatarPath),
        joinedAt: captain.joinedAt?.toISOString() ?? null,
      },
      ...((isSelf || bridgeProfile.privacy.showTeam) && safeTeamName
        ? { team: { name: safeTeamName, memberCount: team.memberCount, versionCount: team.versionCount } }
        : {}),
      ...((isSelf || bridgeProfile.privacy.showForumActivity) && bridgeProfile.forum
        ? { forum: { username: bridgeProfile.username, topicCount: bridgeProfile.forum.topicCount, recentTopics } }
        : {}),
      viewerActions: {
        ...bridgeProfile.viewerActions,
        isSelf,
        contactState: isSelf ? "self" : bridgeProfile.viewerActions.contactState,
        canMessage,
        forumMessagePath: canMessage ? forumMessagePath(bridgeProfile.username) : null,
      },
    });
  });

  router.use(advxProfileForumRoutes(dependencies));
  router.use(advxProfileContactRoutes(dependencies));
  return router;
}
