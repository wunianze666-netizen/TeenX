import { useCallback, useEffect, useRef, useState } from "react";
import {
  arenaApi,
  ArenaApiError,
  ArenaSseProtocolError,
  type ArenaEventConnection,
  type ArenaProgressEvent,
  type ArenaStage,
  type PublicArenaRunDetail,
} from "../api";

export type ArenaObserverMode = "connecting" | "live" | "reconnecting" | "reconciling" | "stopped";

type UseArenaRunInput = {
  readonly runId: string | undefined;
  readonly onAuthoritativeCompleted: (runId: string) => void;
};

type AuthoritativeCommit = {
  readonly run: PublicArenaRunDetail;
  readonly generation: number;
};

const INACTIVITY_MS = 22_000;
const RECONNECT_LIMIT = 3;

export function isFinalArenaRunStatus(status: PublicArenaRunDetail["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isObservedStatus(status: PublicArenaRunDetail["status"]): boolean {
  return status === "queued" || status === "running" || status === "interrupted";
}

function isDefinitiveObserverError(cause: unknown): boolean {
  return cause instanceof ArenaApiError && (cause.status === 401 || cause.status === 403 || cause.status === 404);
}

function observerErrorMessage(cause: unknown): string {
  if (cause instanceof ArenaSseProtocolError) return "实时事件不连续或格式异常，正在核对权威状态。";
  if (cause instanceof ArenaApiError && (cause.status === 401 || cause.status === 403)) return "当前身份无法继续读取这次评审。";
  if (cause instanceof ArenaApiError && cause.status === 404) return "这次评审已不存在，实时读取已停止。";
  return cause instanceof Error ? cause.message : "实时连接中断";
}

function waitForReconnect(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 1_500);
    const abort = () => {
      window.clearTimeout(timer);
      resolve();
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

export function useArenaRun(input: UseArenaRunInput) {
  const { runId, onAuthoritativeCompleted } = input;
  const completionRef = useRef(onAuthoritativeCompleted);
  completionRef.current = onAuthoritativeCompleted;
  const generationRef = useRef(0);
  const cursorByRunRef = useRef(new Map<string, number>());
  const [run, setRun] = useState<PublicArenaRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [observerMode, setObserverMode] = useState<ArenaObserverMode>("connecting");
  const [observerError, setObserverError] = useState<string | null>(null);
  const [activeDimension, setActiveDimension] = useState<string | null>(null);
  const [completedStages, setCompletedStages] = useState<readonly ArenaStage[]>([]);

  const commitAuthoritative = useCallback((commit: AuthoritativeCommit): boolean => {
    if (commit.generation !== generationRef.current) return false;
    setRun(commit.run);
    if (commit.run.status === "completed") completionRef.current(commit.run.runId);
    return true;
  }, []);

  useEffect(() => {
    if (!runId) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const controller = new AbortController();
    setRun(null);
    setLoading(true);
    setError(null);
    setObserverError(null);
    setObserverMode("connecting");
    setCompletedStages([]);
    setActiveDimension(null);
    void arenaApi.getRun(runId, controller.signal).then((next) => {
      commitAuthoritative({ run: next, generation });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && generation === generationRef.current) {
        setError(cause instanceof Error ? cause.message : "评审状态加载失败");
      }
    }).finally(() => {
      if (!controller.signal.aborted && generation === generationRef.current) setLoading(false);
    });
    return () => controller.abort();
  }, [runId, reloadKey, commitAuthoritative]);

  const observed = Boolean(run && run.runId === runId && isObservedStatus(run.status));

  useEffect(() => {
    if (!runId || !observed) return;
    const generation = generationRef.current;
    const lifetime = new AbortController();
    let connection: ArenaEventConnection | null = null;
    let inactivityTimer: number | null = null;
    let inactivityTriggered = false;

    const clearInactivity = () => {
      if (inactivityTimer !== null) window.clearTimeout(inactivityTimer);
      inactivityTimer = null;
    };
    const resetInactivity = () => {
      clearInactivity();
      inactivityTimer = window.setTimeout(() => {
        inactivityTriggered = true;
        connection?.abort(new DOMException("Arena stream inactive", "TimeoutError"));
      }, INACTIVITY_MS);
    };
    const current = () => generation === generationRef.current && !lifetime.signal.aborted;
    const reconcile = async (): Promise<PublicArenaRunDetail | null> => {
      const next = await arenaApi.getRun(runId, lifetime.signal);
      return commitAuthoritative({ run: next, generation }) ? next : null;
    };
    const applyEvent = (event: ArenaProgressEvent) => {
      if (!current()) return;
      switch (event.type) {
        case "run_started":
          setRun((value) => value ? { ...value, status: "running", startedAt: event.startedAt } : value);
          break;
        case "stage":
          if (event.status === "started") setRun((value) => value ? { ...value, status: "running", stage: event.stage } : value);
          else setCompletedStages((value) => value.includes(event.stage) ? value : [...value, event.stage]);
          break;
        case "dimension":
          if (event.status === "started") setActiveDimension(event.name);
          else {
            setActiveDimension((value) => value === event.name ? null : value);
            setRun((value) => value && !value.completedDimensions.includes(event.name)
              ? { ...value, completedDimensions: [...value.completedDimensions, event.name] }
              : value);
          }
          break;
        case "run_completed":
        case "run_failed":
        case "run_cancelled":
          setObserverMode("reconciling");
          break;
      }
    };

    const observe = async () => {
      let attempts = 0;
      while (current() && attempts < RECONNECT_LIMIT) {
        setObserverMode(attempts === 0 ? "connecting" : "reconnecting");
        inactivityTriggered = false;
        try {
          connection = arenaApi.connectRunEvents(runId, {
            cursor: cursorByRunRef.current.get(runId),
            signal: lifetime.signal,
            onOpen: () => {
              if (!current()) return;
              setObserverMode("live");
              setObserverError(null);
              resetInactivity();
            },
            onActivity: resetInactivity,
            onEvent: applyEvent,
            onCursor: (cursor) => cursorByRunRef.current.set(runId, cursor),
          });
          const result = await connection.done;
          connection = null;
          clearInactivity();
          if (!current()) return;
          setObserverMode("reconciling");
          setObserverError(result.terminal ? null : "实时连接已结束，正在核对权威状态。");
          const authoritative = await reconcile();
          if (!authoritative || isFinalArenaRunStatus(authoritative.status) || authoritative.status === "interrupted") return;
        } catch (cause) {
          if (!(cause instanceof Error)) throw cause;
          connection = null;
          clearInactivity();
          if (!current()) return;
          if (isDefinitiveObserverError(cause)) {
            setObserverMode("stopped");
            setObserverError(observerErrorMessage(cause));
            return;
          }
          setObserverMode("reconciling");
          setObserverError(inactivityTriggered ? "实时进度暂时没有活动，正在核对权威状态。" : observerErrorMessage(cause));
          try {
            const authoritative = await reconcile();
            if (!authoritative || isFinalArenaRunStatus(authoritative.status) || authoritative.status === "interrupted") return;
          } catch (reconcileCause) {
            if (!(reconcileCause instanceof Error)) throw reconcileCause;
            if (!current()) return;
            setObserverError(observerErrorMessage(reconcileCause));
            if (isDefinitiveObserverError(reconcileCause)) {
              setObserverMode("stopped");
              return;
            }
          }
        }
        attempts += 1;
        if (attempts < RECONNECT_LIMIT) await waitForReconnect(lifetime.signal);
      }
      if (!current()) return;
      setObserverMode("reconciling");
      try {
        await reconcile();
      } catch (cause) {
        if (!(cause instanceof Error)) throw cause;
        if (current()) setObserverError(observerErrorMessage(cause));
      }
      if (current()) setObserverMode("stopped");
    };

    void observe();
    return () => {
      clearInactivity();
      lifetime.abort();
      connection?.abort();
    };
  }, [runId, observed, commitAuthoritative]);

  const reconcile = useCallback(async (signal?: AbortSignal): Promise<PublicArenaRunDetail | null> => {
    if (!runId) return null;
    const generation = generationRef.current;
    const next = await arenaApi.getRun(runId, signal);
    return commitAuthoritative({ run: next, generation }) ? next : null;
  }, [runId, commitAuthoritative]);

  return {
    run,
    loading,
    error,
    observerMode,
    observerError,
    activeDimension,
    completedStages,
    reconcile,
    reload: () => setReloadKey((value) => value + 1),
  };
}
