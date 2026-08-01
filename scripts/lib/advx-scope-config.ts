import { resolve } from "node:path";
import {
  fail,
  parseJsonFile,
  requireExactKeys,
  requireField,
  requireNumber,
  requireString,
  requireStringArray,
} from "./advx-core.ts";

export type PathRules = {
  readonly exact: readonly string[];
  readonly prefixes: readonly string[];
};

export type ScopeConfig = {
  readonly baselineDirectory: string;
  readonly evidenceDirectory: string;
  readonly implementation: PathRules;
  readonly generatedReport: PathRules;
  readonly evidence: PathRules;
  readonly engineOwned: PathRules;
  readonly protectedPaths: PathRules;
};

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function readRules(config: object, exactKey: string, prefixKey: string): PathRules {
  return {
    exact: requireStringArray(requireField(config, exactKey, "scope"), `scope.${exactKey}`).map(normalizePath),
    prefixes: requireStringArray(requireField(config, prefixKey, "scope"), `scope.${prefixKey}`).map(normalizePath),
  };
}

export function loadScopeConfig(path: string): ScopeConfig {
  const config = parseJsonFile(path, "scope config");
  const keys = [
    "schemaVersion", "baselineDirectory", "evidenceDirectory",
    "implementationExact", "implementationPrefixes",
    "generatedReportExact", "generatedReportPrefixes",
    "evidenceExact", "evidencePrefixes",
    "engineOwnedExact", "engineOwnedPrefixes",
    "protectedExact", "protectedPrefixes",
  ];
  requireExactKeys(config, keys, "scope config");
  if (requireNumber(requireField(config, "schemaVersion", "scope"), "scope.schemaVersion") !== 1) {
    return fail("scope schemaVersion must be 1");
  }
  const baselineDirectory = requireString(
    requireField(config, "baselineDirectory", "scope"),
    "scope.baselineDirectory",
  );
  return {
    baselineDirectory: resolve(process.cwd(), baselineDirectory),
    engineOwned: readRules(config, "engineOwnedExact", "engineOwnedPrefixes"),
    evidence: readRules(config, "evidenceExact", "evidencePrefixes"),
    evidenceDirectory: normalizePath(requireString(
      requireField(config, "evidenceDirectory", "scope"),
      "scope.evidenceDirectory",
    )),
    generatedReport: readRules(config, "generatedReportExact", "generatedReportPrefixes"),
    implementation: readRules(config, "implementationExact", "implementationPrefixes"),
    protectedPaths: readRules(config, "protectedExact", "protectedPrefixes"),
  };
}

export function matchesRules(path: string, rules: PathRules): boolean {
  return rules.exact.includes(path) || rules.prefixes.some((prefix) => path.startsWith(prefix));
}
