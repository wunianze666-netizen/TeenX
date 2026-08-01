import type { PublicArenaEvidence } from "../api";

export function ArenaEvidence({ evidence }: { evidence: PublicArenaEvidence }) {
  const lines = evidence.lineStart === evidence.lineEnd
    ? `L${evidence.lineStart}`
    : `L${evidence.lineStart}–L${evidence.lineEnd}`;

  return (
    <figure className="arena-evidence">
      <figcaption className="arena-evidence-head">
        <code>{evidence.path}</code>
        <span className="meta">{lines} · 已验证</span>
      </figcaption>
      <pre>{evidence.quote}</pre>
    </figure>
  );
}
