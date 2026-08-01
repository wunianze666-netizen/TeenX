import { readFileSync } from "node:fs";
import { assertSha256 } from "./advx-cli.ts";
import { fail, sha256File, sha256Text } from "./advx-core.ts";

const APPROVED_SECTIONS = [
  "Scope",
  "Verification strategy",
  "Execution strategy",
  "Success criteria",
] as const;

export type HandoffSource = {
  readonly planSha256: string;
  readonly approvalReceipt: string;
  readonly contents: string;
};

function extractSection(plan: string, name: string): string {
  const marker = `## ${name}`;
  const start = plan.indexOf(marker);
  if (start < 0) return fail(`approved plan section is missing: ${name}`);
  const next = plan.indexOf("\n## ", start + marker.length);
  const end = next < 0 ? plan.length : next + 1;
  return plan.slice(start, end).trimEnd();
}

export function loadHandoffSource(planPath: string, receipt: string): HandoffSource {
  const approvalReceipt = assertSha256(receipt, "approval receipt");
  const planSha256 = sha256File(planPath);
  if (planSha256 !== approvalReceipt) return fail("approval receipt does not match plan SHA-256");
  return { approvalReceipt, contents: readFileSync(planPath, "utf8"), planSha256 };
}

export function renderHandoff(source: HandoffSource): string {
  const sections = APPROVED_SECTIONS.map((name) => {
    const contents = extractSection(source.contents, name);
    const digest = sha256Text(contents);
    return `<!-- BEGIN APPROVED PLAN SECTION: ${name}; SHA256: ${digest} -->\n${contents}\n<!-- END APPROVED PLAN SECTION: ${name} -->`;
  });
  return [
    "# ADVX Handoff 12 - Arena Community Competition",
    "",
    "<!-- ADVX_DETERMINISTIC_HANDOFF_V1 -->",
    `- Approval receipt: \`${source.approvalReceipt}\``,
    `- Plan SHA-256: \`${source.planSha256}\``,
    "- Provenance: copied approved plan sections only",
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n");
}
