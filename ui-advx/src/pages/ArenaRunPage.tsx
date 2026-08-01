import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { arenaApi, type ArenaRunStatus, type ArenaStage, type PublicArenaRunDetail } from "../api";
import { formatArenaDate, formatBoundTeamVersion, formatBoundTeamVersionMeta } from "../arena-format";
import { ArenaStageList } from "../components/ArenaStageList";
import { PageFoot } from "../components/PageFoot";
import { TopNav } from "../components/TopNav";
import { useFeedback } from "../components/Feedback";
import { type ArenaObserverMode, useArenaRun } from "../hooks/useArenaRun";

const OBSERVER_LABEL: Record<ArenaObserverMode, string> = {
  connecting: "正在连接实时进度",
  live: "实时进度已连接",
  reconnecting: "连接中断，正在续接",
  reconciling: "正在核对权威状态",
  stopped: "实时读取已停止",
};

const STATUS_LABEL: Record<ArenaRunStatus, string> = {
  queued: "排队中",
  running: "评审中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
};

const STAGE_LABEL: Record<ArenaStage, string> = {
  challenge: "读取赛题",
  standard: "准备评分标准",
  analysis: "静态分析作品",
  scoring: "八维评分",
  summary: "汇总成绩",
};

function runFailureCopy(run: PublicArenaRunDetail): { readonly title: string; readonly body: string } | null {
  if (run.status === "interrupted") return { title: "服务中断了这次评审", body: "运行记录和进度已保留，可以手动恢复同一个 runId。" };
  if (run.status === "cancelled") return { title: "评审已由你取消", body: "这次运行不能再次启动。如需再评，请回到赛题提交新的 ZIP。" };
  if (run.status !== "failed") return null;
  if (run.failureCode === "ARENA_MODEL_UNAVAILABLE") return { title: "评审服务暂不可用", body: "本次没有生成成绩。如需再评，请创建新的提交。" };
  if (run.failureCode === "ARENA_MODEL_TIMEOUT" || run.failureCode === "ARENA_RUN_TIMEOUT") return { title: "评审等待超时", body: "本次没有生成成绩。如需再评，请创建新的提交。" };
  if (run.failureCode === "ARENA_CONTRACT_FAILED") return { title: "成绩契约校验未通过", body: "系统没有发布不完整成绩。如需再评，请创建新的提交。" };
  return { title: "评审没有完成", body: "这次运行不能再次启动。如需再评，请回到赛题提交新的 ZIP。" };
}

function liveStatus(run: PublicArenaRunDetail, activeDimension: string | null): { readonly lead: string; readonly completed: string } {
  const completed = `已完成 ${run.completedDimensions.length}/${run.dimensions.length} 个评分维度`;
  if (run.status === "running") {
    const stage = run.stage ? ` · ${STAGE_LABEL[run.stage]}` : "";
    const dimension = activeDimension ? `，正在评分${activeDimension}` : "";
    return { lead: `${STATUS_LABEL[run.status]}${stage}${dimension}，`, completed };
  }
  if (run.status === "interrupted") return { lead: "评审已中断，可手动恢复，", completed };
  return { lead: `${STATUS_LABEL[run.status]}，`, completed };
}

export function ArenaRunPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionGenerationRef = useRef(0);
  const actionControllerRef = useRef<AbortController | null>(null);
  const openResult = useCallback((completedRunId: string) => {
    navigate(`/arena/runs/${encodeURIComponent(completedRunId)}/result`, { replace: true });
  }, [navigate]);
  const state = useArenaRun({ runId, onAuthoritativeCompleted: openResult });

  useEffect(() => {
    actionGenerationRef.current += 1;
    actionControllerRef.current?.abort();
    setCancelling(false);
    setResuming(false);
    setActionError(null);
    return () => actionControllerRef.current?.abort();
  }, [runId]);

  async function cancelRun() {
    if (!state.run || !runId || cancelling || resuming) return;
    const accepted = await confirm({
      title: "取消这次评审？",
      body: "系统会停止评审。ZIP 和绑定版本会保留。",
      okText: "确认取消",
      danger: true,
    });
    if (accepted !== true) return;
    const generation = actionGenerationRef.current;
    const controller = new AbortController();
    actionControllerRef.current?.abort();
    actionControllerRef.current = controller;
    setCancelling(true);
    setActionError(null);
    try {
      await arenaApi.cancelRun(runId, controller.signal);
      const authoritative = await state.reconcile(controller.signal);
      if (!authoritative || generation !== actionGenerationRef.current) return;
      switch (authoritative.status) {
        case "completed":
          toast("评审已先完成，正在打开权威成绩");
          break;
        case "cancelled":
          toast("评审已取消");
          break;
        case "failed":
          toast("取消请求到达时，这次评审已失败");
          break;
        case "interrupted":
          toast("取消请求已提交；当前运行仍可恢复，请稍后核对状态");
          break;
        case "queued":
        case "running":
          toast("取消请求已提交，正在等待权威状态更新");
          break;
      }
    } catch (cause) {
      if (!controller.signal.aborted && generation === actionGenerationRef.current) {
        setActionError(cause instanceof Error ? cause.message : "取消失败");
      }
    } finally {
      if (generation === actionGenerationRef.current) setCancelling(false);
    }
  }

  async function resumeRun() {
    const current = state.run;
    if (!current || current.status !== "interrupted" || resuming || cancelling) return;
    const generation = actionGenerationRef.current;
    const controller = new AbortController();
    actionControllerRef.current?.abort();
    actionControllerRef.current = controller;
    setResuming(true);
    setActionError(null);
    try {
      const started = await arenaApi.startRun(current.submissionId, controller.signal);
      if (generation !== actionGenerationRef.current) return;
      if (started.runId !== current.runId) {
        navigate(`/arena/runs/${encodeURIComponent(started.runId)}`, { replace: true });
        return;
      }
      await state.reconcile(controller.signal);
      if (generation === actionGenerationRef.current) toast("正在恢复同一场评审");
    } catch (cause) {
      if (!controller.signal.aborted && generation === actionGenerationRef.current) {
        setActionError(cause instanceof Error ? cause.message : "恢复评审失败");
      }
    } finally {
      if (generation === actionGenerationRef.current) setResuming(false);
    }
  }

  const runMatchesRoute = state.run?.runId === runId;
  if ((state.loading && !state.run) || (!runMatchesRoute && !state.error)) {
    return <><TopNav active="contest" /><main className="container arena-page"><div className="empty">正在恢复评审状态…</div></main><PageFoot /></>;
  }
  if (!state.run || !runMatchesRoute || state.error) {
    return (
      <><TopNav active="contest" /><main className="container arena-page">
        <Link className="btn btn-ghost btn-sm" to="/arena">← 赛题列表</Link>
        <div className="notice arena-error-notice"><b>{state.error ?? "找不到这次评审"}</b><button type="button" className="btn btn-ghost btn-sm" onClick={state.reload}>重试</button></div>
      </main><PageFoot /></>
    );
  }

  const run = state.run;
  const active = run.status === "queued" || run.status === "running";
  const failure = runFailureCopy(run);
  const boundMeta = formatBoundTeamVersionMeta(run.boundTeamVersion);
  const announcedStatus = liveStatus(run, state.activeDimension);
  return (
    <><TopNav active="contest" /><main className="container arena-page arena-run-page">
      <div className="row-between arena-back-row">
        <Link className="btn btn-ghost btn-sm" to={`/arena/challenges/${encodeURIComponent(run.challengeVersionId)}`}>← 返回赛题</Link>
        <span className={`pill ${active ? "pill-blue" : run.status === "completed" ? "" : "pill-dim"}`}>{STATUS_LABEL[run.status]}</span>
      </div>
      <section className="arena-run-title">
        <p className="eyebrow">Arena Evaluation</p><h1 className="h2">{run.challengeTitle}</h1>
        <p className="lead">页面只展示真实评审阶段。你可以<span className="arena-keep-together">离开或刷新</span>，运行会继续使用同一个 runId。</p>
      </section>
      {state.observerError && active && <div className="notice arena-error-notice"><span>{state.observerError}</span><span className="meta">{OBSERVER_LABEL[state.observerMode]}</span></div>}
      {failure && <div className="notice arena-run-failure" role="status"><div><b>{failure.title}</b><p className="muted small mb-0">{failure.body}</p>{run.failureMessage && <p className="meta mb-0">{run.failureMessage}</p>}</div></div>}
      {actionError && <div className="notice arena-error-notice" role="alert"><b>{actionError}</b></div>}
      <div className="grid-2-1 arena-run-grid">
        <section className="card">
          <div className="row-between arena-section-head"><h2 className="h3">评审进度</h2><span className="meta" role="status" aria-live="polite" aria-atomic="true">{announcedStatus.lead}<span className="arena-keep-together">{announcedStatus.completed}</span></span></div>
          <ArenaStageList run={run} dimensions={run.dimensions} activeDimension={state.activeDimension} completedStages={state.completedStages} />
        </section>
        <aside className="card arena-run-meta-card">
          <h2 className="h3">本次提交</h2>
          <dl className="arena-meta-list">
            <div><dt>运行 ID</dt><dd className="num">{run.runId}</dd></div>
            <div><dt>队伍版本</dt><dd>{formatBoundTeamVersion(run.boundTeamVersion)}{boundMeta && <span className="meta"> · {boundMeta}</span>}</dd></div>
            <div><dt>开始时间</dt><dd>{run.startedAt ? formatArenaDate(run.startedAt) : "等待启动"}</dd></div>
            <div><dt>完成时间</dt><dd>{run.finishedAt ? formatArenaDate(run.finishedAt) : "—"}</dd></div>
          </dl>
          {active && <button type="button" className="btn btn-secondary" disabled={cancelling || resuming} onClick={() => void cancelRun()}>{cancelling ? "正在取消…" : "取消评审"}</button>}
          {run.status === "interrupted" && <button type="button" className="btn btn-primary" disabled={resuming || cancelling} onClick={() => void resumeRun()}>{resuming ? "正在恢复…" : "恢复同一场评审"}</button>}
          {(run.status === "failed" || run.status === "cancelled") && <Link className="btn btn-primary" to={`/arena/challenges/${encodeURIComponent(run.challengeVersionId)}`}>提交新的 ZIP</Link>}
        </aside>
      </div>
    </main><PageFoot /></>
  );
}
