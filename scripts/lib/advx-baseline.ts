import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fail, runCommand, sha256File, sha256Text } from "./advx-core.ts";

export const BASELINE_ARTIFACTS = [
  "preexisting-head.txt",
  "preexisting-status.v2",
  "preexisting-worktree.patch",
  "preexisting-index.patch",
  "preexisting-untracked.tar",
] as const;
const BASELINE_NAMES = new Set<string>(BASELINE_ARTIFACTS);

export type BaselineArtifact = {
  readonly name: string;
  readonly path: string;
  readonly sha256: string;
  readonly byteSize: number;
};

export type BaselineBundle = {
  readonly directory: string;
  readonly artifacts: readonly BaselineArtifact[];
  readonly bundleDigest: string;
  readonly head: string;
};

function parseReceipt(path: string): ReadonlyMap<string, string> {
  const hashes = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").trim().split("\n")) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (match === null) return fail("preexisting-sha256.txt contains a malformed line");
    const hash = match[1];
    const sourcePath = match[2];
    if (hash === undefined || sourcePath === undefined) return fail("checksum fields are missing");
    const name = basename(sourcePath);
    if (!BASELINE_NAMES.has(name)) return fail(`unexpected baseline checksum ${name}`);
    if (hashes.has(name)) return fail(`duplicate baseline checksum ${name}`);
    hashes.set(name, hash);
  }
  if (hashes.size !== BASELINE_ARTIFACTS.length) return fail("baseline receipt is incomplete");
  return hashes;
}

export function loadBaselineBundle(directory: string): BaselineBundle {
  const receiptPath = join(directory, "preexisting-sha256.txt");
  if (!existsSync(receiptPath)) return fail(`missing baseline receipt ${receiptPath}`);
  const expected = parseReceipt(receiptPath);
  const artifacts = BASELINE_ARTIFACTS.map((name): BaselineArtifact => {
    const path = join(directory, name);
    if (!existsSync(path)) return fail(`missing baseline artifact ${name}`);
    const sha256 = sha256File(path);
    if (expected.get(name) !== sha256) return fail(`baseline artifact checksum changed: ${name}`);
    return { byteSize: readFileSync(path).byteLength, name, path, sha256 };
  });
  const digestInput = artifacts
    .map((artifact) => `${artifact.name}\0${artifact.sha256}\0${artifact.byteSize}\n`)
    .sort()
    .join("");
  const head = readFileSync(join(directory, "preexisting-head.txt"), "utf8").trim();
  if (!/^[0-9a-f]{40}$/.test(head)) return fail("preexisting-head.txt is malformed");
  return { artifacts, bundleDigest: sha256Text(digestInput), directory, head };
}

function validateTarPaths(bundle: BaselineBundle, fixture: string): void {
  const paths = runCommand(
    "tar",
    ["-tf", join(bundle.directory, "preexisting-untracked.tar")],
    fixture,
  ).toString("utf8").split("\n");
  const seen = new Set<string>();
  for (const path of paths) {
    if (path.length === 0) continue;
    if (path.startsWith("/") || path === ".." || path.startsWith("../") || path.includes("/../")) {
      return fail(`unsafe baseline tar path ${path}`);
    }
    if (seen.has(path)) return fail(`duplicate baseline tar path ${path}`);
    seen.add(path);
  }
}

export function materializeBaseline(repoRoot: string, bundle: BaselineBundle): string {
  const fixture = mkdtempSync(join(tmpdir(), "advx-baseline-"));
  try {
    runCommand("git", ["init", "--quiet"], fixture);
    runCommand("git", ["fetch", "--quiet", "--depth=1", repoRoot, bundle.head], fixture);
    runCommand("git", ["checkout", "--quiet", "FETCH_HEAD"], fixture);
    runCommand("git", ["apply", "--cached", join(bundle.directory, "preexisting-index.patch")], fixture);
    runCommand("git", ["checkout-index", "--all", "--force"], fixture);
    runCommand("git", ["apply", join(bundle.directory, "preexisting-worktree.patch")], fixture);
    validateTarPaths(bundle, fixture);
    runCommand("tar", ["-xf", join(bundle.directory, "preexisting-untracked.tar"), "-C", fixture], fixture);
    const status = runCommand(
      "git",
      ["status", "--porcelain=v2", "-z", "--untracked-files=all"],
      fixture,
    );
    const expectedStatus = readFileSync(join(bundle.directory, "preexisting-status.v2"));
    if (!status.equals(expectedStatus)) return fail("baseline artifacts do not reconstruct captured status");
    return fixture;
  } catch (error) {
    rmSync(fixture, { force: true, recursive: true });
    throw error;
  }
}
