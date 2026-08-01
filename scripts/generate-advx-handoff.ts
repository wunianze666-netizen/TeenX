import { resolve } from "node:path";
import { parseArgs, valueFlag } from "./lib/advx-cli.ts";
import { atomicWrite, executeCli, fail } from "./lib/advx-core.ts";
import { loadHandoffSource, renderHandoff } from "./lib/advx-handoff.ts";

const HELP = `Usage:
  bun run scripts/generate-advx-handoff.ts --plan <approved-plan> --approval-receipt <sha256> --out <handoff>
`;

await executeCli(() => {
  const parsed = parseArgs(process.argv.slice(2), [
    { name: "--plan", required: true, takesValue: true },
    { name: "--approval-receipt", required: true, takesValue: true },
    { name: "--out", required: true, takesValue: true },
  ]);
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  if (parsed.positionals.length > 0) return fail("unexpected positional arguments");
  const source = loadHandoffSource(
    resolve(process.cwd(), valueFlag(parsed, "--plan")),
    valueFlag(parsed, "--approval-receipt"),
  );
  atomicWrite(resolve(process.cwd(), valueFlag(parsed, "--out")), renderHandoff(source));
});
