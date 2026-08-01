export function formatProfileDate(value: string | null, withTime = false): string {
  if (!value) return "时间待同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待同步";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function forumHref(path: string): string {
  return `/forum?path=${encodeURIComponent(path)}`;
}

export function plainProfileText(value: string | null): string | null {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}
