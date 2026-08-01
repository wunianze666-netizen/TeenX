import { lstat, readFile, readdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  DemoOwnershipError,
  allocateDemoPorts,
  probeDemoReadiness,
  spawnOwnedChild,
  stopOwnedChildren,
  waitForDemoReadiness,
} from "./advx-demo-runtime.mjs";
import {
  createDemoWorkspace,
  DEMO_MANIFEST_VERSION,
  DEMO_ROOT_PREFIX,
  writeDemoJsonAtomic,
} from "./advx-demo-workspace.mjs";

export {
  createDemoWorkspace,
  DemoOwnershipError,
  allocateDemoPorts,
  probeDemoReadiness,
  waitForDemoReadiness,
};

export class DemoUsageError extends Error {
  name = "DemoUsageError";
}

export function parseDemoArgs(argumentsList) {
  const options = { profile: undefined, reset: false, check: false, openBrowser: true };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--") {
      continue;
    } else if (argument === "--profile") {
      options.profile = argumentsList[index + 1];
      index += 1;
    } else if (argument === "--reset") {
      options.reset = true;
    } else if (argument === "--check") {
      options.check = true;
    } else if (argument === "--no-open") {
      options.openBrowser = false;
    } else {
      throw new DemoUsageError(`Unknown ADVX demo argument: ${argument ?? "<missing>"}`);
    }
  }
  if (options.profile !== "prepared_demo" && options.profile !== "prepared_replay") {
    throw new DemoUsageError("--profile must be prepared_demo|prepared_replay");
  }
  return options;
}

function isMissing(error) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

export async function writeDemoManifest(workspace, children) {
  await writeDemoJsonAtomic(workspace.manifestPath, {
    version: DEMO_MANIFEST_VERSION,
    root: workspace.root,
    nonce: workspace.nonce,
    repoRoot: workspace.repoRoot,
    profile: workspace.profile,
    ports: workspace.ports,
    children,
  });
}

function assertManifestOwnership(root, repoRoot, marker, manifest) {
  const childrenAreOwnedRecords = Array.isArray(manifest?.children) && manifest.children.every((child) =>
    child &&
    typeof child.name === "string" &&
    Number.isInteger(child.pid) && child.pid > 0 &&
    typeof child.command === "string" && child.command.length > 0 &&
    Array.isArray(child.args) && child.args.every((argument) => typeof argument === "string") &&
    child.cwd === repoRoot,
  );
  const valid = marker?.version === DEMO_MANIFEST_VERSION &&
    manifest?.version === DEMO_MANIFEST_VERSION &&
    marker.root === root && manifest.root === root &&
    marker.nonce === manifest.nonce &&
    marker.repoRoot === repoRoot && manifest.repoRoot === repoRoot &&
    childrenAreOwnedRecords;
  if (!valid) throw new DemoOwnershipError(`Refusing foreign ADVX demo root ${root}`);
}

export async function resetDemo(rootInput, dependencies = {}) {
  const root = path.resolve(rootInput);
  const tempParent = path.resolve(dependencies.tempParent ?? os.tmpdir());
  if (!root.startsWith(`${tempParent}${path.sep}`) || !path.basename(root).startsWith(DEMO_ROOT_PREFIX)) {
    throw new DemoOwnershipError(`Refusing non-demo root ${root}`);
  }
  let stats;
  try {
    stats = await lstat(root);
  } catch (error) {
    if (isMissing(error)) return "absent";
    throw error;
  }
  const resolvedTempParent = await realpath(tempParent);
  const resolvedRoot = await realpath(root);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    !resolvedRoot.startsWith(`${resolvedTempParent}${path.sep}`)
  ) {
    throw new DemoOwnershipError(`Refusing unsafe ADVX demo root ${root}`);
  }
  let marker;
  let manifest;
  try {
    [marker, manifest] = await Promise.all([
      readFile(path.join(root, ".advx-demo-owner.json"), "utf8").then(JSON.parse),
      readFile(path.join(root, "advx-demo-manifest.json"), "utf8").then(JSON.parse),
    ]);
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) throw new DemoOwnershipError(`Refusing unmarked ADVX demo root ${root}`);
    throw error;
  }
  assertManifestOwnership(root, path.resolve(dependencies.repoRoot), marker, manifest);
  await stopOwnedChildren(manifest.children, dependencies);
  await rm(root, { recursive: true });
  return "reset";
}

export async function resetOwnedDemos({ repoRoot, tempParent = os.tmpdir() }, dependencies = {}) {
  const entries = await readdir(tempParent, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(DEMO_ROOT_PREFIX)) continue;
    const root = path.join(tempParent, entry.name);
    try {
      results.push(await resetDemo(root, { ...dependencies, repoRoot, tempParent }));
    } catch (error) {
      if (!(error instanceof DemoOwnershipError)) throw error;
      results.push("refused");
    }
  }
  return results;
}

function processSpecifications(workspace) {
  const nonceMode = `advx-demo-${workspace.nonce}`;
  return [
    {
      name: "api",
      command: "pnpm",
      args: ["--filter", "@paperclipai/server", "exec", "tsx", "src/index.ts", `--advx-demo-nonce=${workspace.nonce}`],
      cwd: workspace.repoRoot,
      env: workspace.env,
    },
    {
      name: "ui",
      command: "pnpm",
      args: ["--filter", "@advx/ui", "exec", "vite", "--host", "127.0.0.1", "--port", String(workspace.ports.ui), "--strictPort", "--mode", nonceMode],
      cwd: workspace.repoRoot,
      env: workspace.env,
    },
  ];
}

export async function launchDemo(input, dependencies = {}) {
  const allocatePorts = dependencies.allocatePorts ?? allocateDemoPorts;
  const spawnChild = dependencies.spawnChild ?? spawnOwnedChild;
  const waitForReadiness = dependencies.waitForReadiness ?? waitForDemoReadiness;
  const writeManifest = dependencies.writeManifest ?? writeDemoManifest;
  const ports = await allocatePorts();
  const workspace = await createDemoWorkspace({ ...input, ports });
  const children = [];
  try {
    await writeManifest(workspace, children);
    for (const specification of processSpecifications(workspace)) {
      children.push(await spawnChild(specification));
      await writeManifest(workspace, children);
    }
    await waitForReadiness({ workspace, children, timeoutMs: input.timeoutMs, signal: input.signal }, dependencies);
    return { workspace, children };
  } catch (error) {
    try {
      await stopOwnedChildren(children, dependencies);
      await rm(workspace.root, { recursive: true });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "ADVX demo launch and cleanup both failed");
    }
    throw error;
  }
}
