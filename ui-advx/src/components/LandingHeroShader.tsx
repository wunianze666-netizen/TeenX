import { useEffect, useState } from "react";
import { ChromaFlow, FilmGrain, FlutedGlass, Shader, Swirl } from "shaders/react";

interface ShaderColors {
  white: string;
  accent: string;
}

function resolveCssColor(variable: string) {
  const probe = document.createElement("span");
  probe.className = "landing-color-probe";
  probe.style.color = `var(${variable})`;
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

export default function LandingHeroShader() {
  const [colors, setColors] = useState<ShaderColors | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setColors({
      white: resolveCssColor("--fg"),
      accent: resolveCssColor("--accent"),
    });
  }, []);

  if (!colors) return null;

  return (
    <div className={`landing-shader-stage${ready ? " is-ready" : ""}`}>
      <Shader disableTelemetry={true} colorSpace="srgb" onReady={() => setReady(true)}>
        <Swirl
          colorA={colors.white}
          colorB={colors.accent}
          detail={1.7}
          speed={0.15}
          blend={54}
          colorSpace="linear"
        />
        <ChromaFlow
          baseColor={colors.white}
          upColor={colors.accent}
          downColor={colors.accent}
          leftColor={colors.accent}
          rightColor={colors.accent}
          intensity={0.95}
          momentum={13}
          radius={3.5}
          opacity={0.64}
        />
        <FlutedGlass
          aberration={0.22}
          angle={31}
          frequency={8}
          highlight={0.1}
          highlightSoftness={0}
          highlightColor={colors.white}
          lightAngle={-90}
          refraction={4}
          shape="rounded"
          softness={1}
          speed={0.15}
          edges="mirror"
        />
        <FilmGrain strength={0.03} bias={1.5} animated={false} />
      </Shader>
    </div>
  );
}
