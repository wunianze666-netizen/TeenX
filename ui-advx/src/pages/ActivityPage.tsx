import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ActivityEntry } from "../api";
import { TopNav } from "../components/TopNav";
import { PageFoot } from "../components/PageFoot";
import { Seg } from "../components/Seg";

const PAGE = 10;

const TYPE_OPTIONS = [
  { value: "全部", label: "全部" },
  { value: "create", label: "创建" },
  { value: "update", label: "更新" },
  { value: "delete", label: "删除" },
  { value: "start", label: "启动" },
  { value: "complete", label: "完成" },
];

function actionLabel(a: ActivityEntry): string {
  return a.action;
}

export function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fType, setFType] = useState<string>("全部");
  const [shown, setShown] = useState(PAGE);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const teams = await api.listTeams();
        if (!teams[0]) return;
        setEntries(await api.listActivity(teams[0].id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = entries.filter((a) => fType === "全部" || a.action === fType);
  const slice = filtered.slice(0, shown);

  if (loading) {
    return (
      <>
        <TopNav active="studio" />
        <main className="container" style={{ paddingBlock: 32 }}>
          <p className="muted">加载中…</p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav active="studio" />
      <main className="container" style={{ paddingBlock: 32 }}>
        <div className="row-between">
          <Link className="btn btn-ghost btn-sm" to="/studio">
            ← 返回组队室
          </Link>
          <span className="meta">全队活动时间流</span>
        </div>

        {error && (
          <div className="notice" style={{ marginTop: 16 }}>
            <b>{error}</b>
          </div>
        )}

        <section style={{ marginTop: 24 }}>
          <h1 className="h2">活动记录</h1>

          <div className="row" style={{ marginTop: 14 }}>
            <Seg
              label="按活动类型筛选"
              options={TYPE_OPTIONS}
              value={fType}
              onChange={(v) => {
                setFType(v);
                setShown(PAGE);
              }}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            {slice.length === 0 ? (
              <div className="empty">没有符合条件的记录</div>
            ) : (
              slice.map((a, index) => {
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
                        <strong>{a.entityType}</strong>
                        <span className="tag">{actionLabel(a)}</span>
                      </div>
                      <div className="tl-detail">{a.entityType}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {shown < filtered.length && (
            <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={() => setShown((s) => s + PAGE)}>
                加载更多
              </button>
            </div>
          )}
        </section>
      </main>
      <PageFoot />
    </>
  );
}
