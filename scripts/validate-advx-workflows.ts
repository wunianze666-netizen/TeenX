import { extname, resolve } from "node:path";
import { parseArgs, requirePositionals } from "./lib/advx-cli.ts";
import { executeCli, fail, walkFiles } from "./lib/advx-core.ts";
import { validateWorkflow } from "./lib/advx-workflow.ts";

const HELP = `Usage:
  bun run scripts/validate-advx-workflows.ts <github-workflow-directory>
`;

await executeCli(() => {
  const parsed = parseArgs(process.argv.slice(2), []);
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  const positionals = requirePositionals(parsed, 1);
  const input = positionals[0];
  if (input === undefined) return fail("workflow directory is required");
  const files = walkFiles(resolve(process.cwd(), input)).filter((path) => {
    const extension = extname(path);
    return extension === ".yml" || extension === ".yaml";
  });
  if (files.length === 0) return fail("workflow directory contains no YAML workflows");
  for (const file of files) validateWorkflow(file);
  process.stdout.write(`PASS ${files.length} workflows\n`);
});
