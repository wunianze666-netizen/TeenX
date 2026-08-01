import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Member, type TestTask } from "../api";
import { TopNav } from "../components/TopNav";
import { PageFoot } from "../components/PageFoot";
import { useFeedback } from "../components/Feedback";

const ROLE_ORDER = ["scout", "inventor", "builder", "critic"] as const;

function roleOrder(member: Member) {
  const index = ROLE_ORDER.indexOf(member.roleTemplate as (typeof ROLE_ORDER)[number]);
  return index === -1 ? ROLE_ORDER.length : index;
}

export function TestRunLaunchPage() {
  const nav = useNavigate();
  const { toast } = useFeedback();
  const [tasks, setTasks] = useState<TestTask[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [picked, setPicked] = useState<TestTask | null>(null);
  const [launching, setLaunching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const participatingMembers = members
    .filter((member) => member.roleTemplate !== null)
    .sort((left, right) => roleOrder(left) - roleOrder(right));

  useEffect(() => {
    (async () => {
      try {
        const [tList, tks] = await Promise.all([api.listTeams(), api.testTasks()]);
        setTasks(tks);
        const myTeam = tList[0];
        if (myTeam) {
          setTeamId(myTeam.id);
          setMembers(await api.listMembers(myTeam.id));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function launch() {
    if (!teamId || !picked) return;
    setLaunching(true);
    try {
      const r = await api.startTestRun(teamId, picked.slug);
      if (r.runId) {
        nav(`/test-run/${r.runId}`);
      } else {
        toast("试跑已排队，但暂未产生 run（可能 agent 不可执行）");
        setLaunching(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "试跑失败");
      setLaunching(false);
    }
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
      <main className="container" style={{ paddingBlock: 32, maxWidth: 760 }}>
        <div className="row-between">
          <Link className="btn btn-ghost btn-sm" to="/studio">
            ← 返回组队室
          </Link>
          <span className="meta">试跑 · 不上赛题、不计分</span>
        </div>

        {error && (
          <div className="notice" style={{ marginTop: 16 }}>
            <b>{error}</b>
          </div>
        )}

        {!picked && (
          <section style={{ marginTop: 24 }}>
            <h1 className="h2">选一个预置任务</h1>
            <p className="lead" style={{ marginTop: 8 }}>
              用当前队伍配置跑一遍，观察每个队员的动作和协作顺序。
            </p>
            <div className="stack" style={{ marginTop: 24, gap: 12 }}>
              {tasks.map((t) => (
                <div key={t.slug} className="card row-between card-hover">
                  <div>
                    <h3 style={{ fontSize: 17 }}>{t.title}</h3>
                    <p className="muted small mb-0">{t.description}</p>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setPicked(t)}>
                    开始试跑
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {picked && !launching && (
          <section style={{ marginTop: 24 }}>
            <h1 className="h2">队伍即将执行此任务</h1>
            <div className="card" style={{ marginTop: 20 }}>
              <div className="row-between">
                <span className="muted small">任务</span>
                <strong>{picked.title} — {picked.description}</strong>
              </div>
              <hr style={{ marginBlock: 14, borderColor: "var(--border)" }} />
              <p className="muted small mt-0">当前队伍成员（只读）</p>
              <div className="stack" style={{ gap: 10, marginTop: 10 }}>
                {participatingMembers.map((m) => (
                  <div key={m.id} className="row" style={{ gap: 10 }}>
                    <span className="avatar sm">{m.name[0]}</span>
                    <span>{m.name}</span>
                    <span className="pill">{m.roleTemplate ?? "自定义"}</span>
                    <span className="meta">
                      工具 {m.tools.length} · Skill {m.skills.length}
                    </span>
                  </div>
                ))}
              </div>
              {members.length > participatingMembers.length && (
                <p className="notice test-run-system-note mb-0">
                  另有 {members.length - participatingMembers.length} 位系统辅助角色保持后台待命。
                </p>
              )}
            </div>
            <div className="row" style={{ marginTop: 24, gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setPicked(null)}>
                换个任务
              </button>
              <button className="btn btn-primary" onClick={launch}>
                启动
              </button>
            </div>
          </section>
        )}

        {launching && (
          <section style={{ marginTop: 24, textAlign: "center", paddingBlock: 80 }}>
            <p className="eyebrow" style={{ marginBottom: 16 }}>
              RUNNING
            </p>
            <h2 className="h3">队伍正在协作…</h2>
            <p className="muted small" style={{ marginTop: 8 }}>
              正在排队等待执行
            </p>
            <div className="progress-track" style={{ maxWidth: 320, margin: "24px auto 0" }}>
              <div className="progress-bar" style={{ width: "30%" }} />
            </div>
          </section>
        )}
      </main>
      <PageFoot />
    </>
  );
}
