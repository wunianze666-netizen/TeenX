import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  booleanFlag,
  optionalValueFlag,
  parseArgs,
  valueFlag,
} from "./lib/advx-cli.ts";
import { atomicWrite, executeCli, fail, sha256File, sha256Text } from "./lib/advx-core.ts";
import { parseManifestIdentity } from "./lib/advx-manifest.ts";
import { loadScopeConfig } from "./lib/advx-scope-config.ts";
import { classifyRepository } from "./lib/advx-snapshot.ts";

const HELP = `Usage:
  bun run scripts/validate-advx-scope.ts --scope <scope-config> [--classify-all-deltas] [--plan <file>] [--handoff <file>] [--implementation-manifest <file>] [--report-manifest <file>] --out <report>
`;

await executeCli(() => {
  const parsed = parseArgs(process.argv.slice(2), [
    { name: "--scope", required: true, takesValue: true },
    { name: "--classify-all-deltas", required: false, takesValue: false },
    { name: "--plan", required: false, takesValue: true },
    { name: "--handoff", required: false, takesValue: true },
    { name: "--implementation-manifest", required: false, takesValue: true },
    { name: "--report-manifest", required: false, takesValue: true },
    { name: "--out", required: true, takesValue: true },
  ]);
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  if (parsed.positionals.length > 0) return fail("unexpected positional arguments");
  const scopePath = resolve(process.cwd(), valueFlag(parsed, "--scope"));
  const config = loadScopeConfig(scopePath);
  const result = classifyRepository(process.cwd(), config);
  const plan = optionalValueFlag(parsed, "--plan");
  const handoff = optionalValueFlag(parsed, "--handoff");
  if ((plan === null) !== (handoff === null)) return fail("--plan and --handoff must be supplied together");
  if (plan !== null && handoff !== null) {
    const planSha = sha256File(resolve(process.cwd(), plan));
    const handoffText = readFileSync(resolve(process.cwd(), handoff), "utf8");
    if (!handoffText.includes(planSha)) return fail("handoff is not bound to the supplied plan");
  }
  const manifestPaths = [
    optionalValueFlag(parsed, "--implementation-manifest"),
    optionalValueFlag(parsed, "--report-manifest"),
  ].filter((path): path is string => path !== null);
  const manifestIds = manifestPaths.map((path) => parseManifestIdentity(resolve(process.cwd(), path)).manifestId);
  const body = {
    baselineArtifacts: result.bundle.artifacts.map((artifact) => ({
      byteSize: artifact.byteSize,
      name: artifact.name,
      sha256: artifact.sha256,
    })),
    baselineBundleDigest: result.bundle.bundleDigest,
    classifyAllDeltas: booleanFlag(parsed, "--classify-all-deltas"),
    engineOwnedRecords: result.engineOwned,
    manifestIds,
    paths: result.paths,
    schemaVersion: 1,
    scopeFileSha256: sha256File(scopePath),
  };
  const report = { body, scopeReportId: sha256Text(JSON.stringify(body)) };
  atomicWrite(resolve(process.cwd(), valueFlag(parsed, "--out")), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`PASS ${report.scopeReportId}\n`);
});
