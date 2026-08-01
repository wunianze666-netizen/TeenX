import { z } from "zod";

export const publicIdSchema = z.string().regex(/^captain_v1_[A-Za-z0-9_-]{43}$/);
export const forumUsernameSchema = z.string().regex(/^tx_[A-Za-z0-9_-]{16}$/);
export const avatarPathSchema = z.string().nullable();
export const contactCursorSchema = z.string().min(1).max(500);

export const privacySchema = z.object({
  showTeam: z.boolean(),
  showForumActivity: z.boolean(),
  acceptDmRequests: z.boolean(),
}).strict();

const wirePrivacySchema = z.object({
  show_team: z.boolean(),
  show_forum_activity: z.boolean(),
  accept_dm_requests: z.boolean(),
}).strict().transform((input) => ({
  showTeam: input.show_team,
  showForumActivity: input.show_forum_activity,
  acceptDmRequests: input.accept_dm_requests,
}));

export const bridgePrivacyReadSchema = z.object({ privacy: wirePrivacySchema }).strict()
  .transform((input) => input.privacy);

export const bridgePrivacyWriteSchema = z.object({
  ok: z.literal(true),
  privacy: wirePrivacySchema,
}).strict().transform((input) => input.privacy);

export const viewerActionsSchema = z.object({
  isSelf: z.boolean(),
  contactState: z.enum([
    "self",
    "unavailable",
    "closed",
    "available",
    "outgoing_pending",
    "incoming_pending",
    "approved",
    "blocked",
  ]),
  canRequestDm: z.boolean(),
  canRespond: z.boolean(),
  canMessage: z.boolean(),
  canBlock: z.boolean(),
  canUnblock: z.boolean(),
  requestId: z.string().uuid().nullable(),
  forumMessagePath: z.string().nullable(),
}).strict();

const wireViewerActionsSchema = z.object({
  is_self: z.boolean(),
  contact_state: viewerActionsSchema.shape.contactState,
  can_request_dm: z.boolean(),
  can_respond: z.boolean(),
  can_message: z.boolean(),
  can_block: z.boolean(),
  can_unblock: z.boolean(),
  request_id: z.string().uuid().nullable(),
  forum_message_path: z.string().nullable(),
}).strict().transform((input) => ({
  isSelf: input.is_self,
  contactState: input.contact_state,
  canRequestDm: input.can_request_dm,
  canRespond: input.can_respond,
  canMessage: input.can_message,
  canBlock: input.can_block,
  canUnblock: input.can_unblock,
  requestId: input.request_id,
  forumMessagePath: input.forum_message_path,
}));

const wireForumSchema = z.object({
  username: forumUsernameSchema,
  topic_count: z.number().int().nonnegative(),
  recent_topics: z.array(z.object({
    id: z.string(),
    title: z.string().min(1).max(200),
    created_at: z.string().datetime(),
    path: z.string(),
  }).strict()).max(20),
}).strict().transform((input) => ({
  username: input.username,
  topicCount: input.topic_count,
  recentTopics: input.recent_topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    createdAt: topic.created_at,
    path: topic.path,
  })),
}));

export const bridgeProfileSchema = z.object({
  profile: z.object({
    public_id: publicIdSchema,
    username: forumUsernameSchema,
    avatar_path: avatarPathSchema,
  }).strict(),
  privacy: wirePrivacySchema,
  viewer_actions: wireViewerActionsSchema,
  forum: wireForumSchema.optional(),
}).strict().transform((input) => ({
  publicId: input.profile.public_id,
  username: input.profile.username,
  avatarPath: input.profile.avatar_path,
  privacy: input.privacy,
  viewerActions: input.viewer_actions,
  forum: input.forum ?? null,
}));

export const contactCounterpartSchema = z.object({
  publicId: publicIdSchema,
  nickname: z.string().min(1).max(80),
  avatarPath: avatarPathSchema,
}).strict();

const wireCounterpartSchema = z.object({
  public_id: publicIdSchema,
  nickname: z.string().min(1).max(80),
  avatar_path: avatarPathSchema,
}).strict().transform((input) => ({
  publicId: input.public_id,
  nickname: input.nickname,
  avatarPath: input.avatar_path,
}));

export const contactRequestSummarySchema = z.object({
  requestId: z.string().uuid(),
  direction: z.enum(["incoming", "outgoing"]),
  state: z.enum(["pending", "accepted", "declined", "revoked", "expired"]),
  counterpart: contactCounterpartSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict();

const wireContactRequestSchema = z.object({
  request_id: z.string().uuid(),
  direction: contactRequestSummarySchema.shape.direction,
  state: contactRequestSummarySchema.shape.state,
  counterpart: wireCounterpartSchema,
  created_at: z.string().datetime(),
  expires_at: z.string().datetime(),
}).strict().transform((input) => ({
  requestId: input.request_id,
  direction: input.direction,
  state: input.state,
  counterpart: input.counterpart,
  createdAt: input.created_at,
  expiresAt: input.expires_at,
}));

export const contactGrantSummarySchema = z.object({
  counterpart: contactCounterpartSchema,
  state: z.enum(["approved", "blocked", "unavailable"]),
  establishedAt: z.string().datetime().nullable(),
  canMessage: z.boolean(),
  canSever: z.boolean(),
  canBlock: z.boolean(),
  canUnblock: z.boolean(),
}).strict();

const wireContactGrantSchema = z.object({
  counterpart: wireCounterpartSchema,
  state: contactGrantSummarySchema.shape.state,
  established_at: z.string().datetime().nullable(),
  can_message: z.boolean(),
  can_sever: z.boolean(),
  can_block: z.boolean(),
  can_unblock: z.boolean(),
}).strict().transform((input) => ({
  counterpart: input.counterpart,
  state: input.state,
  establishedAt: input.established_at,
  canMessage: input.can_message,
  canSever: input.can_sever,
  canBlock: input.can_block,
  canUnblock: input.can_unblock,
}));

export const contactRequestPageSchema = z.object({
  items: z.array(wireContactRequestSchema).max(50),
  next_cursor: contactCursorSchema.nullable(),
}).strict().transform((input) => ({ items: input.items, nextCursor: input.next_cursor }));

export const contactGrantPageSchema = z.object({
  items: z.array(wireContactGrantSchema).max(50),
  next_cursor: contactCursorSchema.nullable(),
}).strict().transform((input) => ({ items: input.items, nextCursor: input.next_cursor }));

export const contactMutationResponseSchema = z.object({
  ok: z.literal(true),
  viewer_actions: wireViewerActionsSchema.optional(),
  request: wireContactRequestSchema.optional(),
  grant: wireContactGrantSchema.optional(),
}).strict().transform((input) => ({
  ok: true as const,
  viewerActions: input.viewer_actions,
  request: input.request,
  grant: input.grant,
}));

export type TeenxPrivacy = z.infer<typeof privacySchema>;
export type BridgeProfile = z.infer<typeof bridgeProfileSchema>;
