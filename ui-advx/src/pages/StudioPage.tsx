import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Team, type Member, type RoleTemplate, type Tool, type TestTask } from "../api";
import { TopNav } from "../components/TopNav";
import { PageFoot } from "../components/PageFoot";
import { useFeedback } from "../components/Feedback";

const ROLE_ICON: Record<string, string> = {
  scout: "SC",
  inventor: "IN",
  builder: "BU",
  critic: "CR",
  custom: "CU",
};
const ROLE_ORDER = ["scout", "inventor", "builder", "critic"] as const;

function roleOrder(member: Member) {
  const index = ROLE_ORDER.indexOf(member.roleTemplate as (typeof ROLE_ORDER)[number]);
  return index === -1 ? ROLE_ORDER.length : index;
}

export function StudioPage() {
  const nav = useNavigate();
  const { toast, confirm } = useFeedback();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [tasks, setTasks] = useState<TestTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const coreMembers = members
    .filter((member) => member.roleTemplate !== null)
    .sort((left, right) => roleOrder(left) - roleOrder(right));
  const systemMembers = members.filter((member) => member.roleTemplate === null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tList, tpls, tls, tks] = await Promise.all([api.listTeams(), api.roleTemplates(), api.tools(), api.testTasks()]);
      setTemplates(tpls);
      setTools(tls);
      setTasks(tks);
      const myTeam = tList[0] ?? null;
      setTeam(myTeam);
      if (myTeam) setMembers(await api.listMembers(myTeam.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function ensureTeam() {
    setError(null);
    try {
      const t = await api.createTeam({ name: "我的 AI 队伍" });
      setTeam(t);
      setMembers([]);
      toast("队伍已创建");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    }
  }

  async function editName() {
    if (!team) return;
    const v = await confirm({
      title: "修改队伍名",
      input: true,
      inputValue: team.name,
      okText: "保存",
    });
    if (typeof v !== "string" || !v) return;
    try {
      const t = await api.updateTeam(team.id, { name: v });
      setTeam(t);
      toast("队伍名已更新");
    } catch (e) {
      setError(e instanceof Error ? e.message : "改名失败");
    }
  }

  async function editDesc() {
    if (!team) return;
    const v = await confirm({
      title: "修改队伍简介",
      input: true,
      inputValue: team.description ?? "",
      okText: "保存",
    });
    if (typeof v !== "string" || !v) return;
    try {
      const t = await api.updateTeam(team.id, { description: v });
      setTeam(t);
      toast("简介已更新");
    } catch (e) {
      setError(e instanceof Error ? e.message : "改简介失败");
    }
  }

  async function sealVersion() {
    if (!team) return;
    const v = await confirm({
      title: "封存当前版本",
      body: "封存后当前队伍配置会保存为只读快照，可继续在草稿上修改。",
      input: true,
      inputPlaceholder: "给这个版本起个名字，例如 v1.5",
      okText: "封存",
    });
    if (typeof v !== "string" || !v) {
      if (v === "") toast("请给版本起个名字");
      return;
    }
    try {
      await api.createVersion(team.id, { label: v });
      const t = await api.getMyTeam();
      setTeam(t);
      toast("已封存 " + v);
      setTimeout(() => nav("/versions"), 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "封存失败");
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
      <main className="container" style={{ paddingBlock: 32 }}>
        {error && (
          <div className="notice" style={{ marginBottom: 16 }}>
            <b>{error}</b>
          </div>
        )}

        {!team ? (
          <div className="empty">
            <p className="muted mb-0">你还没有队伍，先创建一支吧。</p>
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={ensureTeam}>
                创建我的队伍
              </button>
            </div>
          </div>
        ) : (
          <>
            <section>
              <div className="card">
                <div className="row-between studio-team-summary" style={{ alignItems: "flex-start" }}>
                  <div className="studio-team-copy">
                    <div className="row studio-team-title" style={{ gap: 10 }}>
                      <h2 className="h3">{team.name}</h2>
                      <button className="btn btn-ghost btn-sm" onClick={editName}>
                        编辑
                      </button>
                    </div>
                    <div className="row studio-team-description" style={{ gap: 10, marginTop: 6 }}>
                      <p className="muted small mb-0">{team.description ?? "（无简介）"}</p>
                      <button className="btn btn-ghost btn-sm" onClick={editDesc}>
                        编辑
                      </button>
                    </div>
                  </div>
                  <div className="row studio-team-actions" style={{ gap: 32, textAlign: "right" }}>
                    <div>
                      <p className="meta mb-0">版本数</p>
                      <Link className="num" to="/versions" style={{ color: "var(--accent-2)" }}>
                        {team.versionCount} 个
                      </Link>
                    </div>
                    <button className="btn btn-secondary" onClick={sealVersion}>
                      封存当前版本
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="section" style={{ paddingBottom: 0 }}>
              <div className="section-title-row">
                <h3 className="h3">
                  核心队员 <span className="meta">{coreMembers.length} 人</span>
                </h3>
                <span className="meta">队伍容量 {members.length} / 8 · 点击卡片进编辑</span>
              </div>
              <div className="grid-4">
                {coreMembers.map((m) => {
                  const icon = ROLE_ICON[m.roleTemplate ?? "custom"] ?? "AG";
                  const tpl = templates.find((t) => t.slug === m.roleTemplate);
                  const roleLabel = tpl?.name ?? m.title ?? "自定义";
                  return (
                    <Link
                      key={m.id}
                      className="card card-hover card-link"
                      to={`/members/${m.id}`}
                    >
                      <div className="row" style={{ gap: 10 }}>
                        <span className="avatar">{icon}</span>
                        <div>
                          <h3 style={{ fontSize: 16 }}>{m.name}</h3>
                          <span className="pill">{roleLabel}</span>
                        </div>
                      </div>
                      <div className="row" style={{ marginTop: 14, gap: 14 }}>
                        <span className="meta">工具 {m.tools.length}</span>
                        <span className="meta">Skill {m.skills.length}</span>
                      </div>
                      <p className="meta" style={{ marginTop: 8 }}>
                        状态 · {m.status}
                      </p>
                    </Link>
                  );
                })}
                <Link
                  className="card card-hover card-link"
                  to="/members/new"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    minHeight: 160,
                    borderStyle: "dashed",
                    textAlign: "center",
                  }}
                >
                  <div>
                    <p style={{ fontSize: 24, margin: 0, color: "var(--muted)" }}>＋</p>
                    <p className="muted small" style={{ marginTop: 6 }}>
                      加队员
                    </p>
                  </div>
                </Link>
              </div>
              {systemMembers.length > 0 && (
                <div className="studio-system-members" aria-label="系统辅助角色">
                  <div>
                    <p className="eyebrow mb-0">System support</p>
                    <strong>系统辅助</strong>
                  </div>
                  <div className="studio-system-list">
                    {systemMembers.map((member) => (
                      <span className="studio-system-member" key={member.id}>
                        <span className="avatar sm">SY</span>
                        <span>
                          <strong>{member.name}</strong>
                          <small>后台辅助 · {member.status}</small>
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="section">
              <div className="card row-between" style={{ flexWrap: "wrap" }}>
                <div>
                  <h3>试试队伍现在的协作手感</h3>
                  <p className="muted small mb-0">跑一次预置任务，看每个队员的动作时间流和最终产物。</p>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <Link className="btn btn-primary" to="/test-run">
                    试跑一次
                  </Link>
                  <Link className="btn btn-ghost" to="/activity">
                    查看活动记录 →
                  </Link>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
      <PageFoot />
    </>
  );
}
