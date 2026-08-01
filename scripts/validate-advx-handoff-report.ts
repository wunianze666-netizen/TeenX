import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, valueFlag } from "./lib/advx-cli.ts";
import { executeCli, fail, sha256File } from "./lib/advx-core.ts";
import { loadBaselineBundle } from "./lib/advx-baseline.ts";
import { parseManifestIdentity, verifyManifest, type CaptureRequest } from "./lib/advx-manifest.ts";

const HELP = `Usage:
  bun run scripts/validate-advx-handoff-report.ts --report <file> --implementation-manifest <file> --report-manifest <file> --plan <file> --approval-receipt <sha256> --evidence-dir <directory>
`;

await executeCli(() => {
  const parsed = parseArgs(process.argv.slice(2), [
    { name: "--report", required: true, takesValue: true },
    { name: "--implementation-manifest", required: true, takesValue: true },
    { name: "--report-manifest", required: true, takesValue: true },
    { name: "--plan", required: true, takesValue: true },
    { name: "--approval-receipt", required: true, takesValue: true },
    { name: "--evidence-dir", required: true, takesValue: true },
  ]);
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  if (parsed.positionals.length > 0) return fail("unexpected positional arguments");
  const receipt = valueFlag(parsed, "--approval-receipt");
  const planSha256 = sha256File(resolve(process.cwd(), valueFlag(parsed, "--plan")));
  if (receipt !== planSha256) return fail("report receipt differs from live plan SHA-256");
  const implementation = parseManifestIdentity(
    resolve(process.cwd(), valueFlag(parsed, "--implementation-manifest")),
  );
  const reportManifest = parseManifestIdentity(
    resolve(process.cwd(), valueFlag(parsed, "--report-manifest")),
  );
  if (implementation.scope !== "implementation") return fail("implementation manifest has wrong scope");
  if (reportManifest.scope !== "generated-report") return fail("report manifest has wrong scope");
  if (implementation.approvalReceipt !== receipt || reportManifest.approvalReceipt !== receipt) {
    return fail("report manifests differ from approval receipt");
  }
  const evidenceDir = resolve(process.cwd(), valueFlag(parsed, "--evidence-dir"));
  const bundle = loadBaselineBundle(evidenceDir);
  if (bundle.bundleDigest !== implementation.baselineBundleDigest) {
    return fail("implementation manifest is stale against baseline evidence");
  }
  if (bundle.bundleDigest !== reportManifest.baselineBundleDigest) {
    return fail("report manifest is stale against baseline evidence");
  }
  const report = readFileSync(resolve(process.cwd(), valueFlag(parsed, "--report")), "utf8");
  if (!report.includes(receipt) || !report.includes(implementation.manifestId)) {
    return fail("report is stale against the implementation manifest identity");
  }
  for (const identity of [implementation, reportManifest]) {
    const request: CaptureRequest = {
      approvalReceipt: identity.approvalReceipt,
      planPath: identity.planPath,
      repoRoot: process.cwd(),
      scope: identity.scope,
      scopeFile: "scripts/advx-arena-community-scope.json",
    };
    verifyManifest(request, identity === implementation
      ? resolve(process.cwd(), valueFlag(parsed, "--implementation-manifest"))
      : resolve(process.cwd(), valueFlag(parsed, "--report-manifest")));
  }
  for (const marker of [
    "C1", "C2", "C3", "C4", "C5", "C6",
    "Local verification", "Remote CI", "Mock", "Official", "Residual risks",
    "Retention", "Moderation", "single-server", "manual ZIP", "self-attested",
    "protected DeepSeek",
  ]) {
    if (!report.includes(marker)) return fail(`report is missing required evidence marker: ${marker}`);
  }
  process.stdout.write(`PASS ${implementation.manifestId} ${reportManifest.manifestId}\n`);
});
