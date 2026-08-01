import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type RoleTemplate } from "../api";
import { TopNav } from "../components/TopNav";
import { PageFoot } from "../components/PageFoot";
import { useFeedback } from "../components/Feedback";

const PLACEHOLDER: Record<string, string> = {
  scout: "小雷达",
  inventor: "主意王",
  builder: "建造师",
  critic: "挑挑",
  custom: "新队员",
};

export function AddMemberPage() {
  const nav = useNavigate();
  const { toast, confirm } = useFeedback();
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [count, setCount] = useState(0);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [tList, tpls] = await Promise.all([api.listTeams(), api.roleTemplates()]);
        setTemplates(tpls);
        const myTeam = tList[0];
        if (myTeam) {
          setTeamId(myTeam.id);
          const ms = await api.listMembers(myTeam.id);
          setCount(ms.length);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const full = count >= 8;

  async function pick(slug: string) {
    if (!teamId || full) return;
    const tpl = templates.find((t) => t.slug === slug);
    const label = tpl?.name ?? "自定义";
    const v = await confirm({
      title: `用「${label}」模板创建队员`,
      body: slug === "custom" ? "创建后到队员详情里写职责、配工具。" : "会带上模板默认职责与默认工具，之后都能改。",
      input: true,
      inputPlaceholder: "给队员起个名字，例如 " + (PLACEHOLDER[slug] ?? "新队员"),
      okText: "使用此模板创建",
    });
    if (typeof v !== "string" || !v) {
      if (v === "") toast("先起个名字");
      return;
    }
    try {
      await api.addMember(teamId, { name: v, roleTemplate: slug });
      toast(v + " 已加入队伍");
      setTimeout(() => nav("/studio"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加队员失败");
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
        <div className="row-between">
          <Link className="btn btn-ghost btn-sm" to="/studio">
            ← 返回组队室
          </Link>
          <span className="meta">
            当前 {count} / 8 人
          </span>
        </div>

        {error && (
          <div className="notice" style={{ marginTop: 16 }}>
            <b>{error}</b>
          </div>
        )}

        <section style={{ marginTop: 24 }}>
          <h1 className="h2">选一名新队员</h1>
          <p className="lead" style={{ marginTop: 8 }}>
            四个角色模板各有所长，也可以从零自定义。选中后起个名字就能上岗。
          </p>

          {full && (
            <div className="notice" style={{ marginTop: 24 }}>
              <b>队伍已满（上限 8 人）</b>
              <span>先回到组队室调整现有阵容。</span>
            </div>
          )}

          <div
            className="grid-3"
            style={{ marginTop: 28, opacity: full ? 0.4 : 1, pointerEvents: full ? "none" : "auto" }}
          >
            {templates.map((t) => (
              <div
                key={t.slug}
                className="card card-hover clickable"
                onClick={() => pick(t.slug)}
              >
                <div className="row-between">
                  <h3>{t.name}</h3>
                  <span className="pill pill-dim">{t.icon}</span>
                </div>
                <p className="muted small">{t.description}</p>
                <p className="meta">默认工具：{t.defaultTools.join("、") || "无"}</p>
              </div>
            ))}
            <div
              className="card card-hover clickable"
              style={{ borderStyle: "dashed" }}
              onClick={() => pick("custom")}
            >
              <div className="row-between">
                <h3>自定义角色</h3>
                <span className="pill pill-dim">Custom</span>
              </div>
              <p className="muted small">从零写职责、配工具。</p>
              <p className="meta">默认工具：无</p>
            </div>
          </div>
        </section>
      </main>
      <PageFoot />
    </>
  );
}
