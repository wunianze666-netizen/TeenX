import { Link, useLocation } from "react-router-dom";
import { useCaptain } from "./Captain";
import { useFeedback } from "./Feedback";
import { TeenXLogo } from "./TeenXLogo";

type NavItem =
  | {
      readonly id: string;
      readonly label: string;
      readonly to: string;
      readonly comingSoon?: false;
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly comingSoon: true;
      readonly to?: never;
    };

const NAV: readonly NavItem[] = [
  { id: "studio", label: "Studio", to: "/studio" },
  { id: "contest", label: "赛题", to: "/arena" },
  { id: "board", label: "排行榜", to: "/leaderboard" },
  { id: "forum", label: "论坛", to: "/forum" },
  { id: "me", label: "我的", to: "/me" },
];

export function TopNav({ active }: { active: string }) {
  const loc = useLocation();
  const { toast } = useFeedback();
  const { summary, loading } = useCaptain();
  const nickname = summary?.profile.nickname ?? (loading ? "加载中" : "小创");
  const identityLabel = summary?.profile.authMode === "signed_in" ? "已登录" : "本地演示";
  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <Link className="logo" to="/studio" aria-label="TeenX Studio">
          <TeenXLogo alt="" />
        </Link>
        <nav aria-label="主导航">
          {NAV.map((n) => {
            const routeActive = !n.comingSoon && (loc.pathname === n.to || loc.pathname.startsWith(`${n.to}/`));
            const cls = n.id === active || routeActive ? "is-active" : "";
            if (n.comingSoon) {
              return (
                <button
                  type="button"
                  key={n.id}
                  className={`topnav-coming-soon ${cls}`}
                  onClick={() => toast(`${n.label} · 敬请期待`)}
                  title="敬请期待"
                >
                  {n.label}
                </button>
              );
            }
            return (
              <Link key={n.id} to={n.to} className={cls} aria-current={cls ? "page" : undefined} reloadDocument={n.id === "forum"}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Link className="nav-user" to="/me" aria-label={`打开 ${nickname} 的个人中心`}>
          <span className="dot" title={identityLabel} />
          <span>队长 · {nickname}</span>
          <span className="meta">{identityLabel}</span>
        </Link>
      </div>
    </header>
  );
}
