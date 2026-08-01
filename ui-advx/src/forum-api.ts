export interface ForumActivity {
  readonly id: string;
  readonly kind: "topic" | "reply";
  readonly title: string;
  readonly excerpt: string | null;
  readonly createdAt: string;
  readonly path: string;
}

export interface ForumBookmark {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly createdAt: string;
  readonly path: string;
}

export interface ForumOverview {
  readonly status: "connected" | "signed_out" | "unavailable";
  readonly username: string | null;
  readonly unreadMessages: number;
  readonly latestMessageAt: string | null;
  readonly topicCount: number;
  readonly postCount: number;
  readonly bookmarkCount: number;
  readonly activities: readonly ForumActivity[];
  readonly bookmarks: readonly ForumBookmark[];
}

export interface DemoCommunityCategory {
  readonly id: string;
  readonly name: string;
  readonly topicCount: number;
}

export interface DemoCommunityTopic {
  readonly id: string;
  readonly categoryId: string;
  readonly title: string;
  readonly excerpt: string;
  readonly author: string;
  readonly replyCount: number;
  readonly viewCount: number;
  readonly createdAt: string;
  readonly tags: readonly string[];
  readonly featured: boolean;
}

export interface DemoCommunity {
  readonly profile: "prepared_demo" | "prepared_replay";
  readonly mode: "local_demo";
  readonly currentUser: { readonly username: string; readonly displayName: string };
  readonly stats: {
    readonly topicCount: number;
    readonly postCount: number;
    readonly bookmarkCount: number;
    readonly unreadMessages: number;
  };
  readonly categories: readonly DemoCommunityCategory[];
  readonly topics: readonly DemoCommunityTopic[];
  readonly bookmarks: readonly string[];
}

interface DiscourseCurrentUser {
  readonly username: string;
  readonly new_personal_messages_notifications_count?: number;
}

interface DiscourseUserAction {
  readonly action_type: number;
  readonly created_at: string;
  readonly excerpt?: string | null;
  readonly slug?: string;
  readonly topic_id?: number;
  readonly post_number?: number;
  readonly post_id?: number;
  readonly title?: string;
}

interface DiscourseBookmark {
  readonly id: number;
  readonly created_at: string;
  readonly excerpt?: string | null;
  readonly slug?: string;
  readonly topic_id?: number;
  readonly linked_post_number?: number;
  readonly title?: string;
}

interface DiscourseUserSummary {
  readonly topic_count?: number;
  readonly post_count?: number;
  readonly bookmark_count?: number;
}

class DiscourseApiError extends Error {
  readonly name = "DiscourseApiError";

  constructor(readonly status: number) {
    super("论坛请求失败");
  }
}

async function discourseJson<T>(path: string): Promise<T> {
  const response = await fetch(`/discourse${path}`, { credentials: "same-origin", signal: AbortSignal.timeout(6_000) });
  if (!response.ok) throw new DiscourseApiError(response.status);
  return response.json() as Promise<T>;
}

export async function getDemoCommunity(): Promise<DemoCommunity | null> {
  const response = await fetch("/api/advx/demo/community", {
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(6_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("演示社区暂时无法读取");
  return response.json() as Promise<DemoCommunity>;
}

export async function getForumOverview(): Promise<ForumOverview> {
  const empty = {
    username: null,
    unreadMessages: 0,
    latestMessageAt: null,
    topicCount: 0,
    postCount: 0,
    bookmarkCount: 0,
    activities: [],
    bookmarks: [],
  } satisfies Omit<ForumOverview, "status">;
  const demo = await getDemoCommunity();
  if (demo) {
    const topicsById = new Map(demo.topics.map((topic) => [topic.id, topic]));
    return {
      status: "connected",
      username: demo.currentUser.username,
      unreadMessages: demo.stats.unreadMessages,
      latestMessageAt: demo.topics[0]?.createdAt ?? null,
      topicCount: demo.stats.topicCount,
      postCount: demo.stats.postCount,
      bookmarkCount: demo.stats.bookmarkCount,
      activities: demo.topics.map((topic) => ({
        id: topic.id,
        kind: "topic" as const,
        title: topic.title,
        excerpt: topic.excerpt,
        createdAt: topic.createdAt,
        path: `/?topic=${encodeURIComponent(topic.id)}`,
      })),
      bookmarks: demo.bookmarks.flatMap((id) => {
        const topic = topicsById.get(id);
        return topic ? [{
          id: topic.id,
          title: topic.title,
          excerpt: topic.excerpt,
          createdAt: topic.createdAt,
          path: `/?topic=${encodeURIComponent(topic.id)}`,
        }] : [];
      }),
    };
  }
  let currentUser: DiscourseCurrentUser | null = null;
  try {
    const session = await discourseJson<{ readonly current_user?: DiscourseCurrentUser | null }>("/session/current.json");
    currentUser = session.current_user ?? null;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    const status = cause instanceof DiscourseApiError ? cause.status : null;
    return { status: status === 401 || status === 403 || status === 404 ? "signed_out" : "unavailable", ...empty };
  }
  if (!currentUser) return { status: "signed_out", ...empty };
  const username = currentUser.username;
  const [activityResponse, bookmarkResponse, summaryResponse, messagesResponse] = await Promise.all([
    discourseJson<{ readonly user_actions?: readonly DiscourseUserAction[] }>(`/user_actions.json?offset=0&limit=6&username=${encodeURIComponent(username)}&filter=4,5`).catch(() => ({ user_actions: [] })),
    discourseJson<{ readonly bookmarks?: readonly DiscourseBookmark[] }>(`/u/${encodeURIComponent(username)}/bookmarks.json?limit=4`).catch(() => ({ bookmarks: [] })),
    discourseJson<{ readonly user_summary?: DiscourseUserSummary }>(`/u/${encodeURIComponent(username)}/summary.json`).catch(() => ({ user_summary: {} })),
    discourseJson<{ readonly topic_list?: { readonly topics?: readonly { readonly last_posted_at?: string }[] } }>(`/topics/private-messages/${encodeURIComponent(username)}.json`).catch(() => ({ topic_list: { topics: [] } })),
  ]);
  const activities = (activityResponse.user_actions ?? []).filter((action) => action.topic_id && action.title).map((action): ForumActivity => ({
    id: `${action.action_type}:${action.post_id ?? action.topic_id}:${action.created_at}`,
    kind: action.action_type === 4 ? "topic" : "reply",
    title: action.title ?? "论坛动态",
    excerpt: action.excerpt ?? null,
    createdAt: action.created_at,
    path: `/t/${action.slug || "topic"}/${action.topic_id}/${action.post_number ?? 1}`,
  }));
  const bookmarks = (bookmarkResponse.bookmarks ?? []).filter((bookmark) => bookmark.topic_id && bookmark.title).map((bookmark): ForumBookmark => ({
    id: String(bookmark.id),
    title: bookmark.title ?? "已收藏的帖子",
    excerpt: bookmark.excerpt ?? null,
    createdAt: bookmark.created_at,
    path: `/t/${bookmark.slug || "topic"}/${bookmark.topic_id}/${bookmark.linked_post_number ?? 1}`,
  }));
  const summary: DiscourseUserSummary = summaryResponse.user_summary ?? {};
  return {
    status: "connected",
    username,
    unreadMessages: currentUser.new_personal_messages_notifications_count ?? 0,
    latestMessageAt: messagesResponse.topic_list?.topics?.[0]?.last_posted_at ?? null,
    topicCount: summary.topic_count ?? 0,
    postCount: summary.post_count ?? 0,
    bookmarkCount: summary.bookmark_count ?? bookmarks.length,
    activities,
    bookmarks,
  };
}
