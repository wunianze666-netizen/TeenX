import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

let preparation: Promise<void> | null = null;

function prepareDemo() {
  preparation ??= api.bootstrapDemo()
    .then(() => api.prepareDemoArena())
    .then(() => undefined);
  return preparation;
}

export function DemoEntryPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void prepareDemo()
      .then(() => {
        if (active) navigate("/studio", { replace: true });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "演示准备失败");
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="container profile-workflow profile-loading" role="status">
      {error ? (
        <div className="notice">
          <b>演示准备失败</b>
          <p className="muted small">{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            重新准备
          </button>
        </div>
      ) : (
        <><span className="forum-loader" />正在准备演示队伍…</>
      )}
    </main>
  );
}
