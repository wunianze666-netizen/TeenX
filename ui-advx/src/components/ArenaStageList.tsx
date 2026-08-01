import type { ArenaRunDimension, ArenaStage, PublicArenaRunState } from "../api";

const STAGES: readonly { readonly id: ArenaStage; readonly label: string; readonly description: string }[] = [
  { id: "challenge", label: "读取赛题", description: "核对挑战版本与提交材料" },
  { id: "standard", label: "准备评分标准", description: "生成或复用本题专属评分锚点" },
  { id: "analysis", label: "静态分析作品", description: "只读取 ZIP，不执行其中的代码" },
  { id: "scoring", label: "八维评分", description: "逐维独立评审并完成仲裁" },
  { id: "summary", label: "汇总成绩", description: "校验总分并保存成绩卡" },
];

type StageVisualState = "pending" | "active" | "completed" | "stopped";

function visualLabel(state: StageVisualState) {
  if (state === "active") return "进行中";
  if (state === "completed") return "已完成";
  if (state === "stopped") return "已停止";
  return "等待中";
}

export function ArenaStageList({
  run,
  dimensions,
  activeDimension,
  completedStages,
}: {
  run: PublicArenaRunState;
  dimensions: readonly ArenaRunDimension[];
  activeDimension: string | null;
  completedStages: readonly ArenaStage[];
}) {
  const currentIndex = run.stage ? STAGES.findIndex((stage) => stage.id === run.stage) : -1;
  const stopped = run.status === "failed" || run.status === "cancelled" || run.status === "interrupted";
  const completed = new Set(completedStages);
  const completedDimensions = new Set(run.completedDimensions);

  function stageState(stage: ArenaStage, index: number): StageVisualState {
    if (run.status === "completed" || completed.has(stage) || (currentIndex > index && currentIndex >= 0)) {
      return "completed";
    }
    if (run.stage === stage) return stopped ? "stopped" : "active";
    return "pending";
  }

  return (
    <div className="arena-stage-list">
      <ol>
        {STAGES.map((stage, index) => {
          const state = stageState(stage.id, index);
          return (
            <li key={stage.id} className={`arena-stage arena-stage-${state}`} aria-current={state === "active" ? "step" : undefined}>
              <span className="arena-stage-marker" aria-hidden="true" />
              <div>
                <div className="row-between arena-stage-title">
                  <strong>{stage.label}</strong>
                  <span className="meta">{visualLabel(state)}</span>
                </div>
                <p className="muted small mb-0">{stage.description}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="arena-dimension-progress" aria-label="八个评分维度的进度">
        <div className="row-between">
          <h3>评分维度</h3>
          <span className="meta">{completedDimensions.size} / {dimensions.length}</span>
        </div>
        <ul>
          {dimensions.map((dimension, index) => {
            const isCompleted = run.status === "completed" || completedDimensions.has(dimension.name);
            const isActive = !isCompleted && activeDimension === dimension.name && !stopped;
            const state = isCompleted ? "completed" : isActive ? "active" : stopped ? "stopped" : "pending";
            return (
              <li key={dimension.name} className={`arena-dimension-state arena-dimension-${state}`}>
                <span className="num">{String(index + 1).padStart(2, "0")}</span>
                <span>{dimension.name}</span>
                <span className="meta">{isCompleted ? "完成" : isActive ? "评分中" : stopped ? "未完成" : "等待"}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
