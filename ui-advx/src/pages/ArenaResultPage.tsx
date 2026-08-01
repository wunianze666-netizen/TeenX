import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { arenaApi, ArenaApiError, type PublicArenaRunDetail, type PublicArenaScore } from "../api";
import { formatBoundTeamVersion } from "../arena-format";
import { parsePublicArenaScore } from "../arena-score-contract";
import { ArenaScorecard } from "../components/ArenaScorecard";
import { PageFoot } from "../components/PageFoot";
import { TopNav } from "../components/TopNav";

function resultErrorMessage(cause: unknown) {
  if (cause instanceof ArenaApiError) {
    switch (cause.code) {
      case "ARENA_RESULT_NOT_READY": return "评审尚未完成，暂时还没有成绩。";
      case "ARENA_SCORE_MISSING": return "评分结果尚未生成。";
      case "ARENA_RESULT_INVALID": return "成绩卡没有通过公开契约校验，页面已停止展示。";
      case "ARENA_RUN_NOT_FOUND": return "没有找到这次评审。";
      default: return cause.message;
    }
  }
  return cause instanceof Error ? cause.message : "成绩加载失败";
}

export function ArenaResultPage() {
  const { runId } = useParams();
  const [score, setScore] = useState<PublicArenaScore | null>(null);
  const [run, setRun] = useState<PublicArenaRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    setScore(null);
    setRun(null);
    setLoading(true);
    setError(null);
    Promise.all([
      arenaApi.getResult(runId, controller.signal),
      arenaApi.getRun(runId, controller.signal),
    ])
      .then(([nextScore, nextRun]) => {
        const parsed = parsePublicArenaScore(nextScore);
        if (!parsed.ok) {
          setError(`${parsed.issue} 页面已停止展示这份异常成绩。`);
          return;
        }
        setScore(parsed.score);
        setRun(nextRun);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(resultErrorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [runId, reloadKey]);

  const resultMatchesRoute = run?.runId === runId;

  if ((loading && !score) || (!resultMatchesRoute && !error)) {
    return (
      <>
        <TopNav active="contest" />
        <main className="container arena-page"><div className="empty">正在读取 Arena 成绩卡…</div></main>
        <PageFoot />
      </>
    );
  }

  if (!score || !run || !resultMatchesRoute || error) {
    return (
      <>
        <TopNav active="contest" />
        <main className="container arena-page">
          <Link className="btn btn-ghost btn-sm" to={runId ? `/arena/runs/${encodeURIComponent(runId)}` : "/arena"}>← 返回评审</Link>
          <div className="notice arena-error-notice">
            <b>{error ?? "找不到这份成绩"}</b>
            <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((value) => value + 1)}>重试</button>
          </div>
        </main>
        <PageFoot />
      </>
    );
  }

  return (
    <>
      <TopNav active="contest" />
      <main className="container arena-page arena-result-page">
        <div className="row-between arena-back-row">
          <Link className="btn btn-ghost btn-sm" to={`/arena/challenges/${encodeURIComponent(run.challengeVersionId)}`}>← 返回赛题</Link>
          <span className="meta">成绩编号 {score.id.slice(0, 12)}</span>
        </div>

        <ArenaScorecard score={score} challengeTitle={run.challengeTitle} />

        <section className="card arena-result-record">
          <div>
            <p className="meta mb-0">只读记录</p>
            <p className="small mb-0">队伍版本 {formatBoundTeamVersion(run.boundTeamVersion)} · 提交校验 {score.submissionSha256.slice(0, 16)}… · {score.rubricVersion}</p>
          </div>
          <div className="row arena-result-actions">
            <Link className="btn btn-primary" to="/studio">回到 Studio 继续改</Link>
            <Link className="btn btn-secondary" to="/arena">回到赛题列表</Link>
          </div>
        </section>
      </main>
      <PageFoot />
    </>
  );
}
