import { Link } from "react-router-dom";
import type { ArenaRunStatus, ForumOverview, MeSummary } from "../api";
import type { MeArenaRecord } from "../hooks/useMeProfileData";
import { formatProfileDate, forumHref, plainProfileText } from "../profile-format";

function runStatus(status: ArenaRunStatus): string {
  switch (status) {
    case "queued": return "等待评测";
    case "running": return "评测中";
    case "completed": return "评测完成";
    case "failed": return "评测失败";
    case "cancelled": return "已取消";
    case "interrupted": return "评测中断";
    default: return status satisfies never;
  }
}

type MeCollectionsProps = {
  readonly summary: MeSummary;
  readonly forum: ForumOverview | null;
  readonly forumLoading: boolean;
  readonly arenaRecords: readonly MeArenaRecord[];
  readonly arenaLoading: boolean;
  readonly arenaError: string | null;
  readonly arenaPartial: boolean;
};

export function MeCollections(props: MeCollectionsProps) {
  const { summary, forum, forumLoading, arenaRecords, arenaLoading, arenaError, arenaPartial } = props;
  const forumConnected = forum?.status === "connected";
  return (
    <>
      <div className="grid-2 me-content-grid">
        <section>
          <div className="section-title-row"><h2 className="h3">我的赛题记录</h2><span className="meta">{arenaRecords.length} 场</span></div>
          <div className="card me-list-card">
            {arenaPartial && <p className="notice me-arena-partial"><b>部分记录暂不可用</b><span>已显示成功读取的 owner-only 数据。</span></p>}
            {arenaLoading ? <p className="muted small mb-0">正在读取你的私有赛题记录…</p> : arenaError ? <div className="me-inline-empty" role="alert"><p className="muted small mb-0">{arenaError}</p><Link className="btn btn-secondary btn-sm" to="/arena">打开赛题</Link></div> : arenaRecords.length === 0 ? (
              <div className="empty me-empty-card"><span className="me-empty-index num">01</span><div><h3>还没有参赛记录</h3><p className="muted small mb-0">提交作品并完成评测后，只有你能在这里看到结果。</p></div><Link className="btn btn-ghost btn-sm" to="/arena">浏览赛题 →</Link></div>
            ) : arenaRecords.map((record) => (
              <Link className="me-list-row me-arena-row" to={`/arena/runs/${encodeURIComponent(record.runId)}${record.status === "completed" ? "/result" : ""}`} key={record.runId}>
                <span className={`pill ${record.official ? "" : "pill-dim"}`}>{runStatus(record.status)}</span>
                <span className="me-list-copy"><strong>{record.challengeTitle}</strong><small>{record.partial ? "结果暂不可用 · 记录不完整" : record.official === false ? "非官方评测 · 不计正式成绩" : record.official === true ? "正式评测" : "仅本人可见"}</small></span>
                <span className="me-score-meta">{record.totalScore === null ? <span className="meta">{formatProfileDate(record.finishedAt)}</span> : <strong className="num">{record.totalScore} / {record.totalMaxScore}</strong>}</span>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <div className="section-title-row"><h2 className="h3">我的论坛活动</h2><Link className="btn btn-ghost btn-sm" to={forumHref("/my/activity")}>全部活动 →</Link></div>
          <div className="card me-list-card">
            {forumLoading ? <p className="muted small mb-0">正在同步论坛活动…</p> : !forumConnected ? <div className="me-inline-empty"><p className="muted small mb-0">连接论坛后，这里会显示你发起的主题和回复。</p><Link className="btn btn-secondary btn-sm" to="/forum">连接论坛</Link></div> : forum.activities.length === 0 ? <p className="muted small mb-0">还没有论坛活动，去社区分享一次队伍试跑吧。</p> : forum.activities.map((activity) => (
              <Link className="me-list-row" to={forumHref(activity.path)} key={activity.id}><span className={`pill ${activity.kind === "topic" ? "" : "pill-blue"}`}>{activity.kind === "topic" ? "发帖" : "回复"}</span><span className="me-list-copy"><strong>{activity.title}</strong>{plainProfileText(activity.excerpt) && <small>{plainProfileText(activity.excerpt)}</small>}</span><time className="meta">{formatProfileDate(activity.createdAt, true)}</time></Link>
            ))}
          </div>
        </section>
      </div>
      <div className="grid-2 me-content-grid me-last-grid">
        <section>
          <div className="section-title-row"><h2 className="h3">我的收藏</h2><span className="meta">{forum?.bookmarkCount ?? 0} 条</span></div>
          <div className="card me-list-card">
            {forumLoading ? <p className="muted small mb-0">正在同步收藏…</p> : !forumConnected ? <p className="muted small mb-0">论坛连接后，收藏的帖子会出现在这里。</p> : forum.bookmarks.length === 0 ? <p className="muted small mb-0">还没有收藏。遇到有用的经验，可以先在论坛里收藏。</p> : forum.bookmarks.map((bookmark) => (
              <Link className="me-list-row" to={forumHref(bookmark.path)} key={bookmark.id}><span className="pill pill-dim">收藏</span><span className="me-list-copy"><strong>{bookmark.title}</strong>{plainProfileText(bookmark.excerpt) && <small>{plainProfileText(bookmark.excerpt)}</small>}</span><time className="meta">{formatProfileDate(bookmark.createdAt)}</time></Link>
            ))}
          </div>
        </section>
        <section>
          <div className="section-title-row"><h2 className="h3">账号与偏好</h2><span className="meta">当前身份</span></div>
          <div className="card me-account-card">
            <div className="row-between me-account-row"><div><span className="meta">队长昵称</span><strong>{summary.profile.nickname}</strong></div><Link className="btn btn-ghost btn-sm" to="/me/settings">修改</Link></div>
            <div className="row-between me-account-row"><div><span className="meta">身份状态</span><strong>{summary.profile.authMode === "local_fixture" ? "本地演示" : "已登录"}</strong></div><span className="pill pill-blue">安全连接</span></div>
            <p className="notice me-privacy-note mb-0"><span className="profile-keep-together">Studio 与论坛使用同一个队长身份。</span>{" "}<span className="profile-keep-together">个人中心不会公开邮箱或模型配置。</span></p>
          </div>
        </section>
      </div>
    </>
  );
}
