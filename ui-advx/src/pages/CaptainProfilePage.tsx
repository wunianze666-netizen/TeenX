import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdvxApiError, api, type AdvxCaptainProfile, type ContactMutationResponse } from "../api";
import { CaptainContactActions, type CaptainMutation } from "../components/CaptainContactActions";
import { useFeedback } from "../components/Feedback";
import { PageFoot } from "../components/PageFoot";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { TopNav } from "../components/TopNav";
import { formatProfileDate, forumHref } from "../profile-format";
import { isCaptainPublicId } from "../profile-state";
import { safeForumTopicPath } from "../forum-paths";

function mutateCaptain(publicId: string, action: CaptainMutation): Promise<ContactMutationResponse> {
  switch (action) {
    case "request": return api.createContactRequest(publicId);
    case "block": return api.changeContact(publicId, "block");
    case "unblock": return api.unblockContact(publicId);
  }
}

type ProfileFailure = {
  readonly message: string;
  readonly status: number | null;
};

function failureHeading(status: number | null): string {
  if (status === 403) return "无权查看这位队长";
  if (status === 404) return "没有找到这位队长";
  return "社区暂时不可用";
}

export function CaptainProfilePage() {
  const { publicId = "" } = useParams();
  const { confirm, toast } = useFeedback();
  const [data, setData] = useState<AdvxCaptainProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ProfileFailure | null>(null);
  const [busy, setBusy] = useState<CaptainMutation | null>(null);
  const generation = useRef(0);
  const publicIdRef = useRef(publicId);
  publicIdRef.current = publicId;

  const load = useCallback(async (signal?: AbortSignal) => {
    const requestGeneration = ++generation.current;
    setData(null);
    setError(null);
    setBusy(null);
    setLoading(true);
    if (!isCaptainPublicId(publicId)) {
      setError({ message: "公开身份链接无效", status: 404 });
      setLoading(false);
      return;
    }
    try {
      const next = await api.getCaptainProfile(publicId, signal);
      if (generation.current === requestGeneration) setData(next);
    } catch (cause) {
      if (signal?.aborted || generation.current !== requestGeneration) return;
      setError({
        message: cause instanceof Error ? cause.message : "队长主页暂时无法读取",
        status: cause instanceof AdvxApiError ? cause.status : null,
      });
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }, [publicId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function mutate(action: CaptainMutation) {
    if (!data) return;
    const mutationGeneration = generation.current;
    const mutationPublicId = data.profile.publicId;
    if (action !== "request") {
      const accepted = await confirm({
        title: action === "block" ? "屏蔽这位队长？" : "解除我的屏蔽？",
        body: action === "block"
          ? "屏蔽会撤销待处理申请和已有私信授权。对方不会看到屏蔽方向。"
          : "解除后不会自动恢复私信授权，需要重新申请。",
        okText: action === "block" ? "确认屏蔽" : "确认解除",
        cancelText: "取消",
        danger: action === "block",
      });
      if (accepted !== true) return;
    }
    if (generation.current !== mutationGeneration || publicIdRef.current !== mutationPublicId) return;
    setBusy(action);
    setError(null);
    try {
      const result = await mutateCaptain(mutationPublicId, action);
      if (generation.current !== mutationGeneration || publicIdRef.current !== mutationPublicId) return;
      toast(action === "request" ? "私信申请已发出" : action === "block" ? "已屏蔽" : "已解除你的屏蔽");
      const viewerActions = result.viewerActions;
      if (viewerActions) setData((current) => current ? { ...current, viewerActions } : current);
      else await load();
    } catch (cause) {
      if (generation.current !== mutationGeneration || publicIdRef.current !== mutationPublicId) return;
      setError({ message: cause instanceof Error ? cause.message : "联络操作失败", status: null });
    } finally {
      if (generation.current === mutationGeneration && publicIdRef.current === mutationPublicId) setBusy(null);
    }
  }

  return (
    <>
      <TopNav active="forum" />
      <main className="container profile-workflow captain-profile-page">
        <div className="profile-back-row">
          <Link className="btn btn-ghost btn-sm" to="/forum">← 返回社区</Link>
          <span className="meta">队长主页</span>
        </div>
        {loading && <div className="profile-loading" role="status"><span className="forum-loader" />正在读取安全公开资料…</div>}
        {!loading && error && !data && (
          <section className="card profile-error" role="alert">
            <p className="eyebrow">Profile unavailable</p>
            <h1 className="h3">{failureHeading(error.status)}</h1>
            <p className="muted small">{error.message}</p>
            <button className="btn btn-primary" onClick={() => void load()}>重新加载</button>
          </section>
        )}
        {data && (
          <>
            {error && <div className="notice profile-notice" role="alert"><b>{error.message}</b></div>}
            <section className="profile-public-hero">
              <div className="profile-identity">
                <ProfileAvatar nickname={data.profile.nickname} avatarPath={data.profile.avatarPath} large />
                <div>
                  <p className="eyebrow">TeenX Captain</p>
                  <h1 className="h2">{data.profile.nickname}</h1>
                  <p className="meta profile-joined">加入于 {formatProfileDate(data.profile.joinedAt)}</p>
                </div>
              </div>
              <CaptainContactActions actions={data.viewerActions} busy={busy} onMutate={(action) => void mutate(action)} />
            </section>
            <div className="profile-public-grid">
              {data.team && (
                <section className="card profile-public-section">
                  <p className="eyebrow">Team</p><h2 className="h3">公开队伍</h2>
                  <strong className="profile-team-name">{data.team.name}</strong>
                  <p className="meta">{data.team.memberCount} 位队员 · {data.team.versionCount} 个版本</p>
                </section>
              )}
              {data.forum && (
                <section className="card profile-public-section profile-forum-section">
                  <div className="row-between"><div><p className="eyebrow">Forum</p><h2 className="h3">公开论坛活动</h2></div><span className="meta">{data.forum.topicCount} 个主题</span></div>
                  {data.forum.recentTopics.length === 0 ? <p className="muted small">还没有可展示的论坛主题。</p> : (
                    <div className="profile-topic-list">
                      {data.forum.recentTopics.flatMap((topic) => {
                        const path = safeForumTopicPath(topic.path);
                        return path ? [<Link key={topic.id} to={forumHref(path)} className="profile-topic-row"><strong>{topic.title}</strong><time className="meta">{formatProfileDate(topic.createdAt)}</time></Link>] : [];
                      })}
                    </div>
                  )}
                </section>
              )}
              {!data.team && !data.forum && (
                <section className="empty profile-public-empty"><h2 className="h3">这位队长选择保持低调</h2><p className="muted small mb-0">目前没有主动公开的队伍或论坛聚合内容。</p></section>
              )}
            </div>
          </>
        )}
      </main>
      <PageFoot />
    </>
  );
}
