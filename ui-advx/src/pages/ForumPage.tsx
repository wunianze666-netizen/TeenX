import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getDemoCommunity, type DemoCommunity as DemoCommunityData } from "../forum-api";
import { DemoCommunity } from "../components/DemoCommunity";
import { TopNav } from "../components/TopNav";

type ForumState = "checking" | "connecting" | "recovering" | "ready" | "error";

function safeForumPath(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  const parsed = new URL(raw, "http://teenx.local");
  if (parsed.origin !== "http://teenx.local" || parsed.pathname.startsWith("/session/sso")) return "/";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function withRetryMarker(path: string, attempt: number) {
  if (attempt === 0) return path;
  const parsed = new URL(path, "http://teenx.local");
  parsed.searchParams.set("_teenx_retry", String(attempt));
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

async function clearStaleForumRuntime() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map((registration) => registration.unregister()));
  }
  if ("caches" in window) {
    const keys = await window.caches.keys();
    await Promise.allSettled(keys.map((key) => window.caches.delete(key)));
  }
}

export function ForumPage() {
  const [demoCommunity, setDemoCommunity] = useState<DemoCommunityData | null | undefined>(undefined);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getDemoCommunity().then((community) => {
      if (active) setDemoCommunity(community);
    }).catch((cause) => {
      if (!active) return;
      setDetectionError(cause instanceof Error ? cause.message : "演示社区暂时无法读取");
      setDemoCommunity(null);
    });
    return () => { active = false; };
  }, []);

  if (demoCommunity) return <DemoCommunity community={demoCommunity} />;
  if (detectionError) {
    return <><TopNav active="forum" /><main className="container demo-community-main"><div className="card forum-error-card" role="alert"><p className="eyebrow">Community</p><h1 className="h3">社区连接未完成</h1><p className="muted small">{detectionError}</p></div></main></>;
  }
  if (demoCommunity === undefined) {
    return <><TopNav active="forum" /><main className="forum-gate" role="status"><div className="forum-gate-copy"><span className="forum-loader" aria-hidden="true" /><p className="muted small mb-0">正在连接社区…</p></div></main></>;
  }
  return <DiscourseForumPage />;
}

function DiscourseForumPage() {
  const location = useLocation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const targetPath = safeForumPath(new URLSearchParams(location.search).get("path"));
  const baseReturnPath = targetPath === "/" ? "/latest" : targetPath;
  const [attempt, setAttempt] = useState(0);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [state, setState] = useState<ForumState>("checking");
  const [detail, setDetail] = useState<string | null>(null);
  const returnPath = withRetryMarker(baseReturnPath, attempt);
  const ssoSrc = `/discourse/session/sso?return_path=${encodeURIComponent(returnPath)}&_teenx_attempt=${attempt}`;

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);

    setFrameSrc(null);
    setState("checking");
    setDetail(null);

    void fetch(`/api/advx/forum/session?_teenx_preflight=${attempt}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (disposed) return;
        if (response.ok) {
          const payload = await response.json() as { connected?: boolean };
          if (payload.connected) {
            setFrameSrc(returnPath);
            setState("connecting");
            return;
          }
          setFrameSrc(ssoSrc);
          setState("connecting");
          return;
        }

        throw new Error(`论坛健康检查返回 ${response.status}`);
      })
      .catch((cause) => {
        if (disposed) return;
        setDetail(cause instanceof Error && cause.name === "AbortError"
          ? "论坛服务连接超时，请确认 Discourse 已启动。"
          : cause instanceof Error ? cause.message : "论坛健康检查失败");
        setState("error");
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt, returnPath, ssoSrc]);

  useEffect(() => {
    if (!frameSrc) return;
    let disposed = false;
    let timer = 0;
    const startedAt = Date.now();

    const inspect = () => {
      if (disposed) return;
      const frame = frameRef.current;

      try {
        const document = frame?.contentDocument;
        const outlet = document?.querySelector("#main-outlet");
        const appReady = Boolean(
          document?.querySelector(".ember-application") &&
          outlet &&
          outlet.childElementCount > 0,
        );

        if (appReady) {
          setState("ready");
          setDetail(null);
          return;
        }

      } catch {
        setDetail(`论坛登录跳到了不同主机。Studio 当前地址是 ${window.location.host}，请重新连接。`);
        setState("error");
        return;
      }

      if (Date.now() - startedAt >= 20_000) {
        if (attempt === 0) {
          setState("recovering");
          setDetail("检测到论坛运行时可能已缓存，正在自动清理并重试一次。");
          void clearStaleForumRuntime().finally(() => {
            if (!disposed) setAttempt(1);
          });
        } else {
          setDetail("论坛页面已返回，但应用没有在 20 秒内完成启动。请重试或在新窗口打开。");
          setState("error");
        }
        return;
      }

      timer = window.setTimeout(inspect, 250);
    };

    timer = window.setTimeout(inspect, 100);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [attempt, frameSrc]);

  function retry() {
    setFrameSrc(null);
    setState("recovering");
    setDetail("正在清理旧的论坛运行时并重新连接。");
    void clearStaleForumRuntime().finally(() => setAttempt((value) => value + 1));
  }

  const isWorking = state === "checking" || state === "connecting" || state === "recovering";

  return (
    <div className="forum-page">
      <TopNav active="forum" />
      <main className="forum-shell">
        {frameSrc && (
          <iframe
            key={`${attempt}:${frameSrc}`}
            ref={frameRef}
            src={frameSrc}
            title="TeenX 社区"
            onError={() => {
              setDetail("论坛页面加载失败，请确认服务已启动。");
              setState("error");
            }}
          />
        )}

        {state !== "ready" && (
          <div className="forum-gate" role={state === "error" ? "alert" : "status"}>
            {isWorking ? (
              <div className="forum-gate-copy">
                <span className="forum-loader" aria-hidden="true" />
                <p className="eyebrow mb-0">TeenX 社区</p>
                <h2 className="h3">{state === "recovering" ? "正在修复论坛连接" : "正在连接队长身份"}</h2>
                <p className="muted small mb-0">{detail ?? "Studio 正在检查会话并完成论坛登录，不需要再次输入账号。"}</p>
              </div>
            ) : (
              <div className="card forum-error-card">
                <p className="eyebrow">连接未完成</p>
                <h2 className="h3">论坛暂时没有响应</h2>
                <p className="muted small">{detail ?? "请确认论坛服务已启动，然后重试。你的 Studio 登录状态不会丢失。"}</p>
                <div className="row forum-error-actions">
                  <button className="btn btn-primary" onClick={retry}>清理并重新连接</button>
                  <a className="btn btn-secondary" href={ssoSrc} target="_blank" rel="noreferrer">在新窗口打开</a>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
