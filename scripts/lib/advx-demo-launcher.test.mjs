import assert from "node:assert/strict";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DemoOwnershipError,
  allocateDemoPorts,
  createDemoWorkspace,
  launchDemo,
  parseDemoArgs,
  probeDemoReadiness,
  resetDemo,
  waitForDemoReadiness,
  writeDemoManifest,
} from "./advx-demo-launcher.mjs";
import { defaultIsProcessGroupAlive } from "./advx-demo-runtime.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

test("parseDemoArgs accepts prepared profiles and lifecycle flags", () => {
  // Given
  const argumentsList = ["--", "--profile", "prepared_replay", "--reset", "--check", "--no-open"];

  // When
  const options = parseDemoArgs(argumentsList);

  // Then
  assert.deepEqual(options, {
    profile: "prepared_replay",
    reset: true,
    check: true,
    openBrowser: false,
  });
});

test("parseDemoArgs rejects a profile outside the prepared contract", () => {
  // Given
  const argumentsList = ["--profile", "real"];

  // When / Then
  assert.throws(() => parseDemoArgs(argumentsList), /prepared_demo\|prepared_replay/);
});

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

test("allocateDemoPorts retries collisions and returns three unique dynamic ports", async () => {
  // Given
  const candidates = [43101, 43101, 43102, 43103];

  // When
  const ports = await allocateDemoPorts({ reservePort: async () => candidates.shift() });

  // Then
  assert.deepEqual(ports, { api: 43101, ui: 43102, database: 43103 });
});

test("createDemoWorkspace isolates every local runtime path and removes inherited external targets", async (t) => {
  // Given
  const tempParent = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), "advx-demo-test-parent-")),
  );
  t.after(() => rm(tempParent, { recursive: true, force: true }));

  // When
  const workspace = await createDemoWorkspace({
    repoRoot: REPO_ROOT,
    profile: "prepared_demo",
    tempParent,
    nonce: "workspace-nonce",
    ports: { api: 43111, ui: 43112, database: 43113 },
    baseEnv: {
      PATH: "/usr/bin",
      HOME: "/Users/example",
      OPENAI_API_KEY: "must-not-reach-demo",
      GH_TOKEN: "must-not-reach-demo",
      DATABASE_URL: "postgres://external.invalid/paperclip",
      PAPERCLIP_STORAGE_PROVIDER: "s3",
      PAPERCLIP_STORAGE_S3_ENDPOINT: "https://external.invalid",
    },
  });
  const config = JSON.parse(await readFile(workspace.configPath, "utf8"));

  // Then
  assert.equal(workspace.root.startsWith(`${tempParent}${path.sep}`), true);
  assert.equal(workspace.env.HOME, path.join(workspace.root, "home"));
  assert.equal(workspace.env.PAPERCLIP_HOME, workspace.paperclipHome);
  assert.equal(workspace.env.PAPERCLIP_INSTANCE_ID, workspace.instanceId);
  assert.equal(workspace.env.DATABASE_URL, undefined);
  assert.equal(workspace.env.OPENAI_API_KEY, undefined);
  assert.equal(workspace.env.GH_TOKEN, undefined);
  assert.equal(workspace.env.PAPERCLIP_STORAGE_S3_ENDPOINT, undefined);
  assert.equal(workspace.env.PAPERCLIP_DEPLOYMENT_MODE, "local_trusted");
  assert.equal(workspace.env.PAPERCLIP_DEPLOYMENT_EXPOSURE, "private");
  assert.equal(workspace.env.PAPERCLIP_BIND, "loopback");
  assert.equal(workspace.env.HEARTBEAT_SCHEDULER_ENABLED, "false");
  assert.equal(config.database.mode, "embedded-postgres");
  assert.equal(config.database.embeddedPostgresPort, 43113);
  assert.equal(config.storage.provider, "local_disk");
});

test("resetDemo refuses a root whose marker nonce does not match its manifest", async (t) => {
  // Given
  const workspace = await createDemoWorkspace({
    repoRoot: REPO_ROOT,
    profile: "prepared_demo",
    nonce: "owned-nonce",
    ports: { api: 43121, ui: 43122, database: 43123 },
  });
  t.after(() => rm(workspace.root, { recursive: true, force: true }));
  await writeDemoManifest(workspace, []);
  const marker = JSON.parse(await readFile(workspace.markerPath, "utf8"));
  await writeFile(workspace.markerPath, `${JSON.stringify({ ...marker, nonce: "foreign-nonce" })}\n`);

  // When / Then
  await assert.rejects(
    resetDemo(workspace.root, { repoRoot: REPO_ROOT }),
    DemoOwnershipError,
  );
  assert.equal(await pathExists(workspace.root), true);
});

test("resetDemo refuses a live PID when command ownership does not match", async (t) => {
  // Given
  const workspace = await createDemoWorkspace({
    repoRoot: REPO_ROOT,
    profile: "prepared_replay",
    nonce: "pid-nonce",
    ports: { api: 43131, ui: 43132, database: 43133 },
  });
  t.after(() => rm(workspace.root, { recursive: true, force: true }));
  await writeDemoManifest(workspace, [{
    name: "api",
    pid: 90210,
    command: "pnpm",
    args: ["--mode", "advx-demo-pid-nonce"],
    cwd: REPO_ROOT,
  }]);
  const signals = [];

  // When / Then
  await assert.rejects(
    resetDemo(workspace.root, {
      repoRoot: REPO_ROOT,
      isProcessAlive: () => true,
      inspectProcess: async () => ({ commandLine: "pnpm unrelated-command", cwd: REPO_ROOT }),
      killProcessGroup: (pid, signal) => signals.push([pid, signal]),
    }),
    DemoOwnershipError,
  );
  assert.deepEqual(signals, []);
  assert.equal(await pathExists(workspace.root), true);
});

test("resetDemo stops an owned process group, removes its root, and is idempotent", async () => {
  // Given
  const workspace = await createDemoWorkspace({
    repoRoot: REPO_ROOT,
    profile: "prepared_demo",
    nonce: "reset-nonce",
    ports: { api: 43141, ui: 43142, database: 43143 },
  });
  const child = {
    name: "ui",
    pid: 90211,
    command: "pnpm",
    args: ["--mode", "advx-demo-reset-nonce"],
    cwd: REPO_ROOT,
  };
  await writeDemoManifest(workspace, [child]);
  const signals = [];
  let alive = true;
  const dependencies = {
    repoRoot: REPO_ROOT,
    isProcessAlive: () => alive,
    isProcessGroupAlive: () => alive,
    inspectProcess: async () => ({ commandLine: `${child.command} ${child.args.join(" ")}`, cwd: child.cwd }),
    killProcessGroup: (pid, signal) => {
      signals.push([pid, signal]);
      alive = false;
    },
    sleep: async () => {},
  };

  // When
  const first = await resetDemo(workspace.root, dependencies);
  const second = await resetDemo(workspace.root, dependencies);

  // Then
  assert.equal(first, "reset");
  assert.equal(second, "absent");
  assert.deepEqual(signals, [[90211, "SIGTERM"]]);
  assert.equal(await pathExists(workspace.root), false);
});

test("launchDemo cleans every started child and the temp root when readiness fails", async () => {
  // Given
  const tempParent = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), "advx-demo-failure-parent-")),
  );
  const spawned = [];
  const signals = [];
  let workspaceRoot;

  // When / Then
  await assert.rejects(
    launchDemo(
      { repoRoot: REPO_ROOT, profile: "prepared_demo", tempParent, nonce: "failure-nonce" },
      {
        allocatePorts: async () => ({ api: 43151, ui: 43152, database: 43153 }),
        spawnChild: async (specification) => {
          spawned.push({ ...specification, pid: 90300 + spawned.length });
          return spawned.at(-1);
        },
        waitForReadiness: async ({ workspace }) => {
          workspaceRoot = workspace.root;
          throw new Error("synthetic readiness failure");
        },
        isProcessAlive: () => true,
        isProcessGroupAlive: () => false,
        inspectProcess: async (pid) => {
          const child = spawned.find((candidate) => candidate.pid === pid);
          return { commandLine: `${child.command} ${child.args.join(" ")}`, cwd: child.cwd };
        },
        killProcessGroup: (pid, signal) => signals.push([pid, signal]),
        sleep: async () => {},
      },
    ),
    /synthetic readiness failure/,
  );
  assert.equal(spawned.length, 2);
  assert.deepEqual(signals, [[90300, "SIGTERM"], [90301, "SIGTERM"]]);
  assert.equal(await pathExists(workspaceRoot), false);
  await rm(tempParent, { recursive: true, force: true });
});

test("launchDemo stops a spawned child when persisting its ownership record fails", async () => {
  // Given
  const tempParent = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), "advx-demo-manifest-failure-parent-")),
  );
  const spawned = [];
  const signals = [];
  let manifestWrites = 0;

  // When / Then
  await assert.rejects(
    launchDemo(
      { repoRoot: REPO_ROOT, profile: "prepared_demo", tempParent, nonce: "manifest-failure-nonce" },
      {
        allocatePorts: async () => ({ api: 43156, ui: 43157, database: 43158 }),
        spawnChild: async (specification) => {
          const child = { ...specification, pid: 90350 + spawned.length };
          spawned.push(child);
          return child;
        },
        writeManifest: async (workspace, children) => {
          manifestWrites += 1;
          if (manifestWrites === 2) throw new Error("synthetic manifest persistence failure");
          await writeDemoManifest(workspace, children);
        },
        waitForReadiness: async () => {},
        isProcessAlive: () => true,
        isProcessGroupAlive: () => false,
        inspectProcess: async (pid) => {
          const child = spawned.find((candidate) => candidate.pid === pid);
          return { commandLine: `${child.command} ${child.args.join(" ")}`, cwd: child.cwd };
        },
        killProcessGroup: (pid, signal) => signals.push([pid, signal]),
        sleep: async () => {},
      },
    ),
    /synthetic manifest persistence failure/,
  );
  assert.equal(spawned.length, 1);
  assert.deepEqual(signals, [[90350, "SIGTERM"]]);
  await rm(tempParent, { recursive: true, force: true });
});

test("probeDemoReadiness accepts only healthy API and exact enabled profile status", async () => {
  // Given
  const requests = [];
  const probeJson = async (url) => {
    requests.push(url);
    if (url.endsWith("/api/health")) return { status: "ok" };
    if (url.endsWith("/api/advx/demo/status")) return { profile: "prepared_replay", enabled: true };
    if (url.endsWith("/api/advx/demo/community")) return { mode: "local_demo", topics: [{ id: "topic-1" }] };
    return { mode: "prepared_fixture", official: false, entries: [{ isCurrent: true }] };
  };

  // When
  await probeDemoReadiness(
    { apiOrigin: "http://127.0.0.1:43161", profile: "prepared_replay" },
    { probeJson },
  );

  // Then
  assert.deepEqual(requests, [
    "http://127.0.0.1:43161/api/health",
    "http://127.0.0.1:43161/api/advx/demo/status",
    "http://127.0.0.1:43161/api/advx/demo/community",
    "http://127.0.0.1:43161/api/advx/demo/leaderboard",
  ]);
});

test("waitForDemoReadiness stops immediately when startup is interrupted", async () => {
  // Given
  const controller = new AbortController();
  controller.abort();
  let probes = 0;

  // When / Then
  await assert.rejects(
    waitForDemoReadiness(
      {
        workspace: { apiOrigin: "http://127.0.0.1:43171", profile: "prepared_demo" },
        children: [{ pid: 90400 }],
        signal: controller.signal,
      },
      {
        isProcessAlive: () => true,
        probeJson: async () => { probes += 1; },
      },
    ),
    /interrupted/,
  );
  assert.equal(probes, 0);
});

test("defaultIsProcessGroupAlive treats macOS zombie-group EPERM as still present", {
  skip: process.platform === "win32",
}, () => {
  // Given
  const originalKill = process.kill;
  process.kill = () => {
    const error = new Error("synthetic permission result");
    error.code = "EPERM";
    throw error;
  };

  // When / Then
  try {
    assert.equal(defaultIsProcessGroupAlive(90401), true);
  } finally {
    process.kill = originalKill;
  }
});
