import { describe, expect, it } from "vitest";
import { getArenaChallenge } from "../services/advx-arena-catalog.js";
import { buildEvidenceIndex, parseAndValidateDimensionScore } from "../services/advx-arena/dimension-scorer.js";
import {
  DIMENSION_SKELETON,
  EvaluationContractError,
  parseAndValidateCriteria,
  validateCompleteScores,
} from "../services/advx-arena/scoring-contract.js";
import { validatePublicArenaScore } from "../services/advx-arena/public-score-validator.js";
import type { PublicArenaDimensionScore, PublicArenaScore } from "../services/advx-arena/public-types.js";
import type { Criterion, CriterionScore } from "../services/advx-arena/types.js";
import { ArenaZipError, formatSubmissionForAgent, parseZipBuffer } from "../services/advx-arena/zip-parser.js";
import { canonicalPublicScore } from "./advx-arena-score-fixtures.js";
import { createZip, fixtureCriteria } from "./advx-arena-test-fixtures.js";

describe("ADVX Arena scoring contract", () => {
  it("binds official challenge content to a stable digest", () => {
    const challenge = getArenaChallenge("todo-web:v1");
    expect(challenge?.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(getArenaChallenge("todo-web:v1")?.contentDigest).toBe(challenge?.contentDigest);
  });
  it("rejects missing dimensions and invalid maxima", () => {
    const invalid = JSON.stringify({
      criteria: DIMENSION_SKELETON.slice(0, 7).map((dimension) => ({
        name: dimension.name,
        maxScore: dimension.maxScore + 1,
        rubric: "invalid",
        subCriteria: [{ name: "only", maxScore: dimension.maxScore, anchor0: "none", anchorPartial: "some", anchorFull: "all" }],
      })),
    });
    expect(() => parseAndValidateCriteria(invalid)).toThrow(EvaluationContractError);
  });

  it("rejects positive scores without verified source evidence", () => {
    const criteria = fixtureCriteria();
    const scores = new Map<string, CriterionScore>(criteria.map((criterion) => [criterion.name, {
      criterionName: criterion.name,
      score: criterion.maxScore,
      maxScore: criterion.maxScore,
      subScores: criterion.subCriteria.map((sub) => ({
        name: sub.name,
        score: sub.maxScore,
        maxScore: sub.maxScore,
        comment: "unsupported",
        anchor: "full",
        confidence: "high",
        verification: "source_verified",
        evidenceRefs: [],
        evidenceWarnings: [],
      })),
      comment: "unsupported",
      review: { primaryScore: criterion.maxScore, independentScore: criterion.maxScore, delta: 0, adjudicated: true },
    }]));
    expect(() => validateCompleteScores(criteria, scores)).toThrow("正分缺少可验证证据");
  });

  it("re-extracts a canonical quote from verified source lines", () => {
    const criterion: Criterion = {
      name: "需求符合度",
      maxScore: 10,
      rubric: "test",
      subCriteria: [{ name: "core", maxScore: 10, anchor0: "none", anchorPartial: "some", anchorFull: "all" }],
    };
    const evidence = buildEvidenceIndex([{ path: "src/main.js", content: "const answer = 42; // canonical source", size: 38 }]);
    const result = parseAndValidateDimensionScore(JSON.stringify({
      subScores: [{
        name: "core",
        anchor: "partial",
        score: 5,
        maxScore: 10,
        verification: "source_verified",
        confidence: "high",
        evidenceRefs: [{ path: "src/main.js", lineStart: 99, lineEnd: 99, quote: "answer = 42" }],
        comment: "direct evidence",
      }],
      dimensionComment: "verified",
    }), criterion, evidence);
    expect(result.subScores[0]?.evidenceRefs[0]).toMatchObject({
      path: "src/main.js",
      lineStart: 1,
      lineEnd: 1,
      quote: "const answer = 42; // canonical source",
      verified: true,
    });
  });

  it.each([
    ["reordered dimensions", (score: PublicArenaScore) => { score.dimensions.reverse(); }],
    ["duplicate dimensions", (score: PublicArenaScore) => { score.dimensions[1] = firstDimension(score); }],
    ["unknown dimensions", (score: PublicArenaScore) => { firstDimension(score).name = "unknown"; }],
    ["wrong dimension maxima", (score: PublicArenaScore) => { firstDimension(score).maxScore += 1; }],
    ["wrong total maximum", (score: PublicArenaScore) => { Reflect.set(score, "totalMaxScore", 999); }],
    ["wrong rubric version", (score: PublicArenaScore) => { Reflect.set(score, "rubricVersion", "legacy"); }],
    ["incorrect total arithmetic", (score: PublicArenaScore) => { score.totalScore = 1; }],
    ["incorrect subscore arithmetic", (score: PublicArenaScore) => {
      firstDimension(score).score = 1;
      score.totalScore = 1;
    }],
    ["incorrect subscore maxima", (score: PublicArenaScore) => { firstSubScore(score).maxScore -= 1; }],
    ["primary review scores above the dimension maximum", (score: PublicArenaScore) => {
      firstDimension(score).review.primaryScore = firstDimension(score).maxScore + 1;
    }],
    ["negative independent review scores", (score: PublicArenaScore) => {
      firstDimension(score).review.independentScore = -1;
    }],
    ["negative review delta", (score: PublicArenaScore) => { firstDimension(score).review.delta = -1; }],
    ["incorrect absolute review delta", (score: PublicArenaScore) => { firstDimension(score).review.delta = 1; }],
    ["non-adjudicated reviews", (score: PublicArenaScore) => {
      Reflect.set(firstDimension(score).review, "adjudicated", false);
    }],
    ["positive scores without verified evidence", (score: PublicArenaScore) => {
      const dimension = firstDimension(score);
      const subScore = firstSubScore(score);
      dimension.score = 1;
      score.totalScore = 1;
      subScore.score = 1;
      subScore.anchor = "partial";
      subScore.verification = "source_verified";
    }],
  ])("rejects public scores with %s", (_case, mutate) => {
    const score = canonicalPublicScore();
    mutate(score);
    expect(() => validatePublicArenaScore(score)).toThrow(EvaluationContractError);
  });

  it.each([[70, 40, 30], [40, 70, 30]])(
    "accepts symmetric absolute review delta %i to %i",
    (primaryScore, independentScore, delta) => {
      const score = canonicalPublicScore();
      Object.assign(firstDimension(score).review, { primaryScore, independentScore, delta });
      expect(validatePublicArenaScore(score)).toBe(score);
    },
  );
});

function firstDimension(score: PublicArenaScore): PublicArenaDimensionScore {
  const dimension = score.dimensions[0];
  if (!dimension) throw new TypeError("canonical dimension fixture missing");
  return dimension;
}

function firstSubScore(score: PublicArenaScore): PublicArenaDimensionScore["subScores"][number] {
  const subScore = firstDimension(score).subScores[0];
  if (!subScore) throw new TypeError("canonical subscore fixture missing");
  return subScore;
}

describe("ADVX Arena ZIP boundary", () => {
  it("keeps line-addressable source while excluding secrets and dependencies", async () => {
    const parsed = await parseZipBuffer(createZip([
      { name: "src/index.js", content: "const answer = 42;\nconsole.log(answer);" },
      { name: ".env", content: "SECRET=do-not-send" },
      { name: "node_modules/pkg/index.js", content: "ignored" },
    ]));
    const formatted = formatSubmissionForAgent(parsed);
    expect(parsed.files.map((file) => file.path)).toEqual(["src/index.js"]);
    expect(parsed.omittedFiles.map((file) => file.path)).toContain(".env");
    expect(formatted).toContain("L1: const answer = 42;");
    expect(formatted).not.toContain("do-not-send");
  });

  it.each([
    [[{ name: "src/a.js", content: "one" }, { name: "src/./a.js", content: "two" }], "normalized duplicate"],
    [[{ name: "../escape.js", content: "bad" }], "directory traversal"],
    [[{ name: "/absolute.js", content: "bad" }], "absolute path"],
    [[{ name: "secret.js", content: "bad", encrypted: true }], "encrypted entry"],
  ] as const)("rejects malicious archives: %s", async (entries) => {
    await expect(parseZipBuffer(createZip([...entries]))).rejects.toBeInstanceOf(ArenaZipError);
  });

  it("rejects non-ZIP payloads", async () => {
    await expect(parseZipBuffer(Buffer.from("not a zip"))).rejects.toBeInstanceOf(ArenaZipError);
  });

  it.each([".netrc", ".ssh/id_rsa", ".ssh/id_ed25519", ".aws/credentials", "service-account-credentials.json"])(
    "excludes credential path %s from model input",
    async (name) => {
      const parsed = await parseZipBuffer(createZip([{ name, content: "secret-material" }]));
      expect(parsed.files).toEqual([]);
      expect(parsed.omittedFiles.map((item) => item.path)).toContain(name);
    },
  );

  it("redacts high-confidence secret lines and prevents evidence on them", async () => {
    const parsed = await parseZipBuffer(createZip([{
      name: "src/config.ts",
      content: "export const safe = true;\nconst apiKey = 'sk-abcdefghijklmnopqrstuvwxyz123456';\nexport const end = true;",
    }]));
    const file = parsed.files[0];
    if (!file) throw new TypeError("parsed file fixture missing");
    expect(file.content).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(file.redactedLines).toEqual([2]);
    const criterion: Criterion = {
      name: "secret-check",
      maxScore: 10,
      rubric: "test",
      subCriteria: [{ name: "secret", maxScore: 10, anchor0: "none", anchorPartial: "some", anchorFull: "all" }],
    };
    const result = parseAndValidateDimensionScore(JSON.stringify({
      subScores: [{
        name: "secret",
        anchor: "partial",
        score: 5,
        maxScore: 10,
        verification: "source_verified",
        confidence: "high",
        evidenceRefs: [{ path: file.path, lineStart: 2, lineEnd: 2, quote: "[REDACTED SECRET]" }],
        comment: "must not verify",
      }],
      dimensionComment: "redacted",
    }), criterion, buildEvidenceIndex([file]));
    expect(result.score).toBe(0);
    expect(result.subScores[0]?.evidenceRefs).toEqual([]);
  });

  it.each([
    '"apiKey": "quoted-secret-value"',
    "'access_token': 'quoted-token-value'",
    'endpoint = "https://captain:super-secret@example.com/private"',
  ])("redacts quoted credentials and URI userinfo: %s", async (line) => {
    const parsed = await parseZipBuffer(createZip([{
      name: "src/config.ts",
      content: `export const safe = true;\n${line}\nexport const end = true;`,
    }]));
    const file = parsed.files[0];
    if (!file) throw new TypeError("parsed file fixture missing");

    expect(file.content).not.toContain(line);
    expect(file.content.split("\n")[1]).toBe("[REDACTED SECRET]");
    expect(file.redactedLines).toEqual([2]);
  });

  it("redacts complete PEM blocks and makes every block line evidence-ineligible", async () => {
    const privateKeyLabel = "PRIVATE KEY";
    const parsed = await parseZipBuffer(createZip([{
      name: "src/config.ts",
      content: [
        "export const safe = true;",
        `-----BEGIN ${privateKeyLabel}-----`,
        "base64-secret-material",
        `-----END ${privateKeyLabel}-----`,
        "export const end = true;",
      ].join("\n"),
    }]));
    const file = parsed.files[0];
    if (!file) throw new TypeError("parsed file fixture missing");
    expect(file.content).not.toContain("base64-secret-material");
    expect(file.redactedLines).toEqual([2, 3, 4]);

    const criterion: Criterion = {
      name: "secret-check",
      maxScore: 10,
      rubric: "test",
      subCriteria: [{ name: "secret", maxScore: 10, anchor0: "none", anchorPartial: "some", anchorFull: "all" }],
    };
    const result = parseAndValidateDimensionScore(JSON.stringify({
      subScores: [{
        name: "secret",
        anchor: "partial",
        score: 5,
        maxScore: 10,
        verification: "source_verified",
        confidence: "high",
        evidenceRefs: [{ path: file.path, lineStart: 3, lineEnd: 3, quote: "[REDACTED SECRET]" }],
        comment: "must not verify",
      }],
      dimensionComment: "redacted",
    }), criterion, buildEvidenceIndex([file]));
    expect(result.score).toBe(0);
    expect(result.subScores[0]?.evidenceRefs).toEqual([]);
  });

  it("fails closed for unterminated PEM private-key blocks", async () => {
    const privateKeyLabel = "RSA PRIVATE KEY";
    const parsed = await parseZipBuffer(createZip([{
      name: "src/config.ts",
      content: `-----BEGIN ${privateKeyLabel}-----\nbase64-secret-material\ntrailing-secret-material`,
    }]));
    const file = parsed.files[0];
    if (!file) throw new TypeError("parsed file fixture missing");
    expect(file.content).toBe("[REDACTED SECRET]\n[REDACTED SECRET]\n[REDACTED SECRET]");
    expect(file.redactedLines).toEqual([1, 2, 3]);
  });
});
