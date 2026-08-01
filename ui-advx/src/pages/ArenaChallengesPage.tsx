import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { arenaApi, type ArenaChallengeStatus, type ArenaChallengeSummary } from "../api";
import { formatArenaDate } from "../arena-format";
import { PageFoot } from "../components/PageFoot";
import { Seg } from "../components/Seg";
import { TopNav } from "../components/TopNav";

const FILTERS = [
  { value: "all", label: "全部" },
  { value: "open", label: "报名中" },
  { value: "upcoming", label: "即将开放" },
  { value: "closed", label: "已结束" },
];

const STATUS_LABEL: Record<ArenaChallengeStatus, string> = {
  upcoming: "即将开放",
  open: "报名中",
  closed: "已结束",
};

const STATUS_CLASS: Record<ArenaChallengeStatus, string> = {
  upcoming: "pill pill-blue",
  open: "pill",
  closed: "pill pill-dim",
};

export function ArenaChallengesPage() {
  const [challenges, setChallenges] = useState<ArenaChallengeSummary[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setChallenges(await arenaApi.listChallenges());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "赛题加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = challenges.filter((challenge) => filter === "all" || challenge.status === filter);
  const nextChallenge = [...challenges]
    .filter((challenge) => challenge.status === "upcoming")
    .sort((left, right) => Date.parse(left.opensAt) - Date.parse(right.opensAt))[0];

  return (
    <>
      <TopNav active="contest" />
      <main className="container arena-page">
        <section className="arena-page-head">
          <p className="eyebrow">Official Arena</p>
          <h1 className="h2">赛题</h1>
          <p className="lead">选择官方挑战，提交队伍作品 ZIP，并获得<span className="arena-keep-together">可追溯证据</span>的八维评审。</p>

          {nextChallenge && (
            <div className="notice arena-announcement">
              <span className="pill pill-blue">公告</span>
              <span>
                下一场「<b>{nextChallenge.title}</b>」将于 {formatArenaDate(nextChallenge.opensAt)} 开放。
              </span>
            </div>
          )}

          <div className="arena-filter-row">
            <Seg label="按赛题状态筛选" options={FILTERS} value={filter} onChange={setFilter} />
            <span className="meta" role="status" aria-live="polite" aria-atomic="true">
              {loading ? "正在读取赛题" : `筛选结果：${visible.length} 场`}
            </span>
          </div>
        </section>

        {error && (
          <div className="notice arena-error-notice">
            <b>{error}</b>
            <button className="btn btn-ghost btn-sm" onClick={() => void load()}>重试</button>
          </div>
        )}

        <section className="arena-challenge-list">
          {loading ? (
            <div className="empty">正在读取官方赛题…</div>
          ) : visible.length === 0 ? (
            <div className="empty">当前没有该状态的赛题。</div>
          ) : (
            visible.map((challenge) => (
              <article key={challenge.challengeVersionId} className="card card-hover arena-challenge-row">
                <div className="arena-challenge-copy">
                  <div className="row arena-challenge-title-row">
                    <h2 className="h3">{challenge.title}</h2>
                    <span className={STATUS_CLASS[challenge.status]}>{STATUS_LABEL[challenge.status]}</span>
                  </div>
                  <p className="muted arena-challenge-description">{challenge.description}</p>
                  <p className="meta mb-0">
                    版本 v{challenge.version} · 开放 {formatArenaDate(challenge.opensAt)} · 截止 {formatArenaDate(challenge.closesAt)}
                  </p>
                </div>
                <Link className="btn btn-secondary" to={`/arena/challenges/${encodeURIComponent(challenge.challengeVersionId)}`}>
                  查看详情
                </Link>
              </article>
            ))
          )}
        </section>
      </main>
      <PageFoot />
    </>
  );
}
