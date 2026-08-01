import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type VersionSnapshot } from "../api";
import { TopNav } from "../components/TopNav";
import { PageFoot } from "../components/PageFoot";
import { useFeedback } from "../components/Feedback";

export function VersionsPage() {
  const { toast } = useFeedback();
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const teams = await api.listTeams();
        if (!teams[0]) return;
        setVersions(await api.listVersions(teams[0].id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function branch(v: VersionSnapshot) {
    toast("已基于 " + (v.label ?? "v" + v.versionNumber) + " 创建草稿（mock 提示）");
  }

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
          <span className="meta">版本历史 · 按时间倒序</span>
        </div>

        {error && (
          <div className="notice" style={{ marginTop: 16 }}>
            <b>{error}</b>
          </div>
        )}

        <section style={{ marginTop: 24 }}>
          <h1 className="h2">版本历史</h1>
          <p className="lead" style={{ marginTop: 8 }}>
            每次封存都会留下只读快照。可以把任意旧版本设回当前版本，或基于它开新草稿。
          </p>
          <div className="stack" style={{ marginTop: 24, gap: 12 }}>
            {versions.length === 0 ? (
              <div className="empty">还没有封存过版本。</div>
            ) : (
              versions.map((v, i) => {
                const open = openIdx === i;
                const isCurrent = i === 0;
                return (
                  <div key={v.id} className="card">
                    <div
                      className="row-between clickable"
                      onClick={() => setOpenIdx(open ? null : i)}
                    >
                      <div className="row" style={{ gap: 12 }}>
                        <strong className="num" style={{ fontSize: 17 }}>
                          {v.label ?? "v" + v.versionNumber}
                        </strong>
                        {isCurrent && <span className="pill">当前版本</span>}
                      </div>
                      <span className="meta">
                        {new Date(v.createdAt).toLocaleString()} · {v.snapshot.members.length} 名队员
                      </span>
                    </div>
                    {open && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                        <p className="muted small mt-0">队伍快照（只读）</p>
                        <p className="small">
                          {v.snapshot.members.map((m) => `${m.name}（${m.roleTemplate ?? "自定义"}）`).join(" / ")}
                        </p>
                        <div className="row" style={{ gap: 10, marginTop: 12 }}>
                          {!isCurrent && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => toast("设为当前版本（mock 提示）")}
                            >
                              设为当前版本
                            </button>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => branch(v)}>
                            基于此版本创建新分支
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
      <PageFoot />
    </>
  );
}
