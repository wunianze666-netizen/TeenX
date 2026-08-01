import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { runDemoPreparation, type DemoPreparationStage } from "../demo-preparation";

let preparation: Promise<void> | null = null;

function prepareDemo(onStage: (stage: DemoPreparationStage) => void) {
  preparation ??= runDemoPreparation(api, onStage).catch((cause: unknown) => {
    preparation = null;
    throw cause;
  });
  return preparation;
}

const STAGE_LABEL: Record<DemoPreparationStage, string> = {
  team: "正在准备演示队伍…",
  arena: "正在生成 Arena 演示成绩…",
  ready: "正在打开 Studio…",
};

export function DemoEntryPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<DemoPreparationStage>("team");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void prepareDemo((nextStage) => {
      if (active) setStage(nextStage);
    })
      .then(() => {
        if (active) navigate("/studio", { replace: true });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "演示准备失败");
      });
    return () => {
      active = false;
    };
  }, [attempt, navigate]);

  function retry() {
    setError(null);
    setStage("team");
    setAttempt((value) => value + 1);
  }

  return (
    <main className="container profile-workflow profile-loading" role="status">
      {error ? (
        <div className="notice">
          <b>演示准备失败</b>
          <p className="muted small">{error}</p>
          <button type="button" className="btn btn-primary" onClick={retry}>
            重新准备
          </button>
        </div>
      ) : (
        <><span className="forum-loader" />{STAGE_LABEL[stage]}</>
      )}
    </main>
  );
}
