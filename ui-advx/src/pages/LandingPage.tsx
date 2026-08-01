import { useEffect, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, UsersRound } from "lucide-react";
import { LandingHeroBackground } from "../components/LandingHeroBackground";
import { LandingNav } from "../components/LandingNav";
import { PageFoot } from "../components/PageFoot";

function LandingAction({ children, to, tone = "ink" }: { children: ReactNode; to: string; tone?: "accent" | "ink" }) {
  return (
    <Link className={`landing-action landing-action-${tone}`} to={to} aria-label={String(children)}>
      <span className="landing-roll" aria-hidden="true">
        <span className="landing-roll-track">
          <span>{children}</span>
          <span>{children}</span>
        </span>
      </span>
      <span className="landing-action-arrow" aria-hidden="true"><ArrowRight /></span>
    </Link>
  );
}

function SectionMarker({ number, children }: { number: string; children: ReactNode }) {
  return (
    <div className="landing-section-marker">
      <span>{number}</span>
      <strong>{children}</strong>
    </div>
  );
}

function scrollToGrowth(event: MouseEvent<HTMLAnchorElement>) {
  const section = document.getElementById("how-it-works");
  if (!section) return;
  event.preventDefault();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  window.history.replaceState(null, "", "#how-it-works");
}

const STEPS = [
  {
    number: "01",
    title: "定义队伍",
    body: "从侦察员、点子员、搭建员、挑刺员开始，给角色起名、写职责、选择工具和协作关系。",
    note: "角色 · 职责 · 工具 · 协作",
  },
  {
    number: "02",
    title: "发起试跑",
    body: "给队伍一个小任务，看看每个队员查了什么、想了什么、做了什么，以及最后交出了什么。",
    note: "小任务 · 活动记录 · 产物",
  },
  {
    number: "03",
    title: "复盘迭代",
    body: "根据活动记录调整队伍，满意后封存版本，留下可以回看、比较和继续成长的轨迹。",
    note: "调整 · 封存 · 继续成长",
  },
];

export function LandingPage() {
  useEffect(() => {
    document.body.classList.add("landing-active");
    return () => document.body.classList.remove("landing-active", "landing-menu-open");
  }, []);

  return (
    <div className="landing-page">
      <main>
        <section className="landing-hero">
          <LandingHeroBackground />
          <LandingNav />
          <div className="landing-shell landing-hero-content">
            <p className="landing-kicker">TeenX · 少年 AI 队伍养成</p>
            <h1>
              <span className="landing-hero-line">别人给孩子一个 AI 工具，</span>
              <span className="landing-hero-line">我们给孩子一支 AI 队伍，</span>
              <span className="landing-hero-line">以及成为队长的责任。</span>
            </h1>
            <div className="landing-hero-lower">
              <p>不写代码，也能定义角色、安排协作、发起试跑，并看见<span className="landing-keep-together">每个队员</span>怎样把任务做出来。</p>
              <div className="landing-hero-actions">
                <LandingAction to="/studio" tone="accent">开始建队</LandingAction>
                <a className="landing-role-badge" href="#how-it-works" onClick={scrollToGrowth}>
                  <UsersRound aria-hidden="true" />
                  <span>四角色起步 · 随时迭代</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="why-teenx" className="landing-why">
          <div className="landing-shell landing-section-inner">
            <SectionMarker number="01">从使用者到队长</SectionMarker>
            <h2>不是问 AI 要一个答案，<br />而是带一支队伍把事情做出来。</h2>

            <div className="landing-story-grid">
              <figure className="landing-media landing-media-small">
                <img
                  src="/landing/team-detail.webp"
                  width="249"
                  height="172"
                  loading="lazy"
                  alt="TeenX 侦察员小雷达的队员卡片，展示角色、工具和状态"
                />
                <figcaption>每个队员，都有清楚的角色与能力边界。</figcaption>
              </figure>

              <div className="landing-story-copy">
                <p>在 TeenX，少年决定队伍里有哪些角色、每个队员负责什么、能使用哪些工具，以及它们如何协作。每次修改都可以马上试跑、查看过程，再继续调整。</p>
                <LandingAction to="/studio">看看组队室</LandingAction>
              </div>

              <figure className="landing-media landing-media-large">
                <img
                  src="/landing/studio-overview.webp"
                  width="1120"
                  height="852"
                  loading="lazy"
                  alt="TeenX Studio 队伍概览，展示队员卡片、版本和试跑入口"
                />
                <figcaption>真实组队室：看见角色、版本和下一次试跑。</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="landing-growth">
          <div className="landing-shell landing-section-inner">
            <SectionMarker number="02">队伍如何成长</SectionMarker>
            <div className="landing-growth-heading">
              <h2>组队、试跑、复盘，<br />再迭代。</h2>
              <p>让每一次调整都有反馈，让“我的队伍在变强”真正看得见。</p>
            </div>

            <div className="landing-step-grid">
              {STEPS.map((step) => (
                <article key={step.number} className="landing-step">
                  <span className="landing-step-number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <small>{step.note}</small>
                </article>
              ))}
            </div>

            <div className="landing-final-cta">
              <h2>带上你的第一支 AI 队伍。</h2>
              <LandingAction to="/studio" tone="accent">进入 TeenX Studio</LandingAction>
            </div>
          </div>
        </section>
      </main>
      <PageFoot variant="landing" />
    </div>
  );
}
