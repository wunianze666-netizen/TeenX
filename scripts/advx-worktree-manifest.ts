import { resolve } from "node:path";
import { optionalValueFlag, parseArgs, valueFlag } from "./lib/advx-cli.ts";
import { executeCli, fail } from "./lib/advx-core.ts";
import {
  captureManifest,
  manifestPlanPath,
  manifestReceipt,
  parseManifestIdentity,
  parseManifestScope,
  verifyManifest,
  type CaptureRequest,
} from "./lib/advx-manifest.ts";

const HELP = `Usage:
  bun run scripts/advx-worktree-manifest.ts capture --scope <implementation|generated-report|database> --scope-file <file> --plan <file> --approval-receipt <sha256> --out <file>
  bun run scripts/advx-worktree-manifest.ts verify --scope <scope> --expected <file> [--scope-file <file>] [--plan <file>] [--approval-receipt <sha256>] [--protected-baseline <file>] [--db-baseline <file>]
`;

const SPECS = [
  { name: "--scope", required: true, takesValue: true },
  { name: "--scope-file", required: false, takesValue: true },
  { name: "--plan", required: false, takesValue: true },
  { name: "--approval-receipt", required: false, takesValue: true },
  { name: "--out", required: false, takesValue: true },
  { name: "--expected", required: false, takesValue: true },
  { name: "--protected-baseline", required: false, takesValue: true },
  { name: "--db-baseline", required: false, takesValue: true },
] as const;

await executeCli(() => {
  const raw = process.argv.slice(2);
  if (raw.includes("--help") || raw.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }
  const command = raw[0];
  if (command !== "capture" && command !== "verify") return fail("expected capture or verify command");
  const parsed = parseArgs(raw.slice(1), SPECS);
  if (parsed.positionals.length > 0) return fail("unexpected positional arguments");
  const scope = parseManifestScope(valueFlag(parsed, "--scope"));
  const scopeFile = optionalValueFlag(parsed, "--scope-file") ?? "scripts/advx-arena-community-scope.json";
  if (command === "capture") {
    const request: CaptureRequest = {
      approvalReceipt: valueFlag(parsed, "--approval-receipt"),
      planPath: valueFlag(parsed, "--plan"),
      repoRoot: process.cwd(),
      scope,
      scopeFile,
    };
    const identity = captureManifest(
      request,
      resolve(process.cwd(), valueFlag(parsed, "--out")),
    );
    process.stdout.write(`${JSON.stringify(identity)}\n`);
    return;
  }
  const expectedPath = resolve(process.cwd(), valueFlag(parsed, "--expected"));
  const expected = parseManifestIdentity(expectedPath);
  const request: CaptureRequest = {
    approvalReceipt: optionalValueFlag(parsed, "--approval-receipt") ?? manifestReceipt(expectedPath),
    planPath: optionalValueFlag(parsed, "--plan") ?? manifestPlanPath(expectedPath),
    repoRoot: process.cwd(),
    scope,
    scopeFile,
  };
  verifyManifest(request, expectedPath);
  for (const option of ["--protected-baseline", "--db-baseline"] as const) {
    const path = optionalValueFlag(parsed, option);
    if (path === null) continue;
    const absolute = resolve(process.cwd(), path);
    const identity = parseManifestIdentity(absolute);
    const baselineRequest: CaptureRequest = {
      approvalReceipt: identity.approvalReceipt,
      planPath: identity.planPath,
      repoRoot: process.cwd(),
      scope: identity.scope,
      scopeFile,
    };
    verifyManifest(baselineRequest, absolute);
  }
  process.stdout.write(`PASS ${expected.manifestId}\n`);
});
