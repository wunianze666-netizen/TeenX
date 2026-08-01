import type { PublicArenaScore, PublicArenaSubScore } from "../api";
import { formatArenaDate } from "../arena-format";
import { ArenaEvidence } from "./ArenaEvidence";

const ANCHOR_LABEL: Record<PublicArenaSubScore["anchor"], string> = {
  zero: "未达到",
  partial: "部分达到",
  full: "完全达到",
};

const CONFIDENCE_LABEL: Record<PublicArenaSubScore["confidence"], string> = {
  high: "高置信",
  medium: "中置信",
  low: "低置信",
};

const VERIFICATION_LABEL: Record<PublicArenaSubScore["verification"], string> = {
  source_verified: "源码证据已验证",
  static_inference: "静态推断，未运行验证",
  not_verifiable: "当前材料无法验证",
};

export function ArenaScorecard({ score, challengeTitle }: { score: PublicArenaScore; challengeTitle: string }) {
  return (
    <div className="arena-scorecard-stack">
      <section className="card arena-score-hero">
        <div className="row-between arena-score-hero-head">
          <div>
            <p className="eyebrow">Arena Scorecard</p>
            <h1 className="h3">{challengeTitle}</h1>
            <div className="row arena-score-tags">
              <span className={score.official ? "pill" : "pill pill-dim"}>
                {score.official ? "官方成绩" : "非官方评审"}
              </span>
              <span className="meta">评分于 {formatArenaDate(score.scoredAt)}</span>
            </div>
          </div>
          <div className="arena-total-score">
            <strong className="score-big num">{score.totalScore}</strong>
            <span className="meta">/ {score.totalMaxScore}</span>
          </div>
        </div>

        <div className="arena-score-summary">
          <p>{score.summary}</p>
        </div>

        <div className="arena-score-dimension-grid">
          {score.dimensions.map((dimension, index) => (
            <a key={dimension.name} href={`#arena-dimension-${index + 1}`} className="arena-score-dimension-link">
              <span className="meta">{String(index + 1).padStart(2, "0")}</span>
              <strong>{dimension.name}</strong>
              <span className="num">{dimension.score} / {dimension.maxScore}</span>
            </a>
          ))}
        </div>
      </section>

      {!score.official && (
        <div className="notice arena-unofficial-notice">
          <span className="pill pill-dim">非官方</span>
          <span>这次成绩来自开发评审环境，不作为<span className="arena-keep-together">正式 Arena 成绩</span>。</span>
        </div>
      )}

      <section className="grid-2 arena-diagnosis-grid">
        <div className="card">
          <h3>做得好的地方</h3>
          {score.strengths.length ? (
            <ul className="arena-copy-list">
              {score.strengths.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}
            </ul>
          ) : <p className="muted small mb-0">本次没有单列优势。</p>}
        </div>
        <div className="card">
          <h3>可以继续改进</h3>
          {score.weaknesses.length ? (
            <ul className="arena-copy-list">
              {score.weaknesses.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}
            </ul>
          ) : <p className="muted small mb-0">本次没有单列不足。</p>}
        </div>
      </section>

      <section className="arena-dimension-details" aria-label="八个评分维度详情">
        {score.dimensions.map((dimension, dimensionIndex) => (
          <article key={dimension.name} id={`arena-dimension-${dimensionIndex + 1}`} className="card arena-dimension-card">
            <header className="row-between arena-dimension-card-head">
              <div className="row">
                <span className="arena-dimension-number num">{String(dimensionIndex + 1).padStart(2, "0")}</span>
                <div>
                  <h2 className="h3">{dimension.name}</h2>
                  <p className="muted small mb-0">{dimension.comment}</p>
                </div>
              </div>
              <div className="arena-dimension-score num">
                <strong>{dimension.score}</strong>
                <span className="muted"> / {dimension.maxScore}</span>
              </div>
            </header>

            <div className="arena-review-row">
              <span>第一评委 <strong className="num">{dimension.review.primaryScore}</strong></span>
              <span>独立评委 <strong className="num">{dimension.review.independentScore}</strong></span>
              <span>差值 <strong className="num">{dimension.review.delta}</strong></span>
              <span className="pill pill-blue">已仲裁</span>
            </div>

            <div className="arena-subscore-list">
              {dimension.subScores.map((subScore, subIndex) => (
                <section key={`${subIndex}:${subScore.name}`} className="arena-subscore">
                  <div className="row-between arena-subscore-head">
                    <div>
                      <span className="meta">子项 {subIndex + 1}</span>
                      <h3>{subScore.name}</h3>
                    </div>
                    <strong className="num">{subScore.score} / {subScore.maxScore}</strong>
                  </div>
                  <p className="arena-subscore-comment">{subScore.comment}</p>
                  <div className="arena-subscore-tags">
                    <span className="tag">{ANCHOR_LABEL[subScore.anchor]}</span>
                    <span className="tag">{CONFIDENCE_LABEL[subScore.confidence]}</span>
                    <span className={subScore.verification === "source_verified" ? "pill pill-blue" : "pill pill-dim"}>
                      {VERIFICATION_LABEL[subScore.verification]}
                    </span>
                  </div>

                  {subScore.evidence.length ? (
                    <div className="arena-evidence-list">
                      {subScore.evidence.map((evidence, evidenceIndex) => (
                        <ArenaEvidence key={`${evidence.path}:${evidence.lineStart}:${evidenceIndex}`} evidence={evidence} />
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">没有可展示的已验证源码引用。</p>
                  )}

                  {subScore.evidenceWarnings.length > 0 && (
                    <div className="arena-evidence-warnings">
                      <p className="meta mb-0">证据说明</p>
                      <ul>
                        {subScore.evidenceWarnings.map((warning, warningIndex) => (
                          <li key={`${warningIndex}:${warning}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
