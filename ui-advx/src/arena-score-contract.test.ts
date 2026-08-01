import { describe, expect, it } from "vitest";
import { parsePublicArenaScore } from "./arena-score-contract";

const DIMENSIONS = [
  ["需求符合度", 200],
  ["规则遵循", 150],
  ["代码/实现质量", 150],
  ["创新性", 150],
  ["趣味性/体验感", 100],
  ["视觉/审美", 100],
  ["问题解决能力", 100],
  ["完成度与细节", 50],
] as const;

function validScore(): unknown {
  return {
    id: "score-public",
    submissionId: "submission-public",
    challengeVersionId: "challenge-v1",
    teamVersionId: "team-version-public",
    submissionSha256: "a".repeat(64),
    rubricVersion: "arena-rubric-v3",
    official: true,
    totalScore: 1000,
    totalMaxScore: 1000,
    summary: "完成了全部要求",
    strengths: ["结构清晰"],
    weaknesses: [],
    dimensions: DIMENSIONS.map(([name, maxScore]) => ({
      name,
      score: maxScore,
      maxScore,
      comment: "达到要求",
      subScores: [{
        name: `${name}子项`,
        score: maxScore,
        maxScore,
        comment: "证据充分",
        anchor: "full",
        confidence: "high",
        verification: "source_verified",
        evidence: [{ path: "src/index.ts", lineStart: 1, lineEnd: 1, quote: "export {}", verified: true }],
        evidenceWarnings: [],
      }],
      review: { primaryScore: maxScore, independentScore: maxScore, delta: 0, adjudicated: true },
    })),
    scoredAt: "2026-07-25T00:00:00.000Z",
  };
}

describe("public Arena score contract", () => {
  it("returns a typed public score when the complete contract is valid", () => {
    // Given: an unknown value with all required public score fields.
    const input = validScore();

    // When: the public boundary parses the value.
    const result = parsePublicArenaScore(input);

    // Then: callers receive the narrowed score and can read typed dimensions.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.score.dimensions[0]?.name).toBe("需求符合度");
  });

  it("fails closed when the ordered dimension contract changes", () => {
    // Given: a score whose first dimension is not the official first dimension.
    const input = validScore();
    if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("fixture must be an object");
    const dimensions = Reflect.get(input, "dimensions");
    if (!Array.isArray(dimensions)) throw new TypeError("fixture dimensions must be an array");
    const first = dimensions[0];
    if (first === null || typeof first !== "object" || Array.isArray(first)) throw new TypeError("fixture dimension must be an object");
    Reflect.set(first, "name", "未知维度");

    // When: the public boundary parses the value.
    const result = parsePublicArenaScore(input);

    // Then: no score escapes the boundary.
    expect(result.ok).toBe(false);
  });
});
