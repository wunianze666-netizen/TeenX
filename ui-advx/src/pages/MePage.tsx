import { useCaptain } from "../components/Captain";
import { MeCollections } from "../components/MeCollections";
import { MeOverview } from "../components/MeOverview";
import { MeProfileHeader } from "../components/MeProfileHeader";
import { PageFoot } from "../components/PageFoot";
import { TopNav } from "../components/TopNav";
import { useMeProfileData } from "../hooks/useMeProfileData";

export function MePage() {
  const { summary, loading, error, refresh } = useCaptain();
  const data = useMeProfileData();

  if (loading && !summary) {
    return <><TopNav active="me" /><main className="container me-page"><div className="me-loading" role="status"><span className="forum-loader" /><p className="muted mb-0">正在整理你的队长档案…</p></div></main></>;
  }
  if (!summary) {
    return (
      <>
        <TopNav active="me" />
        <main className="container me-page"><div className="card forum-error-card"><p className="eyebrow">个人中心</p><h1 className="h3">队长档案暂时无法读取</h1><p className="muted small">{error ?? "请稍后重试。"}</p><button className="btn btn-primary" onClick={() => void refresh()}>重新加载</button></div></main>
      </>
    );
  }
  return (
    <>
      <TopNav active="me" />
      <main className="container me-page">
        {(error || data.contactsError) && <div className="notice me-notice" role="alert"><b>{error ?? data.contactsError}</b></div>}
        <MeProfileHeader summary={summary} pendingCount={data.pendingCount} pendingHasMore={data.pendingHasMore} />
        <MeOverview summary={summary} forum={data.forum} forumLoading={data.forumLoading} />
        <MeCollections summary={summary} forum={data.forum} forumLoading={data.forumLoading} arenaRecords={data.arenaRecords} arenaLoading={data.arenaLoading} arenaError={data.arenaError} arenaPartial={data.arenaPartial} />
      </main>
      <PageFoot />
    </>
  );
}
