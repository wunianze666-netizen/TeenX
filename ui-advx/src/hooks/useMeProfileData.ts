import { useEffect, useRef, useState } from "react";
import { api, arenaApi, type ArenaRunStatus, type ForumOverview } from "../api";
import { parsePublicArenaScore } from "../arena-score-contract";

export type MeArenaRecord = {
  readonly challengeVersionId: string;
  readonly challengeTitle: string;
  readonly runId: string;
  readonly status: ArenaRunStatus;
  readonly finishedAt: string | null;
  readonly official: boolean | null;
  readonly totalScore: number | null;
  readonly totalMaxScore: number | null;
  readonly partial: boolean;
};

type MeArenaLoad = { readonly records: readonly MeArenaRecord[]; readonly partial: boolean };

async function loadArenaRecords(signal: AbortSignal): Promise<MeArenaLoad> {
  const challenges = await arenaApi.listChallenges();
  const pages = await Promise.allSettled(challenges.map(async (challenge): Promise<readonly MeArenaRecord[]> => {
    const detail = await arenaApi.getChallenge(challenge.challengeVersionId);
    const run = (detail.activeSubmission ?? detail.latestSubmission)?.run;
    if (!run) return [];
    if (run.status !== "completed" || !run.scoreWorkProductId) {
      return [{
        challengeVersionId: detail.challengeVersionId,
        challengeTitle: detail.title,
        runId: run.runId,
        status: run.status,
        finishedAt: run.finishedAt,
        official: null,
        totalScore: null,
        totalMaxScore: null,
        partial: false,
      }];
    }
    try {
      const parsed = parsePublicArenaScore(await arenaApi.getResult(run.runId, signal));
      if (!parsed.ok) throw new TypeError(parsed.issue);
      const score = parsed.score;
      return [{
        challengeVersionId: detail.challengeVersionId,
        challengeTitle: detail.title,
        runId: run.runId,
        status: run.status,
        finishedAt: run.finishedAt,
        official: score.official,
        totalScore: score.totalScore,
        totalMaxScore: score.totalMaxScore,
        partial: false,
      }];
    } catch {
      return [{
        challengeVersionId: detail.challengeVersionId,
        challengeTitle: detail.title,
        runId: run.runId,
        status: run.status,
        finishedAt: run.finishedAt,
        official: null,
        totalScore: null,
        totalMaxScore: null,
        partial: true,
      }];
    }
  }));
  return {
    records: pages.flatMap((page) => page.status === "fulfilled" ? page.value : []),
    partial: pages.some((page) => page.status === "rejected")
      || pages.some((page) => page.status === "fulfilled" && page.value.some((record) => record.partial)),
  };
}

export function useMeProfileData() {
  const [forum, setForum] = useState<ForumOverview | null>(null);
  const [forumLoading, setForumLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [pendingHasMore, setPendingHasMore] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [arenaRecords, setArenaRecords] = useState<readonly MeArenaRecord[]>([]);
  const [arenaLoading, setArenaLoading] = useState(true);
  const [arenaError, setArenaError] = useState<string | null>(null);
  const [arenaPartial, setArenaPartial] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestGeneration = generation.current + 1;
    generation.current = requestGeneration;
    const isCurrent = () => generation.current === requestGeneration && !controller.signal.aborted;
    void api.forumOverview().then((next) => {
      if (isCurrent()) setForum(next);
    }).finally(() => {
      if (isCurrent()) setForumLoading(false);
    });
    void api.listContactRequests("inbox", undefined, controller.signal).then((page) => {
      if (isCurrent()) {
        setPendingCount(page.items.filter((item) => item.state === "pending").length);
        setPendingHasMore(page.nextCursor !== null);
      }
    }).catch((cause: unknown) => {
      if (isCurrent()) setContactsError(cause instanceof Error ? cause.message : "联络状态暂时无法读取");
    });
    void loadArenaRecords(controller.signal).then((result) => {
      if (isCurrent()) {
        setArenaRecords(result.records);
        setArenaPartial(result.partial);
      }
    }).catch((cause: unknown) => {
      if (isCurrent()) setArenaError(cause instanceof Error ? cause.message : "赛题记录暂时无法读取");
    }).finally(() => {
      if (isCurrent()) setArenaLoading(false);
    });
    return () => {
      controller.abort();
    };
  }, []);

  return { forum, forumLoading, pendingCount, pendingHasMore, contactsError, arenaRecords, arenaLoading, arenaError, arenaPartial } as const;
}
