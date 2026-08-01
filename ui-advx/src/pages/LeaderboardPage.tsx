import { Medal, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DemoLeaderboard } from "../api";
import { PageFoot } from "../components/PageFoot";
import { TopNav } from "../components/TopNav";

function formatCompletedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function LeaderboardPage() {
  const [data, setData] = useState<DemoLeaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await api.demoLeaderboard());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "排行榜暂时无法读取");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const current = data?.entries.find((entry) => entry.isCurrent) ?? null;
  return (
    <>
      <TopNav active="board" />
      <main className="container leaderboard-page">
        <header className="leaderboard-head row-between">
          <div>
            <div className="row leaderboard-kicker"><p className="eyebrow mb-0">Arena Board</p><span className="pill pill-blue">演示数据</span></div>
            <h1 className="h2">排行榜</h1>
            <p className="lead">{data?.challenge.title ?? "Todo Web Challenge"}</p>
          </div>
          <Link className="btn btn-secondary" to="/arena">查看赛题</Link>
        </header>

        {error && (
          <div className="notice leaderboard-error" role="alert">
            <b>{error}</b><button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>重试</button>
          </div>
        )}

        {!data && !error ? <div className="empty">正在读取排行榜…</div> : data && (
          <>
            <section className="leaderboard-summary" aria-label="当前队伍成绩">
              <div><span className="meta">当前名次</span><strong>#{data.currentTeamRank ?? "-"}</strong></div>
              <div><span className="meta">{current?.teamName ?? "当前队伍"} 得分</span><strong>{current?.score ?? "-"}</strong><small>/ {data.challenge.totalMaxScore}</small></div>
              <div><span className="meta">参赛队伍</span><strong>{data.entries.length}</strong></div>
              <div><span className="meta">成绩类型</span><strong>非官方</strong></div>
            </section>

            <section className="card leaderboard-table-card">
              <div className="row-between leaderboard-table-head">
                <div><p className="eyebrow">Standings</p><h2 className="h3">队伍排名</h2></div>
                <span className="meta">Fixture score · {data.challenge.challengeVersionId}</span>
              </div>
              <div className="leaderboard-table-scroll">
                <table className="ds-table leaderboard-table">
                  <thead><tr><th>名次</th><th>队伍</th><th>完成时间</th><th className="num-col">得分</th></tr></thead>
                  <tbody>{data.entries.map((entry) => (
                    <tr key={entry.teamId} className={entry.isCurrent ? "is-current" : ""}>
                      <td><span className="leaderboard-rank">{entry.rank <= 3 ? <Medal size={17} aria-hidden="true" /> : <span />}{entry.rank}</span></td>
                      <td><span className="leaderboard-team"><strong>{entry.teamName}</strong>{entry.isCurrent && <span className="pill">我的队伍</span>}</span></td>
                      <td><time className="meta">{formatCompletedAt(entry.completedAt)}</time></td>
                      <td className="num-col"><strong>{entry.score}</strong></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="leaderboard-footnote"><Trophy size={16} aria-hidden="true" /><span>榜单由本地演示后端提供，部署真实赛事时不会沿用这些样例名次。</span></div>
            </section>
          </>
        )}
      </main>
      <PageFoot />
    </>
  );
}
