import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { TeenXLogo } from "./TeenXLogo";

function scrollToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  event.preventDefault();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  window.history.replaceState(null, "", `#${id}`);
}

export function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  function closeMenu(restoreFocus = true) {
    setMenuOpen(false);
    if (restoreFocus) window.setTimeout(() => menuButtonRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!menuOpen) return;

    document.body.classList.add("landing-menu-open");
    const firstLink = sheetRef.current?.querySelector<HTMLElement>("[data-sheet-focus]");
    window.setTimeout(() => firstLink?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;

      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ).filter((element) => element.tabIndex >= 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onResize = () => {
      if (window.innerWidth >= 768) closeMenu(false);
    };

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.classList.remove("landing-menu-open");
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="landing-nav-wrap">
        <nav className="landing-shell landing-nav" aria-label="主导航">
          <Link className="landing-brand" to="/" aria-label="TeenX 首页">
            <TeenXLogo alt="" />
          </Link>

          <div className="landing-nav-links">
            <a href="#why-teenx" onClick={(event) => scrollToSection(event, "why-teenx")}>为什么 TeenX</a>
            <a href="#how-it-works" onClick={(event) => scrollToSection(event, "how-it-works")}>怎么玩</a>
            <a href="/forum">社区</a>
          </div>

          <div className="landing-nav-actions">
            <span className="landing-age">面向 11–16 岁</span>
            <Link className="landing-nav-cta" to="/studio">开始建队</Link>
            <button
              ref={menuButtonRef}
              className="landing-menu-button"
              type="button"
              aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>
        </nav>
      </header>

      <div
        id="landing-mobile-menu"
        className={`landing-menu-overlay${menuOpen ? " is-open" : ""}`}
        aria-hidden={!menuOpen}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
      >
        <div ref={sheetRef} className="landing-menu-sheet" role="dialog" aria-modal="true" aria-label="移动导航">
          <div className="landing-menu-sheet-head">
            <TeenXLogo alt="TeenX" />
            <p>定义角色，安排协作，带一支 AI 队伍把事情做出来。</p>
          </div>
          <div className="landing-menu-sheet-links">
            <a
              href="#why-teenx"
              data-sheet-focus
              tabIndex={menuOpen ? 0 : -1}
              onClick={(event) => {
                scrollToSection(event, "why-teenx");
                closeMenu(false);
              }}
            >
              <span>01</span>为什么 TeenX
            </a>
            <a
              href="#how-it-works"
              tabIndex={menuOpen ? 0 : -1}
              onClick={(event) => {
                scrollToSection(event, "how-it-works");
                closeMenu(false);
              }}
            >
              <span>02</span>怎么玩
            </a>
            <a href="/forum" tabIndex={menuOpen ? 0 : -1}><span>03</span>社区</a>
          </div>
          <Link className="landing-menu-sheet-cta" to="/studio" tabIndex={menuOpen ? 0 : -1} onClick={() => closeMenu(false)}>
            开始建队
          </Link>
        </div>
      </div>
    </>
  );
}
