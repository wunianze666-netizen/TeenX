import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { getArenaChallenge } from "../advx-arena-catalog.js";
import type { PublicArenaScore } from "../advx-arena/public-types.js";
import type { ArenaStandard, ParsedSubmission } from "../advx-arena/types.js";
import { validatePublicArenaScore } from "../advx-arena/public-score-validator.js";
import { validateArenaStandard } from "../advx-arena/standard-contract.js";
import { parseZipBuffer } from "../advx-arena/zip-parser.js";
import {
  TodoDemoFixtureIntegrityError,
  arenaStandardSchema,
  publicArenaScoreSchema,
  todoDemoManifestSchema,
  todoDemoProviderReplaySchema,
  type TodoDemoFixture,
  type TodoDemoManifest,
  type TodoDemoProviderReplay,
} from "./types.js";

export const TODO_DEMO_CHALLENGE_VERSION_ID = "todo-web:v1" as const;
export const TODO_DEMO_SUBMISSION_SHA256 = "8c9c22f4478de9cb56f9137f6fd1324f6267dc93312aeeafe6ed27c5a7b179b4" as const;
const TODO_DEMO_MANIFEST_SHA256 = "f2ef88a5f20e35d265dd2017cfaa7a113b0c62ee9cc555e61742a37b8565b428";
const DEFAULT_FIXTURE_ROOT = new URL("../../built-ins/advx-demo/todo-web-v1/r1/", import.meta.url);
const ENTRY_ORDER = ["DESIGN.md", "README.md", "app.js", "index.html", "styles.css"] as const;
const ASSET_PATHS = [
  "prepared/evidence-matrix.md", "prepared/provider-replay.json", "prepared/public-score.json",
  "prepared/standard.json", "source/DESIGN.md", "source/README.md", "source/app.js",
  "source/index.html", "source/styles.css", "submission.zip",
] as const;

type PreparedData = {
  readonly manifest: TodoDemoManifest;
  readonly standard: ArenaStandard;
  readonly score: PublicArenaScore;
  readonly provider: TodoDemoProviderReplay;
  readonly parsed: ParsedSubmission;
};

export async function loadTodoDemoFixture(root = DEFAULT_FIXTURE_ROOT): Promise<TodoDemoFixture> {
  try {
    const manifestBuffer = normalizeFixtureAsset("manifest.json", await readFile(new URL("manifest.json", root)));
    verifyDigest(manifestBuffer, TODO_DEMO_MANIFEST_SHA256, "manifest.json");
    const manifest: TodoDemoManifest = todoDemoManifestSchema.parse(parseJson(manifestBuffer));
    verifyManifestIdentity(manifest);
    await verifyClosedAssetSet(root, manifest);
    const assets = await loadAssets(root, manifest);
    const archive = requiredAsset(assets, manifest.archive.path);
    const parsedSubmission = await parseZipBuffer(archive);
    verifyArchiveSources(parsedSubmission, assets, manifest);
    const standard: ArenaStandard = arenaStandardSchema.parse(parseJson(requiredAsset(assets, manifest.prepared.standard)));
    const score: PublicArenaScore = publicArenaScoreSchema.parse(parseJson(requiredAsset(assets, manifest.prepared.score)));
    const providerReplay: TodoDemoProviderReplay = todoDemoProviderReplaySchema.parse(
      parseJson(requiredAsset(assets, manifest.prepared.providerReplay)),
    );
    verifyPreparedData({ manifest, standard, score, provider: providerReplay, parsed: parsedSubmission });
    return { manifest, archive, archiveSha256: sha256(archive), parsedSubmission, standard, score, providerReplay };
  } catch (error) {
    if (error instanceof TodoDemoFixtureIntegrityError) throw error;
    throw new TodoDemoFixtureIntegrityError("fixture data or production contract is invalid", { cause: error });
  }
}

function verifyManifestIdentity(manifest: TodoDemoManifest): void {
  if (manifest.challengeVersionId !== TODO_DEMO_CHALLENGE_VERSION_ID) fail("challenge identity changed");
  if (manifest.official || manifest.studioGenerated) fail("fixture provenance changed");
  if (manifest.archive.path !== "submission.zip") fail("archive path changed");
  if (manifest.archive.sha256 !== TODO_DEMO_SUBMISSION_SHA256 || manifest.archive.byteSize !== 8755) fail("archive identity changed");
  if (manifest.archive.modifiedAt !== "2020-01-01T00:00:00.000Z") fail("archive timestamp changed");
  if (!sameStrings(manifest.archive.entryOrder, ENTRY_ORDER)) fail("archive entry order changed");
  if (!sameStrings(manifest.assets.map((asset) => asset.path), ASSET_PATHS)) fail("manifest asset set changed");
}

async function verifyClosedAssetSet(root: URL, manifest: TodoDemoManifest): Promise<void> {
  const actual = (await listFiles(root)).sort();
  const expected = ["manifest.json", ...manifest.assets.map((asset) => asset.path)].sort();
  if (!sameStrings(actual, expected)) fail("fixture file set differs from manifest");
}

async function listFiles(root: URL, prefix = ""): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(new URL(prefix || ".", root), { withFileTypes: true })) {
    const relativePath = `${prefix}${entry.name}`;
    if (entry.isDirectory()) paths.push(...await listFiles(root, `${relativePath}/`));
    else if (entry.isFile()) paths.push(relativePath);
    else fail(`unsupported fixture entry: ${relativePath}`);
  }
  return paths;
}

async function loadAssets(root: URL, manifest: TodoDemoManifest): Promise<ReadonlyMap<string, Buffer>> {
  const assets = new Map<string, Buffer>();
  for (const descriptor of manifest.assets) {
    const content = normalizeFixtureAsset(descriptor.path, await readFile(new URL(descriptor.path, root)));
    if (content.length !== descriptor.byteSize) fail(`asset size changed: ${descriptor.path}`);
    verifyDigest(content, descriptor.sha256, descriptor.path);
    assets.set(descriptor.path, content);
  }
  return assets;
}

function verifyArchiveSources(parsed: ParsedSubmission, assets: ReadonlyMap<string, Buffer>, manifest: TodoDemoManifest): void {
  if (!sameStrings(parsed.fileList, manifest.archive.entryOrder)) fail("parsed archive entries changed");
  if (parsed.omittedFiles.length > 0 || parsed.truncatedFiles.length > 0) fail("archive parser omitted source");
  for (const entry of manifest.archive.entryOrder) {
    const parsedFile = parsed.files.find((file) => file.path === entry);
    if (!parsedFile) fail(`archive source missing: ${entry}`);
    if (!Buffer.from(parsedFile.content, "utf8").equals(requiredAsset(assets, `source/${entry}`))) {
      fail(`archive source differs from committed source: ${entry}`);
    }
  }
}

function verifyPreparedData(data: PreparedData): void {
  const { manifest, standard, score, provider, parsed } = data;
  const challenge = getArenaChallenge(TODO_DEMO_CHALLENGE_VERSION_ID);
  if (!challenge) fail("challenge is unavailable");
  validateArenaStandard(standard, {
    challengeVersionId: TODO_DEMO_CHALLENGE_VERSION_ID,
    challengeDigest: challenge.contentDigest,
    provenance: standard.provenance,
  });
  validatePublicArenaScore(score);
  if (score.challengeVersionId !== TODO_DEMO_CHALLENGE_VERSION_ID) fail("score challenge changed");
  if (score.submissionSha256 !== TODO_DEMO_SUBMISSION_SHA256) fail("score submission changed");
  if (score.official || score.totalScore !== 894 || score.totalMaxScore !== 1000) fail("score identity changed");
  if (provider.challengeVersionId !== manifest.challengeVersionId || provider.official || provider.studioGenerated) fail("prepared provider provenance changed");
  if (provider.archiveAsset !== manifest.archive.path
    || provider.standardAsset !== manifest.prepared.standard
    || provider.scoreAsset !== manifest.prepared.score) fail("prepared provider assets changed");
  if (provider.provenance.mode !== standard.provenance.mode
    || provider.provenance.model !== standard.provenance.model
    || provider.provenance.policy !== standard.provenance.policy) fail("prepared provider model provenance changed");
  verifyEvidence(score, parsed);
}

function verifyEvidence(score: PublicArenaScore, parsed: ParsedSubmission): void {
  let count = 0;
  for (const dimension of score.dimensions) {
    for (const subScore of dimension.subScores) {
      for (const evidence of subScore.evidence) {
        const source = parsed.files.find((file) => file.path === evidence.path);
        if (!source) fail(`score evidence file missing: ${evidence.path}`);
        const quote = source.content.split("\n").slice(evidence.lineStart - 1, evidence.lineEnd).join("\n");
        if (quote !== evidence.quote) fail(`score evidence changed: ${evidence.path}:${evidence.lineStart}`);
        count += 1;
      }
    }
  }
  if (count !== 53) fail("score evidence count changed");
}

function requiredAsset(assets: ReadonlyMap<string, Buffer>, assetPath: string): Buffer {
  const content = assets.get(assetPath);
  if (!content) fail(`manifested asset missing: ${assetPath}`);
  return content;
}

function parseJson(content: Buffer): unknown {
  const value: unknown = JSON.parse(content.toString("utf8"));
  return value;
}
function verifyDigest(content: Buffer, expected: string, assetPath: string): void {
  if (sha256(content) !== expected) fail(`asset digest changed: ${assetPath}`);
}
function normalizeFixtureAsset(assetPath: string, content: Buffer): Buffer {
  if (assetPath.endsWith(".zip")) return content;
  return Buffer.from(content.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
}
function sha256(content: Buffer): string { return createHash("sha256").update(content).digest("hex"); }
function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
function fail(reason: string): never { throw new TodoDemoFixtureIntegrityError(reason); }
