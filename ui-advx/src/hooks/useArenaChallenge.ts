import { useEffect, useState } from "react";
import { api, arenaApi, type ArenaChallengeDetail, type Team, type VersionSnapshot } from "../api";

function newestVersions(snapshots: readonly VersionSnapshot[]): VersionSnapshot[] {
  return [...snapshots].sort((left, right) => (
    right.versionNumber - left.versionNumber || Date.parse(right.createdAt) - Date.parse(left.createdAt)
  ));
}

export function useArenaChallenge(challengeVersionId: string | undefined) {
  const [challenge, setChallenge] = useState<ArenaChallengeDetail | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [versions, setVersions] = useState<readonly VersionSnapshot[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!challengeVersionId) return;
    let active = true;
    setChallenge(null);
    setLoading(true);
    setError(null);
    void Promise.all([arenaApi.getChallenge(challengeVersionId), api.listTeams()]).then(async ([detail, teams]) => {
      const currentTeam = teams[0] ?? null;
      const snapshots = currentTeam ? newestVersions(await api.listVersions(currentTeam.id)) : [];
      if (!active) return;
      setChallenge(detail);
      setTeam(currentTeam);
      setVersions(snapshots);
      setSelectedVersionId(snapshots[0]?.id ?? "");
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "赛题详情加载失败");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [challengeVersionId]);

  return {
    challenge,
    team,
    versions,
    selectedVersionId,
    setSelectedVersionId,
    loading,
    error,
  };
}
