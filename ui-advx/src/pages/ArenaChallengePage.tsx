import { Link, useParams } from "react-router-dom";
import { type ArenaChallengeStatus } from "../api";
import { formatArenaDate } from "../arena-format";
import { ArenaSubmissionPanel } from "../components/ArenaSubmissionPanel";
import { PageFoot } from "../components/PageFoot";
import { TopNav } from "../components/TopNav";
import { useArenaChallenge } from "../hooks/useArenaChallenge";

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

export function ArenaChallengePage() {
  const { challengeVersionId } = useParams();
  const state = useArenaChallenge(challengeVersionId);
  const challengeMatchesRoute = state.challenge?.challengeVersionId === challengeVersionId;

  if (state.loading || (!challengeMatchesRoute && !state.error)) {
    return <><TopNav active="contest" /><main className="container arena-page"><div className="empty">正在读取赛题详情…</div></main><PageFoot /></>;
  }

  if (!state.challenge || !challengeMatchesRoute || state.error) {
    return (
      <><TopNav active="contest" /><main className="container arena-page">
        <Link className="btn btn-ghost btn-sm" to="/arena">← 赛题列表</Link>
        <div className="notice arena-error-notice"><b>{state.error ?? "找不到这场赛题"}</b></div>
      </main><PageFoot /></>
    );
  }

  const challenge = state.challenge;
  return (
    <><TopNav active="contest" /><main className="container arena-page">
      <div className="row-between arena-back-row">
        <Link className="btn btn-ghost btn-sm" to="/arena">← 赛题列表</Link>
        <span className={STATUS_CLASS[challenge.status]}>{STATUS_LABEL[challenge.status]}</span>
      </div>
      <section className="arena-detail-title">
        <p className="eyebrow">Challenge v{challenge.version}</p>
        <h1 className="h2">{challenge.title}</h1>
        <p className="lead">{challenge.description}</p>
        <p className="meta">开放 {formatArenaDate(challenge.opensAt)} · 截止 {formatArenaDate(challenge.closesAt)}</p>
      </section>
      <div className="grid-2-1 arena-detail-grid">
        <div className="stack arena-detail-main">
          <section className="card arena-brief-card">
            <div><p className="eyebrow">Goal</p><h2 className="h3">挑战目标</h2><p className="arena-preserve-copy">{challenge.goal}</p></div>
            <hr className="arena-rule" />
            <div><p className="eyebrow">Rules</p><h2 className="h3">参赛规则</h2><p className="arena-preserve-copy">{challenge.rules}</p></div>
            <hr className="arena-rule" />
            <div><p className="eyebrow">Submit</p><h2 className="h3">提交方式</h2><p className="arena-preserve-copy">上传一个不超过 50 MB 的 .zip 文件。评审只做静态分析，不执行提交代码。</p></div>
          </section>
          <section className="card">
            <div className="row-between arena-section-head"><h2 className="h3">八维评分</h2><span className="meta">总分 1000</span></div>
            <div className="arena-rubric-list">
              {challenge.dimensions.map((dimension, index) => (
                <div key={dimension.name} className="arena-rubric-row">
                  <span className="num muted">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{dimension.name}</strong>
                  <span className="meta">权重 {((dimension.maxScore / 1000) * 100).toFixed(0)}%</span>
                  <span className="num">{dimension.maxScore} 分</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="arena-submit-aside">
          <ArenaSubmissionPanel
            challenge={challenge}
            team={state.team}
            versions={state.versions}
            selectedVersionId={state.selectedVersionId}
            onSelectVersion={state.setSelectedVersionId}
          />
        </aside>
      </div>
    </main><PageFoot /></>
  );
}
