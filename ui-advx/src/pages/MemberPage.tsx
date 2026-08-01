import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Member, type RoleTemplate, type Tool } from "../api";
import { TopNav } from "../components/TopNav";
import { PageFoot } from "../components/PageFoot";
import { useFeedback } from "../components/Feedback";

const DUTY_DEFAULT: Record<string, string> = {
  scout: "查清事实、找约束。开题后先跑一遍搜索，把关键资料和限制条件整理成清单交给全队。",
  inventor: "出主意、想方案。拿到侦察资料后产出至少 3 个不同方向的点子，并写明每个点子的风险。",
  builder: "把方案做出来。根据定稿方案产出可运行的小工具或文稿，并把过程写进说明文档。",
  critic: "挑毛病、质检。检查产出是否符合赛题要求，跑测试、找漏洞，给出修改清单。",
  custom: "",
};

const ALL_SKILLS = ["事实核查", "资料摘要", "头脑风暴", "快速原型", "写文档", "质检清单", "数据读图", "翻译润色"];

export function MemberPage() {
  const { memberId } = useParams();
  const nav = useNavigate();
  const { toast, confirm } = useFeedback();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("custom");
  const [duty, setDuty] = useState("");
  const [reportsTo, setReportsTo] = useState<string>("");
  const [delegateTo, setDelegateTo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [tList, tpls, tls] = await Promise.all([api.listTeams(), api.roleTemplates(), api.tools()]);
        setTemplates(tpls);
        setTools(tls);
        const myTeam = tList[0];
        if (!myTeam) {
          setError("还没有队伍");
          setLoading(false);
          return;
        }
        setTeamId(myTeam.id);
        const all = await api.listMembers(myTeam.id);
        setMembers(all);
        const m = all.find((x) => x.id === memberId) ?? null;
        if (!m) {
          setError("队员不存在");
          setLoading(false);
          return;
        }
        setMember(m);
        setName(m.name);
        setRole(m.roleTemplate ?? "custom");
        setDuty(m.responsibilities ?? "");
        setReportsTo(m.collaboration.reportsTo ?? "");
        setDelegateTo(m.collaboration.canDelegateTo[0] ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId]);

  function roleName(slug: string | null): string {
    if (!slug) return "自定义";
    return templates.find((t) => t.slug === slug)?.name ?? slug;
  }

  async function save() {
    if (!teamId || !member) return;
    try {
      const updated = await api.updateMember(teamId, member.id, {
        name: name.trim() || member.name,
        roleTemplate: role,
        responsibilities: duty.trim(),
        skills: member.skills,
        reportsTo: reportsTo || null,
        canDelegateTo: delegateTo ? [delegateTo] : [],
      });
      setMember(updated);
      toast("已保存");
      setTimeout(() => nav("/studio"), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function removeSkill(idx: number) {
    if (!teamId || !member) return;
    const next = member.skills.filter((_, i) => i !== idx);
    try {
      const updated = await api.updateMember(teamId, member.id, { skills: next });
      setMember(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "移除 Skill 失败");
    }
  }

  async function addSkill() {
    if (!teamId || !member) return;
    const rest = ALL_SKILLS.filter((s) => !member.skills.includes(s));
    if (!rest.length) {
      toast("可选 Skill 已全部挂上");
      return;
    }
    const v = await confirm({
      title: "添加 Skill",
      body: "可选：" + rest.join("、"),
      input: true,
      inputPlaceholder: "输入一个 Skill 名",
      okText: "添加",
    });
    if (typeof v !== "string" || !v) return;
    try {
      const updated = await api.updateMember(teamId, member.id, { skills: [...member.skills, v] });
      setMember(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加 Skill 失败");
    }
  }

  async function del() {
    if (!teamId || !member) return;
    if (members.length <= 1) {
      toast("队伍至少保留 1 人");
      return;
    }
    const ok = await confirm({
      title: "删除此队员？",
      body: "删除后历史版本不受影响（快照只读）。此操作立即生效。",
      okText: "确认删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteMember(teamId, member.id);
      toast("已删除 " + member.name);
      setTimeout(() => nav("/studio"), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
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
          <span className="meta">队员详情 / 编辑</span>
        </div>

        {error && (
          <div className="notice" style={{ marginTop: 16 }}>
            <b>{error}</b>
          </div>
        )}

        {member && (
          <section className="stack" style={{ marginTop: 24 }}>
            <div className="card stack">
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="f-name">队员名</label>
                  <input
                    id="f-name"
                    className="input"
                    maxLength={16}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="f-role">角色模板</label>
                  <select
                    id="f-role"
                    className="select"
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      if (!duty) setDuty(DUTY_DEFAULT[e.target.value] ?? "");
                    }}
                  >
                    {templates.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                    <option value="custom">自定义</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="f-duty">职责描述</label>
                <textarea
                  id="f-duty"
                  className="textarea"
                  rows={4}
                  value={duty}
                  onChange={(e) => setDuty(e.target.value)}
                />
                <span className="meta">模板角色有默认职责，改后会随版本封存。</span>
              </div>

              <div className="field">
                <div className="row-between">
                  <label>工具清单</label>
                  <span className="meta">在工具库页管理（mock 提示）</span>
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  {member.tools.length ? (
                    member.tools.map((tid) => {
                      const t = tools.find((x) => x.id === tid);
                      return (
                        <span className="tag" key={tid}>
                          {t?.name ?? tid}
                        </span>
                      );
                    })
                  ) : (
                    <span className="meta">还没有挂工具</span>
                  )}
                </div>
              </div>

              <div className="field">
                <div className="row-between">
                  <label>Skill 清单</label>
                  <button className="btn btn-secondary btn-sm" onClick={addSkill}>
                    添加 Skill
                  </button>
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  {member.skills.length ? (
                    member.skills.map((s, i) => (
                      <span
                        key={s + i}
                        className="tag tag-x"
                        title="点击移除"
                        onClick={() => removeSkill(i)}
                      >
                        {s} ✕
                      </span>
                    ))
                  ) : (
                    <span className="meta">还没有 Skill</span>
                  )}
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label htmlFor="f-report">向谁汇报</label>
                  <select
                    id="f-report"
                    className="select"
                    value={reportsTo}
                    onChange={(e) => setReportsTo(e.target.value)}
                  >
                    <option value="">（无）</option>
                    {members
                      .filter((x) => x.id !== member.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}（{roleName(x.roleTemplate)}）
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f-delegate">能委托给谁</label>
                  <select
                    id="f-delegate"
                    className="select"
                    value={delegateTo}
                    onChange={(e) => setDelegateTo(e.target.value)}
                  >
                    <option value="">（无）</option>
                    {members
                      .filter((x) => x.id !== member.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}（{roleName(x.roleTemplate)}）
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="row-between">
              <button
                className={`btn btn-ghost ${members.length <= 1 ? "is-disabled" : ""}`}
                onClick={del}
                style={{ color: "var(--muted)" }}
              >
                删除此队员{members.length <= 1 ? "（队伍至少保留 1 人）" : ""}
              </button>
              <div className="row" style={{ gap: 10 }}>
                <Link className="btn btn-secondary" to="/studio">
                  取消
                </Link>
                <button className="btn btn-primary" onClick={save}>
                  保存
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
      <PageFoot />
    </>
  );
}
