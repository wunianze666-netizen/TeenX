import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, valueFlag } from "./lib/advx-cli.ts";
import { executeCli, fail } from "./lib/advx-core.ts";
import { loadHandoffSource, renderHandoff } from "./lib/advx-handoff.ts";
import { parseManifestIdentity, verifyManifest, type CaptureRequest } from "./lib/advx-manifest.ts";

const HELP = `Usage:
  bun run scripts/validate-advx-handoff.ts --plan <approved-plan> --handoff <generated-handoff> --approval-receipt <sha256> --db-baseline <manifest>
`;

await executeCli(() => {
  const parsed = parseArgs(process.argv.slice(2), [
    { name: "--plan", required: true, takesValue: true },
    { name: "--handoff", required: true, takesValue: true },
    { name: "--approval-receipt", required: true, takesValue: true },
    { name: "--db-baseline", required: true, takesValue: true },
  ]);
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  if (parsed.positionals.length > 0) return fail("unexpected positional arguments");
  const receipt = valueFlag(parsed, "--approval-receipt");
  const source = loadHandoffSource(resolve(process.cwd(), valueFlag(parsed, "--plan")), receipt);
  const actual = readFileSync(resolve(process.cwd(), valueFlag(parsed, "--handoff")), "utf8");
  if (actual !== renderHandoff(source)) {
    return fail("handoff bytes differ from deterministic approved-plan output");
  }
  const databasePath = resolve(process.cwd(), valueFlag(parsed, "--db-baseline"));
  const database = parseManifestIdentity(databasePath);
  if (database.scope !== "database") return fail("db baseline manifest has the wrong scope");
  if (database.approvalReceipt !== receipt) return fail("db baseline receipt differs from handoff receipt");
  const databaseRequest: CaptureRequest = {
    approvalReceipt: database.approvalReceipt,
    planPath: database.planPath,
    repoRoot: process.cwd(),
    scope: "database",
    scopeFile: "scripts/advx-arena-community-scope.json",
  };
  verifyManifest(databaseRequest, databasePath);
  for (const marker of ["C1", "C2", "C3", "C4", "C5", "C6", "Must NOT have"]) {
    if (!actual.includes(marker)) return fail(`handoff is missing approved marker ${marker}`);
  }
  process.stdout.write(`PASS ${source.planSha256}\n`);
});
