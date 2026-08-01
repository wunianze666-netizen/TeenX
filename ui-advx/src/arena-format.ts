import type { PublicArenaBoundTeamVersion } from "./api";

const CHINESE_DATE_TIME = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatArenaDate(value: string): string {
  return CHINESE_DATE_TIME.format(new Date(value));
}

export function formatBoundTeamVersion(version: PublicArenaBoundTeamVersion): string {
  const versionName = version.label ?? (version.versionNumber === null ? "已封存版本" : `v${version.versionNumber}`);
  return version.teamName ? `${version.teamName} · ${versionName}` : versionName;
}

export function formatBoundTeamVersionMeta(version: PublicArenaBoundTeamVersion): string | null {
  return version.createdAt ? `封存于 ${formatArenaDate(version.createdAt)}` : null;
}
