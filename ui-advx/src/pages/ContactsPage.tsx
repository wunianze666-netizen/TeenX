import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AdvxApiError, api, type ContactDecision, type ContactMutationResponse } from "../api";
import { ContactGrantRows, ContactRequestRows } from "../components/ContactRows";
import { useFeedback } from "../components/Feedback";
import { PageFoot } from "../components/PageFoot";
import { Seg } from "../components/Seg";
import { TopNav } from "../components/TopNav";
import { useContactList, type ContactTab } from "../hooks/useContactList";
import { forumHref } from "../profile-format";
import { safeForumMessagePath } from "../forum-paths";

const TAB_OPTIONS = [
  { value: "inbox", label: "收到的申请" },
  { value: "sent", label: "发出的申请" },
  { value: "approved", label: "已授权联系人" },
] as const;

function requestedTab(value: string | null): ContactTab {
  return value === "sent" || value === "approved" ? value : "inbox";
}

type MutationPlan = {
  readonly id: string;
  readonly successMessage: string;
  readonly request: () => Promise<ContactMutationResponse>;
  readonly apply: (result: ContactMutationResponse) => void;
};

export function ContactsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const list = useContactList(requestedTab(searchParams.get("tab")));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionGeneration = useRef(0);
  const activeTab = useRef(list.tab);
  activeTab.current = list.tab;

  function selectTab(value: string) {
    const next = requestedTab(value);
    actionGeneration.current += 1;
    setBusyId(null);
    list.setTab(next);
    setSearchParams({ tab: next }, { replace: true });
    setActionError(null);
  }

  async function runMutation(plan: MutationPlan) {
    const requestGeneration = actionGeneration.current + 1;
    actionGeneration.current = requestGeneration;
    setBusyId(plan.id);
    setActionError(null);
    try {
      const result = await plan.request();
      if (actionGeneration.current !== requestGeneration) return;
      plan.apply(result);
      toast(plan.successMessage);
    } catch (cause) {
      if (actionGeneration.current !== requestGeneration) return;
      const recoverable = cause instanceof AdvxApiError && (cause.status === 404 || cause.status === 409);
      const message = cause instanceof AdvxApiError && cause.status === 409
        ? `状态已变化：${cause.message}`
        : cause instanceof Error ? cause.message : "联络操作失败";
      setActionError(message);
      if (recoverable) list.reload();
    } finally {
      if (actionGeneration.current === requestGeneration) setBusyId(null);
    }
  }

  async function decide(requestId: string, decision: ContactDecision) {
    const sourceTab = activeTab.current;
    if (decision === "decline") {
      const accepted = await confirm({ title: "拒绝这条申请？", body: "拒绝后，对方可以在未来重新申请。", okText: "确认拒绝", cancelText: "取消" });
      if (accepted !== true) return;
    }
    if (activeTab.current !== sourceTab) return;
    await runMutation({
      id: requestId,
      successMessage: decision === "accept" ? "已接受私信申请" : "已拒绝私信申请",
      request: () => api.decideContactRequest(requestId, decision),
      apply: () => list.removeRequest(requestId),
    });
  }

  async function revoke(requestId: string) {
    const sourceTab = activeTab.current;
    const accepted = await confirm({ title: "撤回这条申请？", body: "撤回后，这条待处理申请会立即关闭。", okText: "确认撤回", cancelText: "取消" });
    if (accepted !== true) return;
    if (activeTab.current !== sourceTab) return;
    await runMutation({
      id: requestId,
      successMessage: "申请已撤回",
      request: () => api.revokeContactRequest(requestId),
      apply: () => list.removeRequest(requestId),
    });
  }

  async function changeContact(publicId: string, action: "sever" | "block" | "unblock") {
    const sourceTab = activeTab.current;
    const copy = action === "sever"
      ? { title: "撤销私信授权？", body: "已有私信历史仍可查看，但双方不能继续发送。", okText: "撤销授权" }
      : action === "block"
        ? { title: "屏蔽这位队长？", body: "屏蔽会同时关闭申请和私信授权，对方不会看到屏蔽方向。", okText: "确认屏蔽" }
        : { title: "解除屏蔽？", body: "解除后不会自动恢复授权，需要重新申请。", okText: "确认解除" };
    const accepted = await confirm({ ...copy, cancelText: "取消", danger: action !== "unblock" });
    if (accepted !== true) return;
    if (activeTab.current !== sourceTab) return;
    await runMutation({
      id: publicId,
      successMessage: action === "sever" ? "私信授权已撤销" : action === "block" ? "已屏蔽" : "已解除屏蔽",
      request: () => action === "unblock" ? api.unblockContact(publicId) : api.changeContact(publicId, action),
      apply: (result) => list.applyContact(publicId, result.grant),
    });
  }

  async function openMessage(publicId: string) {
    const requestGeneration = actionGeneration.current + 1;
    actionGeneration.current = requestGeneration;
    setBusyId(publicId);
    setActionError(null);
    try {
      const profile = await api.getCaptainProfile(publicId);
      if (actionGeneration.current !== requestGeneration) return;
      const messagePath = safeForumMessagePath(profile.viewerActions.forumMessagePath);
      if (!profile.viewerActions.canMessage || !messagePath) {
        setActionError("私信授权已变化，请刷新联络状态后重试。");
        list.reload();
        return;
      }
      navigate(forumHref(messagePath));
    } catch (cause) {
      if (actionGeneration.current !== requestGeneration) return;
      setActionError(cause instanceof Error ? cause.message : "无法确认最新私信授权");
    } finally {
      if (actionGeneration.current === requestGeneration) setBusyId(null);
    }
  }

  const emptyLabel = list.tab === "inbox" ? "没有待处理的收到申请" : list.tab === "sent" ? "没有待处理的发出申请" : "还没有已授权联系人";
  return (
    <>
      <TopNav active="me" />
      <main className="container profile-workflow contacts-page">
        <header className="profile-page-head">
          <Link className="btn btn-ghost btn-sm" to="/me">← 返回个人中心</Link>
          <p className="eyebrow">Safe contact</p>
          <h1 className="h2">联络申请</h1>
          <p className="lead">私信必须逐条授权。申请不允许附言，<span className="profile-keep-together">撤销或屏蔽后</span>立即停止继续发送。</p>
        </header>
        <Seg label="联络申请分类" options={[...TAB_OPTIONS]} value={list.tab} onChange={selectTab} />
        {(list.error || actionError) && <div className="notice profile-list-notice" role="alert"><b>{actionError ?? list.error}</b></div>}
        <section className="card contacts-card" aria-live="polite">
          {list.loading ? <div className="profile-loading" role="status"><span className="forum-loader" />正在读取联络状态…</div> : (
            <>
              {list.tab === "approved" && list.contacts.length > 0 && <ContactGrantRows items={list.contacts} busyId={busyId} onAction={(id, action) => void changeContact(id, action)} onMessage={(id) => void openMessage(id)} />}
              {list.tab !== "approved" && list.requests.length > 0 && <ContactRequestRows items={list.requests} busyId={busyId} onDecision={(id, decision) => void decide(id, decision)} onRevoke={(id) => void revoke(id)} />}
              {((list.tab === "approved" && list.contacts.length === 0) || (list.tab !== "approved" && list.requests.length === 0)) && <div className="empty contact-empty"><h2 className="h3">{emptyLabel}</h2><p className="muted small mb-0">联络状态由社区安全服务实时确认。</p></div>}
            </>
          )}
        </section>
        {list.nextCursor && <button className="btn btn-secondary profile-load-more" disabled={list.loadingMore} onClick={() => void list.loadMore()}>{list.loadingMore ? "加载中" : "加载更多"}</button>}
      </main>
      <PageFoot />
    </>
  );
}
