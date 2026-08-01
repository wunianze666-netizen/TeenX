import { Component, useEffect, useState, type ComponentType, type ReactNode } from "react";

class ShaderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // The CSS fallback remains visible if WebGPU initialization fails.
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function LandingHeroBackground() {
  const [enabled, setEnabled] = useState(false);
  const [ShaderLayer, setShaderLayer] = useState<ComponentType | null>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;

    const update = () => {
      window.clearTimeout(timer);
      if (reducedMotion.matches || !("gpu" in navigator)) {
        setEnabled(false);
        return;
      }
      timer = window.setTimeout(() => setEnabled(true), 80);
    };

    update();
    reducedMotion.addEventListener("change", update);
    return () => {
      window.clearTimeout(timer);
      reducedMotion.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void import("./LandingHeroShader")
      .then((module) => {
        if (active) setShaderLayer(() => module.default);
      })
      .catch(() => {
        if (active) setShaderLayer(null);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return (
    <div className="landing-hero-background" aria-hidden="true">
      <div className="landing-hero-fallback" />
      {enabled && ShaderLayer && (
        <ShaderBoundary>
          <ShaderLayer />
        </ShaderBoundary>
      )}
    </div>
  );
}
