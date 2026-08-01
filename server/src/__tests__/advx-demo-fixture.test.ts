import { appendFile, cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { TODO_DEMO_CHALLENGE_VERSION_ID, TODO_DEMO_SUBMISSION_SHA256, loadTodoDemoFixture } from "../services/advx-demo/fixture.js";
import { TodoDemoFixtureIntegrityError, todoDemoManifestSchema } from "../services/advx-demo/types.js";

const FIXTURE_ROOT = new URL("../built-ins/advx-demo/todo-web-v1/r1/", import.meta.url);

describe("ADVX Todo demo fixture", () => {
  it("loads the immutable empirical result through the production contracts", async () => {
    // Given: the committed Todo demo revision.
    // When: the strict runtime loader verifies every fixture asset.
    const fixture = await loadTodoDemoFixture();

    // Then: the archive and public result retain the validated identity.
    expect(fixture.manifest.challengeVersionId).toBe(TODO_DEMO_CHALLENGE_VERSION_ID);
    expect(fixture.manifest.official).toBe(false);
    expect(fixture.manifest.studioGenerated).toBe(false);
    expect(fixture.archiveSha256).toBe(TODO_DEMO_SUBMISSION_SHA256);
    expect(fixture.score).toMatchObject({
      challengeVersionId: "todo-web:v1", submissionSha256: TODO_DEMO_SUBMISSION_SHA256,
      official: false, totalScore: 894, totalMaxScore: 1000,
    });
    expect(fixture.parsedSubmission.fileList).toEqual(["DESIGN.md", "README.md", "app.js", "index.html", "styles.css"]);
    expect(countEvidence(fixture.score)).toBe(53);
  });

  it("rejects changed source even when the archive is untouched", async () => {
    // Given: an isolated copy with one logical source asset changed.
    const root = await copyFixture();
    await appendFile(new URL("source/app.js", root), "\n// drift\n", "utf8");
    // When: the copied fixture is loaded.
    const loaded = loadTodoDemoFixture(root);
    // Then: manifest verification fails closed before data can be consumed.
    await expect(loaded).rejects.toBeInstanceOf(TodoDemoFixtureIntegrityError);
  });

  it("accepts Git-managed CRLF checkout bytes as the same immutable text", async () => {
    const root = await copyFixture();
    const manifestUrl = new URL("manifest.json", root);
    const manifest = await readFile(manifestUrl, "utf8");
    await writeFile(manifestUrl, manifest.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"), "utf8");

    const fixture = await loadTodoDemoFixture(root);

    expect(fixture.archiveSha256).toBe(TODO_DEMO_SUBMISSION_SHA256);
  });

  it("rejects manifest identity drift even when its JSON remains valid", async () => {
    // Given: an isolated copy whose declared archive digest was changed.
    const root = await copyFixture();
    const manifestUrl = new URL("manifest.json", root);
    const manifest = todoDemoManifestSchema.parse(JSON.parse(await readFile(manifestUrl, "utf8")));
    await writeFile(manifestUrl, `${JSON.stringify({ ...manifest, archive: { ...manifest.archive, sha256: "0".repeat(64) } }, null, 2)}\n`);
    // When: the copied fixture is loaded.
    const loaded = loadTodoDemoFixture(root);
    // Then: the hard-coded revision identity rejects the self-described drift.
    await expect(loaded).rejects.toBeInstanceOf(TodoDemoFixtureIntegrityError);
  });

  it("rejects unlisted files instead of silently ignoring fixture drift", async () => {
    // Given: an isolated copy with an extra unmanifested file.
    const root = await copyFixture();
    await writeFile(new URL("prepared/unlisted.json", root), "{}\n");
    // When: the copied fixture is loaded.
    const loaded = loadTodoDemoFixture(root);
    // Then: the closed asset set rejects the extra file.
    await expect(loaded).rejects.toBeInstanceOf(TodoDemoFixtureIntegrityError);
  });
});

async function copyFixture(): Promise<URL> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "advx-todo-demo-"));
  const copiedRoot = path.join(temporaryRoot, "r1");
  await cp(fileURLToPath(FIXTURE_ROOT), copiedRoot, { recursive: true });
  return pathToFileURL(`${copiedRoot}/`);
}

function countEvidence(score: Awaited<ReturnType<typeof loadTodoDemoFixture>>["score"]): number {
  return score.dimensions.reduce(
    (dimensionTotal, dimension) => dimensionTotal + dimension.subScores.reduce(
      (subScoreTotal, subScore) => subScoreTotal + subScore.evidence.length, 0,
    ), 0,
  );
}
