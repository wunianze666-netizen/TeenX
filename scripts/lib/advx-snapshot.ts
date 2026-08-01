import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadBaselineBundle, materializeBaseline, type BaselineBundle } from "./advx-baseline.ts";
import { fail, hashPath, relativeRepoPath, runCommand, sha256Text, walkFiles } from "./advx-core.ts";
import { matchesRules, type PathRules, type ScopeConfig } from "./advx-scope-config.ts";

export type Classification = "preexisting-only" | "implementation" | "generated-report" | "evidence";
export type DeltaStatus = "added" | "modified" | "deleted" | "unchanged";

export type ClassifiedPath = {
  readonly path: string;
  readonly classification: Classification;
  readonly status: DeltaStatus;
  readonly baselineSha256: string | null;
  readonly currentSha256: string | null;
  readonly executionDeltaDigest: string | null;
};

export type EngineOwnedPath = {
  readonly path: string;
  readonly status: DeltaStatus;
  readonly baselineSha256: string | null;
  readonly currentSha256: string | null;
};

export type ClassificationResult = {
  readonly bundle: BaselineBundle;
  readonly paths: readonly ClassifiedPath[];
  readonly engineOwned: readonly EngineOwnedPath[];
};

function gitPaths(root: string): readonly string[] {
  return runCommand(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    root,
  ).toString("utf8").split("\0").filter((path) => path.length > 0);
}

function snapshotPaths(root: string, paths: ReadonlySet<string>): ReadonlyMap<string, string | null> {
  const snapshot = new Map<string, string | null>();
  for (const path of [...paths].sort()) snapshot.set(path, hashPath(join(root, path)));
  return snapshot;
}

function addRuleFiles(root: string, rules: PathRules, paths: Set<string>): void {
  for (const exact of rules.exact) paths.add(exact);
  for (const prefix of rules.prefixes) {
    const directory = resolve(root, prefix);
    if (!existsSync(directory)) continue;
    for (const file of walkFiles(directory)) paths.add(relativeRepoPath(root, file));
  }
}

function deltaStatus(baseline: string | null, current: string | null): DeltaStatus {
  if (baseline === current) return "unchanged";
  if (baseline === null) return "added";
  if (current === null) return "deleted";
  return "modified";
}

function matchingClassifications(path: string, config: ScopeConfig): readonly Classification[] {
  const matches: Classification[] = [];
  if (matchesRules(path, config.implementation)) matches.push("implementation");
  if (matchesRules(path, config.generatedReport)) matches.push("generated-report");
  if (matchesRules(path, config.evidence)) matches.push("evidence");
  return matches;
}

export function classifyRepository(repoRoot: string, config: ScopeConfig): ClassificationResult {
  const bundle = loadBaselineBundle(config.baselineDirectory);
  const baselineRoot = materializeBaseline(repoRoot, bundle);
  try {
    const allPaths = new Set<string>(gitPaths(baselineRoot));
    for (const path of gitPaths(repoRoot)) allPaths.add(path);
    addRuleFiles(repoRoot, config.evidence, allPaths);
    addRuleFiles(repoRoot, config.engineOwned, allPaths);
    const baseline = snapshotPaths(baselineRoot, allPaths);
    const current = snapshotPaths(repoRoot, allPaths);
    const paths: ClassifiedPath[] = [];
    const engineOwned: EngineOwnedPath[] = [];
    for (const path of [...allPaths].sort()) {
      const baselineSha256 = baseline.get(path) ?? null;
      const currentSha256 = current.get(path) ?? null;
      const status = deltaStatus(baselineSha256, currentSha256);
      if (matchesRules(path, config.engineOwned)) {
        engineOwned.push({ baselineSha256, currentSha256, path, status });
        continue;
      }
      if (status === "unchanged") {
        paths.push({
          baselineSha256,
          classification: "preexisting-only",
          currentSha256,
          executionDeltaDigest: null,
          path,
          status,
        });
        continue;
      }
      if (matchesRules(path, config.protectedPaths)) return fail(`protected path changed: ${path}`);
      const matches = matchingClassifications(path, config);
      if (matches.length === 0) return fail(`unclassified execution delta: ${path}`);
      if (matches.length > 1) return fail(`overlapping execution-delta classifications: ${path}`);
      const classification = matches[0];
      if (classification === undefined) return fail(`classification disappeared for ${path}`);
      paths.push({
        baselineSha256,
        classification,
        currentSha256,
        executionDeltaDigest: sha256Text(
          `${path}\0${baselineSha256 ?? "-"}\0${currentSha256 ?? "-"}`,
        ),
        path,
        status,
      });
    }
    return { bundle, engineOwned, paths };
  } finally {
    rmSync(baselineRoot, { force: true, recursive: true });
  }
}
