#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

import {
  launchDemo,
  parseDemoArgs,
  resetDemo,
  resetOwnedDemos,
} from "./lib/advx-demo-launcher.mjs";
import { defaultIsProcessAlive } from "./lib/advx-demo-runtime.mjs";

const USAGE = "Usage: pnpm advx:demo -- --profile prepared_demo|prepared_replay [--reset] [--check] [--no-open]";

async function openDemo(url) {
  let command;
  let args;
  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "cmd.exe";
    args = ["/d", "/s", "/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  await new Promise((resolve, reject) => {
    const opener = spawn(command, args, {
      detached: true,
      shell: false,
      stdio: "ignore",
    });
    opener.once("error", reject);
    opener.once("spawn", () => {
      opener.unref();
      resolve();
    });
  });
}

function waitForShutdown(children, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = (result, error) => {
      clearInterval(interval);
      signal.removeEventListener("abort", stop);
      if (error) reject(error);
      else resolve(result);
    };
    const interval = setInterval(() => {
      const exited = children.find((child) => !defaultIsProcessAlive(child.pid));
      if (exited) finish(undefined, new Error(`ADVX demo ${exited.name} process exited unexpectedly`));
    }, 500);
    const stop = () => finish();
    signal.addEventListener("abort", stop, { once: true });
  });
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const options = parseDemoArgs(process.argv.slice(2));
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let session;
  try {
    if (options.reset) {
      const resetResults = await resetOwnedDemos({ repoRoot });
      const resetCount = resetResults.filter((result) => result === "reset").length;
      process.stdout.write(`Reset ${resetCount} owned ADVX demo session(s).\n`);
    }

    session = await launchDemo({ repoRoot, profile: options.profile, signal: controller.signal });
    const demoUrl = `${session.workspace.uiOrigin}/demo`;
    process.stdout.write(`ADVX demo ready: ${demoUrl}\n`);
    process.stdout.write(`Disposable root: ${session.workspace.root}\n`);
    try {
      if (options.openBrowser && !options.check && !controller.signal.aborted) await openDemo(demoUrl);
      if (!options.check) await waitForShutdown(session.children, controller.signal);
    } finally {
      await resetDemo(session.workspace.root, { repoRoot });
    }
    if (options.check) {
      process.stdout.write("ADVX demo readiness check passed; disposable session removed.\n");
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
  process.exitCode = 1;
});
