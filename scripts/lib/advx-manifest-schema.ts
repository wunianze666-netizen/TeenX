import { assertSha256 } from "./advx-cli.ts";
import { BASELINE_ARTIFACTS } from "./advx-baseline.ts";
import {
  fail,
  requireExactKeys,
  requireField,
  requireNumber,
  requireObject,
  requireString,
} from "./advx-core.ts";
import type { ClassifiedPath, Classification, DeltaStatus, EngineOwnedPath } from "./advx-snapshot.ts";

export type ManifestArtifact = {
  readonly name: string;
  readonly sha256: string;
  readonly byteSize: number;
};

function nullableSha(value: unknown, label: string): string | null {
  if (value === null) return null;
  return assertSha256(requireString(value, label), label);
}

function parseStatus(value: unknown): DeltaStatus {
  if (value === "added" || value === "modified" || value === "deleted" || value === "unchanged") {
    return value;
  }
  return fail("manifest entry has an invalid status");
}

function parseClassification(value: unknown): Classification {
  if (
    value === "preexisting-only" || value === "implementation" ||
    value === "generated-report" || value === "evidence"
  ) return value;
  return fail("manifest entry has an invalid classification");
}

export function parseArtifacts(value: unknown): readonly ManifestArtifact[] {
  if (!Array.isArray(value)) return fail("manifest.baselineArtifacts must be an array");
  const artifacts = value.map((entry, index): ManifestArtifact => {
    const artifact = requireObject(entry, `manifest.baselineArtifacts[${index}]`);
    requireExactKeys(artifact, ["byteSize", "name", "sha256"], "baseline artifact");
    return {
      byteSize: requireNumber(requireField(artifact, "byteSize", "artifact"), "artifact.byteSize"),
      name: requireString(requireField(artifact, "name", "artifact"), "artifact.name"),
      sha256: assertSha256(
        requireString(requireField(artifact, "sha256", "artifact"), "artifact.sha256"),
        "artifact.sha256",
      ),
    };
  });
  const names = new Set(artifacts.map((artifact) => artifact.name));
  if (artifacts.length !== BASELINE_ARTIFACTS.length) return fail("manifest must bind five baseline artifacts");
  for (const name of BASELINE_ARTIFACTS) {
    if (!names.delete(name)) return fail(`manifest is missing baseline artifact ${name}`);
  }
  if (names.size > 0) return fail("manifest contains an unknown baseline artifact");
  return artifacts;
}

export function parseEntries(value: unknown): readonly ClassifiedPath[] {
  if (!Array.isArray(value)) return fail("manifest.entries must be an array");
  return value.map((entry, index): ClassifiedPath => {
    const item = requireObject(entry, `manifest.entries[${index}]`);
    requireExactKeys(
      item,
      ["path", "classification", "status", "baselineSha256", "currentSha256", "executionDeltaDigest"],
      "manifest entry",
    );
    return {
      baselineSha256: nullableSha(requireField(item, "baselineSha256", "entry"), "entry.baselineSha256"),
      classification: parseClassification(requireField(item, "classification", "entry")),
      currentSha256: nullableSha(requireField(item, "currentSha256", "entry"), "entry.currentSha256"),
      executionDeltaDigest: nullableSha(
        requireField(item, "executionDeltaDigest", "entry"),
        "entry.executionDeltaDigest",
      ),
      path: requireString(requireField(item, "path", "entry"), "entry.path"),
      status: parseStatus(requireField(item, "status", "entry")),
    };
  });
}

export function parseEngineRecords(value: unknown): readonly EngineOwnedPath[] {
  if (!Array.isArray(value)) return fail("manifest.engineOwnedRecords must be an array");
  return value.map((entry, index): EngineOwnedPath => {
    const item = requireObject(entry, `manifest.engineOwnedRecords[${index}]`);
    requireExactKeys(item, ["path", "status", "baselineSha256", "currentSha256"], "engine record");
    return {
      baselineSha256: nullableSha(requireField(item, "baselineSha256", "engine"), "engine.baselineSha256"),
      currentSha256: nullableSha(requireField(item, "currentSha256", "engine"), "engine.currentSha256"),
      path: requireString(requireField(item, "path", "engine"), "engine.path"),
      status: parseStatus(requireField(item, "status", "engine")),
    };
  });
}
