const AVATAR_PATH = /^\/(?:user_avatar|letter_avatar|letter_avatar_proxy)\/[a-zA-Z0-9._~!$&'()*+,;=:@/-]+$/u;
const TOPIC_PATH = /^\/t\/(?:[a-zA-Z0-9_-]+\/)?[1-9]\d*(?:\/[1-9]\d*)?$/u;
const MESSAGE_PATH = /^\/new-message\?username=tx_[a-zA-Z0-9_-]{16}$/u;

function hasUnsafePathPart(path: string): boolean {
  return path.includes("..")
    || path.includes("\\")
    || path.includes("://")
    || path.startsWith("//")
    || path.includes("#")
    || path.includes("%");
}

export function safeForumAvatarPath(path: string | null): string | null {
  return path !== null && !hasUnsafePathPart(path) && !path.includes("?") && AVATAR_PATH.test(path)
    ? path
    : null;
}

export function safeForumTopicPath(path: string): string | null {
  return !hasUnsafePathPart(path) && !path.includes("?") && TOPIC_PATH.test(path) ? path : null;
}

export function safeForumMessagePath(path: string | null): string | null {
  return path !== null && !hasUnsafePathPart(path) && MESSAGE_PATH.test(path) ? path : null;
}
