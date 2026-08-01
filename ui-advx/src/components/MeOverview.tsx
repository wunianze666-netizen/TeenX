import { Link } from "react-router-dom";
import type { ForumOverview, MeSummary } from "../api";
import { formatProfileDate, forumHref } from "../profile-format";

type MeOverviewProps = {
  readonly summary: MeSummary;
  readonly forum: ForumOverview | null;
  readonly forumLoading: boolean;
};

export function MeOverview({ summary, forum, forumLoading }: MeOverviewProps) {
  const forumConnected = forum?.status === "connected";
  const forumStatus = forumLoading
    ? "正在同步"
    : forumConnected
      ? `@${forum.username}`
      : forum?.status === "signed_out" ? "等待首次连接" : "论坛暂时离线";
  return (
    <div className="grid-2 me-overview-grid">
      <section className="card me-team-card">
        <div className="row-between me-card-head"><div><p className="eyebrow">My team</p><h2 className="h3">我的队伍</h2></div><Link className="btn btn-ghost btn-sm" to="/studio">进入 →</Link></div>
        {summary.team ? (
          <div className="me-stat-grid">
            <div className="me-stat me-stat-wide"><span className="meta">队伍名</span><strong>{summary.team.name}</strong></div>
            <div className="me-stat"><span className="meta">版本数</span><strong className="num">{summary.team.versionCount}</strong></div>
            <div className="me-stat"><span className="meta">队员数</span><strong className="num">{summary.team.memberCount}</strong></div>
            <div className="me-stat"><span className="meta">总试跑</span><strong className="num">{summary.stats.testRunCount}</strong></div>
          </div>
        ) : (
          <div className="empty me-empty"><p className="muted small">还没有队伍。先从一支能一起完成任务的 AI 小队开始。</p><Link className="btn btn-primary btn-sm" to="/studio">创建队伍</Link></div>
        )}
      </section>
      <section className="card me-community-card">
        <div className="row-between me-card-head"><div><p className="eyebrow">Community</p><h2 className="h3">社区身份</h2></div><span className={`pill ${forumConnected ? "pill-blue" : "pill-dim"}`}>{forumStatus}</span></div>
        <div className="me-community-stats">
          <div><span className="meta">主题</span><strong className="num">{forum?.topicCount ?? 0}</strong></div>
          <div><span className="meta">发言</span><strong className="num">{forum?.postCount ?? 0}</strong></div>
          <div><span className="meta">未读私信</span><strong className="num">{forum?.unreadMessages ?? 0}</strong></div>
        </div>
        {!forumLoading && forumConnected && <p className="meta me-community-recent">{forum.latestMessageAt ? `最近私信 · ${formatProfileDate(forum.latestMessageAt, true)}` : "还没有私信对话"}</p>}
        <div className="row me-community-actions"><Link className="btn btn-secondary btn-sm" to={forumHref("/my/messages")}>查看私信</Link><Link className="btn btn-ghost btn-sm" to="/forum">进入论坛 →</Link></div>
      </section>
    </div>
  );
}
