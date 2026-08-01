import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parseArgs, requirePositionals } from "./lib/advx-cli.ts";
import { executeCli, fail, relativeRepoPath, walkFiles } from "./lib/advx-core.ts";

const HELP = `Usage:
  bun run scripts/check-advx-ui-tokens.ts <ui-source-directory>
`;

await executeCli(() => {
  const parsed = parseArgs(process.argv.slice(2), []);
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  const positionals = requirePositionals(parsed, 1);
  const input = positionals[0];
  if (input === undefined) return fail("source directory is required");
  const root = resolve(process.cwd(), input);
  const violations: string[] = [];
  for (const path of walkFiles(root)) {
    const extension = extname(path);
    if (extension !== ".ts" && extension !== ".tsx") continue;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/#[0-9a-fA-F]{3,8}\b/.test(line)) {
        violations.push(`${relativeRepoPath(root, path)}:${index + 1}`);
      }
    });
  }
  if (violations.length > 0) return fail(`hex color literals found:\n${violations.join("\n")}`);
  process.stdout.write("PASS no TS/TSX hex color literals\n");
});
