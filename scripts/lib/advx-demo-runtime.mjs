import { execFileSync, spawn } from "node:child_process";
import { readlink } from "node:fs/promises";
import { createServer } from "node:net";
import { get as httpGet } from "node:http";

const PORT_COUNT = 3;
const PORT_ATTEMPTS = 24;
const STOP_TIMEOUT_MS = 5_000;
const DEFAULT_READINESS_TIMEOUT_MS = 240_000;

export class DemoPortCollisionError extends Error {
  name = "DemoPortCollisionError";
}

export class DemoReadinessError extends Error {
  name = "DemoReadinessError";
}

export class DemoOwnershipError extends Error {
  name = "DemoOwnershipError";
}

function nodeErrorCode(error) {
  return error && typeof error === "object" && "code" in error ? error.code : undefined;
}

export async function reserveLoopbackPort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new DemoPortCollisionError("Unable to reserve a loopback port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

export async function allocateDemoPorts({ reservePort = reserveLoopbackPort } = {}) {
  const ports = [];
  for (let attempt = 0; ports.length < PORT_COUNT && attempt < PORT_ATTEMPTS; attempt += 1) {
    const port = await reservePort();
    if (Number.isInteger(port) && port > 0 && port <= 65_535 && !ports.includes(port)) ports.push(port);
  }
  if (ports.length !== PORT_COUNT) throw new DemoPortCollisionError("Unable to allocate three unique demo ports");
  return { api: ports[0], ui: ports[1], database: ports[2] };
}

export async function requestJson(url, timeoutMs = 2_000) {
  return await new Promise((resolve, reject) => {
    const request = httpGet(url, { signal: AbortSignal.timeout(timeoutMs) }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new DemoReadinessError(`${url} returned HTTP ${response.statusCode ?? "unknown"}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(new DemoReadinessError(`${url} returned invalid JSON`, { cause: error }));
        }
      });
    });
    request.once("error", reject);
  });
}

export async function probeDemoReadiness(input, { probeJson = requestJson } = {}) {
  const health = await probeJson(`${input.apiOrigin}/api/health`);
  if (!health || health.status !== "ok") throw new DemoReadinessError("ADVX demo health probe is not ready");
  const status = await probeJson(`${input.apiOrigin}/api/advx/demo/status`);
  if (!status || status.profile !== input.profile || status.enabled !== true) {
    throw new DemoReadinessError(`ADVX demo status does not match ${input.profile}`);
  }
  const community = await probeJson(`${input.apiOrigin}/api/advx/demo/community`);
  if (!community || community.mode !== "local_demo" || !Array.isArray(community.topics) || community.topics.length === 0) {
    throw new DemoReadinessError("ADVX demo community is not ready");
  }
  const leaderboard = await probeJson(`${input.apiOrigin}/api/advx/demo/leaderboard`);
  if (
    !leaderboard
    || leaderboard.mode !== "prepared_fixture"
    || leaderboard.official !== false
    || !Array.isArray(leaderboard.entries)
    || !leaderboard.entries.some((entry) => entry?.isCurrent === true)
  ) {
    throw new DemoReadinessError("ADVX demo leaderboard is not ready");
  }
}

export async function waitForDemoReadiness(input, dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const isProcessAlive = dependencies.isProcessAlive ?? defaultIsProcessAlive;
  const deadline = now() + (input.timeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS);
  let lastError = new DemoReadinessError("ADVX demo did not become ready");
  while (now() < deadline) {
    if (input.signal?.aborted) throw new DemoReadinessError("ADVX demo startup was interrupted");
    if (input.children.some((child) => !isProcessAlive(child.pid))) {
      throw new DemoReadinessError("An ADVX demo child exited before readiness");
    }
    try {
      await probeDemoReadiness({ apiOrigin: input.workspace.apiOrigin, profile: input.workspace.profile }, dependencies);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : lastError;
    }
    await sleep(250);
  }
  throw new DemoReadinessError("Timed out waiting for ADVX demo readiness", { cause: lastError });
}

export async function spawnOwnedChild(specification) {
  return await new Promise((resolve, reject) => {
    const child = spawn(specification.command, specification.args, {
      cwd: specification.cwd,
      env: specification.env,
      stdio: "inherit",
      detached: process.platform !== "win32",
      shell: false,
    });
    child.once("error", reject);
    child.once("spawn", () => resolve({
      name: specification.name,
      pid: child.pid,
      command: specification.command,
      args: specification.args,
      cwd: specification.cwd,
    }));
  });
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve(code === 0 ? Buffer.concat(chunks).toString("utf8").trim() : ""));
  });
}

export function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (nodeErrorCode(error) === "ESRCH") return false;
    throw error;
  }
}

export function defaultIsProcessGroupAlive(pid) {
  if (process.platform === "win32") return defaultIsProcessAlive(pid);
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (nodeErrorCode(error) === "ESRCH") return false;
    if (nodeErrorCode(error) === "EPERM") return true;
    throw error;
  }
}

export async function inspectProcess(pid) {
  if (process.platform === "win32") {
    const commandLine = await capture("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`,
    ]);
    return commandLine ? { commandLine, cwd: null } : null;
  }
  const commandLine = await capture("ps", ["-ww", "-p", String(pid), "-o", "command="]);
  if (!commandLine) return null;
  if (process.platform === "linux") {
    try {
      return { commandLine, cwd: await readlink(`/proc/${pid}/cwd`) };
    } catch (error) {
      if (nodeErrorCode(error) === "ENOENT") return null;
      throw error;
    }
  }
  const lsof = await capture("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  const cwd = lsof.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  return cwd ? { commandLine, cwd } : null;
}

export function killProcessGroup(pid, signal) {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch (error) {
      if (defaultIsProcessAlive(pid)) throw error;
    }
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (nodeErrorCode(error) !== "ESRCH") throw error;
  }
}

function commandMatches(child, actual) {
  return [child.command, ...child.args].every((token) => actual.commandLine.includes(token));
}

export async function stopOwnedChildren(children, dependencies = {}) {
  const isProcessAlive = dependencies.isProcessAlive ?? defaultIsProcessAlive;
  const isProcessGroupAlive = dependencies.isProcessGroupAlive ?? defaultIsProcessGroupAlive;
  const inspect = dependencies.inspectProcess ?? inspectProcess;
  const killGroup = dependencies.killProcessGroup ?? killProcessGroup;
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const owned = [];
  for (const child of children) {
    if (!isProcessAlive(child.pid)) continue;
    const actual = await inspect(child.pid);
    const cwdMatches = process.platform === "win32" || actual?.cwd === child.cwd;
    if (!actual || !cwdMatches || !commandMatches(child, actual)) {
      throw new DemoOwnershipError(`Refusing to signal foreign PID ${child.pid}`);
    }
    owned.push(child);
  }
  for (const child of owned) killGroup(child.pid, "SIGTERM");
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (owned.some((child) => isProcessGroupAlive(child.pid)) && Date.now() < deadline) await sleep(50);
  for (const child of owned) {
    if (isProcessGroupAlive(child.pid)) killGroup(child.pid, "SIGKILL");
  }
}
