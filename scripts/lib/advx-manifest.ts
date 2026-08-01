import { rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { assertSha256 } from "./advx-cli.ts";
import {
  atomicWrite,
  fail,
  parseJsonFile,
  requireExactKeys,
  requireField,
  requireNumber,
  requireString,
  sha256File,
  sha256Text,
} from "./advx-core.ts";
import { loadScopeConfig, matchesRules, type PathRules } from "./advx-scope-config.ts";
import {
  classifyRepository,
  type ClassifiedPath,
  type EngineOwnedPath,
} from "./advx-snapshot.ts";
import {
  parseArtifacts,
  parseEngineRecords,
  parseEntries,
  type ManifestArtifact,
} from "./advx-manifest-schema.ts";

export type ManifestScope = "implementation" | "generated-report" | "database";

export type ManifestIdentity = {
  readonly schemaVersion: 1;
  readonly scope: ManifestScope;
  readonly manifestId: string;
  readonly planPath: string;
  readonly planSha256: string;
  readonly approvalReceipt: string;
  readonly baselineBundleDigest: string;
};

type ManifestBody = {
  readonly schemaVersion: 1;
  readonly scope: ManifestScope;
  readonly planPath: string;
  readonly planSha256: string;
  readonly approvalReceipt: string;
  readonly baselineHead: string;
  readonly baselineBundleDigest: string;
  readonly baselineArtifacts: readonly ManifestArtifact[];
  readonly engineOwnedRecords: readonly EngineOwnedPath[];
  readonly entries: readonly ClassifiedPath[];
};

export type CaptureRequest = {
  readonly repoRoot: string;
  readonly scope: ManifestScope;
  readonly scopeFile: string;
  readonly planPath: string;
  readonly approvalReceipt: string;
};

export function parseManifestScope(value: string): ManifestScope {
  if (value === "implementation" || value === "generated-report" || value === "database") {
    return value;
  }
  return fail(`unknown manifest scope ${value}`);
}

function validatePlan(planPath: string, receipt: string): string {
  assertSha256(receipt, "approval receipt");
  const sha256 = sha256File(planPath);
  return sha256 === receipt
    ? sha256
    : fail("approval receipt does not match the live plan SHA-256");
}

function selectEntries(
  scope: ManifestScope,
  all: readonly ClassifiedPath[],
  databaseRules: PathRules,
): readonly ClassifiedPath[] {
  if (scope === "implementation") return all.filter((entry) => entry.classification === "implementation");
  if (scope === "generated-report") return all.filter((entry) => entry.classification === "generated-report");
  return all.filter((entry) => matchesRules(entry.path, databaseRules));
}

export function buildManifest(request: CaptureRequest): string {
  const planSha256 = validatePlan(
    resolve(request.repoRoot, request.planPath),
    request.approvalReceipt,
  );
  const config = loadScopeConfig(resolve(request.repoRoot, request.scopeFile));
  const classified = classifyRepository(request.repoRoot, config);
  const body: ManifestBody = {
    approvalReceipt: request.approvalReceipt,
    baselineArtifacts: classified.bundle.artifacts.map((artifact) => ({
      byteSize: artifact.byteSize,
      name: artifact.name,
      sha256: artifact.sha256,
    })),
    baselineBundleDigest: classified.bundle.bundleDigest,
    baselineHead: classified.bundle.head,
    engineOwnedRecords: classified.engineOwned,
    entries: selectEntries(request.scope, classified.paths, config.protectedPaths),
    planPath: request.planPath,
    planSha256,
    schemaVersion: 1,
    scope: request.scope,
  };
  const manifestId = sha256Text(JSON.stringify(body));
  const manifest = {
    approvalReceipt: body.approvalReceipt,
    baselineArtifacts: body.baselineArtifacts,
    baselineBundleDigest: body.baselineBundleDigest,
    baselineHead: body.baselineHead,
    engineOwnedRecords: body.engineOwnedRecords,
    entries: body.entries,
    manifestId,
    planPath: body.planPath,
    planSha256: body.planSha256,
    schemaVersion: body.schemaVersion,
    scope: body.scope,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function captureManifest(request: CaptureRequest, output: string): ManifestIdentity {
  atomicWrite(output, buildManifest(request));
  return parseManifestIdentity(output);
}

export function parseManifestIdentity(path: string): ManifestIdentity {
  const manifest = parseJsonFile(path, "manifest");
  const keys = [
    "schemaVersion", "scope", "manifestId", "planPath", "planSha256", "approvalReceipt",
    "baselineHead", "baselineBundleDigest", "baselineArtifacts", "entries", "engineOwnedRecords",
  ];
  requireExactKeys(manifest, keys, "manifest");
  if (requireNumber(requireField(manifest, "schemaVersion", "manifest"), "manifest.schemaVersion") !== 1) {
    return fail("manifest schemaVersion must be 1");
  }
  const scope = parseManifestScope(requireString(requireField(manifest, "scope", "manifest"), "manifest.scope"));
  const manifestId = assertSha256(
    requireString(requireField(manifest, "manifestId", "manifest"), "manifest.manifestId"),
    "manifest.manifestId",
  );
  const approvalReceipt = assertSha256(
    requireString(requireField(manifest, "approvalReceipt", "manifest"), "manifest.approvalReceipt"),
    "manifest.approvalReceipt",
  );
  const baselineBundleDigest = assertSha256(
    requireString(requireField(manifest, "baselineBundleDigest", "manifest"), "manifest.baselineBundleDigest"),
    "manifest.baselineBundleDigest",
  );
  const planSha256 = assertSha256(
    requireString(requireField(manifest, "planSha256", "manifest"), "manifest.planSha256"),
    "manifest.planSha256",
  );
  const baselineArtifacts = parseArtifacts(requireField(manifest, "baselineArtifacts", "manifest"));
  const computedBundleDigest = sha256Text(baselineArtifacts
    .map((artifact) => `${artifact.name}\0${artifact.sha256}\0${artifact.byteSize}\n`)
    .sort()
    .join(""));
  if (computedBundleDigest !== baselineBundleDigest) return fail("baseline bundle digest is invalid");
  const entries = parseEntries(requireField(manifest, "entries", "manifest"));
  const engineOwnedRecords = parseEngineRecords(requireField(manifest, "engineOwnedRecords", "manifest"));
  const body: ManifestBody = {
    approvalReceipt,
    baselineArtifacts,
    baselineBundleDigest,
    baselineHead: requireString(requireField(manifest, "baselineHead", "manifest"), "manifest.baselineHead"),
    engineOwnedRecords,
    entries,
    planPath: requireString(requireField(manifest, "planPath", "manifest"), "manifest.planPath"),
    planSha256,
    schemaVersion: 1,
    scope,
  };
  if (sha256Text(JSON.stringify(body)) !== manifestId) return fail("manifestId does not match manifest content");
  return {
    approvalReceipt,
    baselineBundleDigest,
    manifestId,
    planPath: body.planPath,
    planSha256,
    schemaVersion: 1,
    scope,
  };
}

export function verifyManifest(request: CaptureRequest, expectedPath: string): ManifestIdentity {
  const expected = parseManifestIdentity(expectedPath);
  if (expected.scope !== request.scope) return fail("expected manifest has the wrong scope");
  const temporary = join(tmpdir(), `advx-manifest-verify-${process.pid}-${Date.now()}.json`);
  try {
    writeFileSync(temporary, buildManifest(request), { flag: "wx", mode: 0o600 });
    const actual = parseManifestIdentity(temporary);
    if (actual.manifestId !== expected.manifestId) return fail("manifest identity drift detected");
    return actual;
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function manifestReceipt(path: string): string {
  return parseManifestIdentity(path).approvalReceipt;
}

export function manifestPlanPath(path: string): string {
  return parseManifestIdentity(path).planPath;
}
