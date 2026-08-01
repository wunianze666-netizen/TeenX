export type PublicTextResult =
  | { readonly safe: true; readonly value: string }
  | { readonly safe: false };

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u;
const EMAIL_ADDRESS = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/iu;
const URL_OR_DOMAIN = /(?:\b(?:https?|ftp|www)\b\s*[:.]|(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?[.。])+(?:[\p{L}]{2,63}|xn--[\p{L}\p{N}-]{2,59}))/iu;
const SOCIAL_HANDLE = /@[a-zA-Z0-9_]{2,}/u;
const SOCIAL_CHANNEL = /(?:\b(?:wechat|weixin|qq|wx)\b|微信|加微|扣扣)/iu;
const IP_LITERAL = /\[[0-9a-f:]+\]/iu;
const AVATAR_PATH = /^\/(?:user_avatar|letter_avatar|letter_avatar_proxy)\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+$/u;
const TOPIC_PATH = /^\/t\/(?:[a-zA-Z0-9_-]+\/)?[1-9]\d*(?:\/[1-9]\d*)?$/u;
const FORUM_USERNAME = /^tx_[a-zA-Z0-9_-]{16}$/u;

export function parsePublicText(input: string, maxCharacters: number): PublicTextResult {
  if (CONTROL_CHARACTERS.test(input)) return { safe: false };
  const value = input.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (value.length === 0 || Array.from(value).length > maxCharacters) return { safe: false };
  if (EMAIL_ADDRESS.test(value) || URL_OR_DOMAIN.test(value) || IP_LITERAL.test(value)) return { safe: false };
  if (SOCIAL_HANDLE.test(value) || SOCIAL_CHANNEL.test(value)) return { safe: false };
  if ((value.match(/\p{N}/gu)?.length ?? 0) >= 7) return { safe: false };
  return { safe: true, value };
}

export function safePublicNickname(input: string, publicId: string): string {
  const parsed = parsePublicText(input, 24);
  return parsed.safe ? parsed.value : `小队长-${publicId.slice(-4)}`;
}

export function safePublicTeamName(input: string): string | null {
  const parsed = parsePublicText(input, 80);
  return parsed.safe ? parsed.value : null;
}

export function safeAvatarPath(input: string | null): string | null {
  if (input === null || input.includes("..") || input.includes("\\") || input.includes("%")) return null;
  if (input.includes("?") || input.includes("#") || input.startsWith("//")) return null;
  if (input.includes("://")) return null;
  return AVATAR_PATH.test(input) ? input : null;
}

export function safeTopicPath(input: string): string | null {
  if (input.includes("..") || input.includes("\\") || input.includes("?") || input.includes("#")) return null;
  return TOPIC_PATH.test(input) ? input : null;
}

export function forumMessagePath(username: string): string {
  if (!FORUM_USERNAME.test(username)) throw new RangeError("Invalid TeenX forum username");
  return `/new-message?username=${encodeURIComponent(username)}`;
}
