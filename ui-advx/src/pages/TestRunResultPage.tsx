import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type TestRunResult } from "../api";
import { TopNav } from "../components/TopNav";
import { PageFoot } from "../components/PageFoot";
import { useFeedback } from "../components/Feedback";

export function TestRunResultPage() {
  const { runId } = useParams();
  const nav = useNavigate();
  const { toast, confirm } = useFeedback();
  const [run, setRun] = useState<TestRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  async function load() {
    if (!runId) return;
    try {
      setRun(await api.getTestRun(runId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [runId]);

  async function seal() {
    const v = await confirm({
      title: "封存当前版本",
      body: "把这次试跑对应的队伍配置保存为只读快照。",
      input: true,
      inputPlaceholder: "给这个版本起个名字，例如 v1.5",
      okText: "封存",
    });
    if (typeof v !== "string" || !v) {
      if (v === "") toast("请给版本起个名字");
      return;
    }
    try {
      const teams = await api.listTeams();
      if (!teams[0]) return;
      await api.createVersion(teams[0].id, { label: v });
      toast("已封存 " + v);
      setTimeout(() => nav("/versions"), 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "封存失败");
    }
  }

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (error) {
    return (
      <>
        <TopNav active="studio" />
        <main className="container" style={{ paddingBlock: 32 }}>
          <div className="notice">
            <b>{error}</b>
          </div>
        </main>
      </>
    );
  }

  if (!run) {
    return (
      <>
        <TopNav active="studio" />
        <main className="container" style={{ paddingBlock: 32 }}>
          <p className="muted">加载中…</p>
        </main>
      </>
    );
  }

  const statusLabel = run.status === "done" || run.status === "completed" ? "已完成" : run.status;

  return (
    <>
      <TopNav active="studio" />
      <main className="container" style={{ paddingBlock: 32 }}>
        <div className="row-between">
          <Link className="btn btn-ghost btn-sm" to="/test-run">
            ← 再选任务
          </Link>
          <span className="pill">{statusLabel}</span>
        </div>

        <section style={{ marginTop: 20 }}>
          <h1 className="h2">试跑结果</h1>
        </section>

        <div className="grid-2-1" style={{ marginTop: 28 }}>
          <section>
            <h3 className="h3" style={{ marginBottom: 8 }}>
              活动记录
            </h3>
            <p className="meta" style={{ marginBottom: 8 }}>
              按时间倒序 · 点击展开详情
            </p>
            <div>
              {run.activity.length === 0 ? (
                <div className="empty">还没有活动记录</div>
              ) : (
                run.activity.map((a, index) => {
                  const entryKey = `${a.createdAt}:${a.action}:${a.entityType}:${index}`;
                  const open = openIds.has(entryKey);
                  return (
                    <div
                      key={entryKey}
                      className={`tl-item clickable ${open ? "is-open" : ""}`}
                      onClick={() => toggle(entryKey)}
                    >
                      <span className="meta">{new Date(a.createdAt).toLocaleTimeString()}</span>
                      <div>
                        <div className="row" style={{ gap: 8 }}>
                          <strong>{a.action}</strong>
                          <span className="tag">{a.entityType}</span>
                        </div>
                        <div className="tl-detail">{a.entityType}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <aside>
            <div className="card stack">
              <div className="row-between">
                <h3>产物</h3>
                <span className="tag">{run.products.length} 个</span>
              </div>
              {run.products.length === 0 ? (
                <div className="ph-block">暂无产物</div>
              ) : (
                run.products.map((p, index) => (
                  <div key={`${p.title}:${p.type}:${index}`} className="ph-block" style={{ minHeight: "auto", padding: 16, display: "block" }}>
                    <strong>{p.title}</strong>
                    <p className="meta" style={{ marginTop: 4 }}>
                      {p.type}
                    </p>
                    {p.summary && (
                      <p className="small" style={{ marginTop: 8 }}>
                        {p.summary}
                      </p>
                    )}
                  </div>
                ))
              )}
              {run.resultSummary && (
                <div className="ph-block" style={{ minHeight: "auto", padding: 16, display: "block" }}>
                  <p className="meta mb-0">结果摘要</p>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      font: "inherit",
                      fontSize: 13,
                      color: "var(--fg)",
                      margin: "8px 0 0",
                    }}
                  >
                    {run.resultSummary}
                  </pre>
                </div>
              )}
              <button className="btn btn-secondary" onClick={() => toast("已开始下载（mock）")}>
                下载产物
              </button>
            </div>
          </aside>
        </div>

        <section className="section">
          <div className="card row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={seal}>
              封存当前版本
            </button>
            <Link className="btn btn-secondary" to="/studio">
              回到组队室继续改
            </Link>
            <Link className="btn btn-ghost" to="/test-run">
              再试跑一次 →
            </Link>
          </div>
        </section>
      </main>
      <PageFoot />
    </>
  );
}
