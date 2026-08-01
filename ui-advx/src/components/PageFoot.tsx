import { Link } from "react-router-dom";
import { TeenXLogo } from "./TeenXLogo";

export function PageFoot({ variant = "product" }: { variant?: "product" | "landing" }) {
  if (variant === "landing") {
    return (
      <footer className="pagefoot landing-footer">
        <div className="landing-shell landing-footer-inner">
          <div>
            <TeenXLogo alt="TeenX" loading="lazy" />
            <span>给孩子一支 AI 队伍</span>
          </div>
          <nav aria-label="页脚导航">
            <Link to="/studio">Studio</Link>
            <a href="/forum">社区</a>
          </nav>
          <span>© 2026 TeenX</span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="pagefoot">
      <div className="container row-between">
        <span>© 2026 TeenX · 给孩子一支 AI 队伍</span>
        <span className="meta">TeenX Studio · 队伍协作与作品记录</span>
      </div>
    </footer>
  );
}
