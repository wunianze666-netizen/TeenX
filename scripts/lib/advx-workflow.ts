import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fail } from "./advx-core.ts";

type WorkflowJob = {
  readonly name: string;
  readonly lines: readonly string[];
};

function topLevelKeys(lines: readonly string[]): readonly string[] {
  return lines
    .filter((line) => /^[A-Za-z][A-Za-z0-9_-]*:/.test(line))
    .map((line) => line.slice(0, line.indexOf(":")));
}

function workflowJobs(lines: readonly string[]): readonly WorkflowJob[] {
  const jobsStart = lines.findIndex((line) => line === "jobs:");
  if (jobsStart < 0) return fail("workflow is missing jobs:");
  const jobs: WorkflowJob[] = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];
  const flush = (): void => {
    if (currentName !== null) jobs.push({ lines: currentLines, name: currentName });
  };
  for (const line of lines.slice(jobsStart + 1)) {
    if (/^[A-Za-z][A-Za-z0-9_-]*:/.test(line)) break;
    const job = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (job !== null) {
      flush();
      currentName = job[1] ?? null;
      currentLines = [];
    } else if (currentName !== null) {
      currentLines.push(line);
    }
  }
  flush();
  if (jobs.length === 0) return fail("workflow defines no jobs");
  return jobs;
}

export function validateWorkflow(path: string): void {
  const text = readFileSync(path, "utf8");
  if (text.includes("\t")) return fail(`${basename(path)} contains tab indentation`);
  if (/^(<{7}|={7}|>{7})/m.test(text)) return fail(`${basename(path)} contains conflict markers`);
  const lines = text.split("\n").map((line) => line.replace(/\s+$/, ""));
  const keys = topLevelKeys(lines);
  for (const required of ["name", "on", "jobs"]) {
    if (!keys.includes(required)) return fail(`${basename(path)} is missing ${required}:`);
  }
  if (new Set(keys).size !== keys.length) return fail(`${basename(path)} has duplicate top-level keys`);
  for (const job of workflowJobs(lines)) {
    const reusable = job.lines.some((line) => /^    uses:\s*\S+/.test(line));
    if (reusable) continue;
    if (!job.lines.some((line) => /^    runs-on:\s*\S+/.test(line))) {
      return fail(`${basename(path)} job ${job.name} is missing runs-on`);
    }
    if (!job.lines.some((line) => /^    steps:\s*$/.test(line))) {
      return fail(`${basename(path)} job ${job.name} is missing steps`);
    }
  }
}
