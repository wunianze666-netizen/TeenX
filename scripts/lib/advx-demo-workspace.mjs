import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEMO_MANIFEST_VERSION = 1;
export const DEMO_ROOT_PREFIX = `advx-demo-${typeof process.getuid === "function" ? process.getuid() : "user"}-`;

const PASSTHROUGH_ENV_KEYS = [
  "COMSPEC",
  "LANG",
  "LC_ALL",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
];

export async function writeDemoJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, filePath);
}

function buildConfig(paths, ports) {
  return {
    $meta: { version: 1, updatedAt: new Date().toISOString(), source: "configure" },
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: path.join(paths.instanceRoot, "db"),
      embeddedPostgresPort: ports.database,
      backup: { enabled: false, intervalMinutes: 60, retentionDays: 1, dir: path.join(paths.instanceRoot, "backups") },
    },
    logging: { mode: "file", logDir: path.join(paths.instanceRoot, "logs") },
    server: {
      deploymentMode: "local_trusted",
      exposure: "private",
      bind: "loopback",
      host: "127.0.0.1",
      port: ports.api,
      allowedHostnames: ["127.0.0.1", "localhost"],
      serveUi: false,
    },
    auth: { baseUrlMode: "auto", disableSignUp: false },
    telemetry: { enabled: false },
    storage: {
      provider: "local_disk",
      localDisk: { baseDir: path.join(paths.instanceRoot, "storage") },
      s3: { bucket: "unused", region: "us-east-1", prefix: "", forcePathStyle: false },
    },
    secrets: {
      provider: "local_encrypted",
      strictMode: false,
      localEncrypted: { keyFilePath: path.join(paths.instanceRoot, "secrets", "master.key") },
    },
  };
}

function buildEnvironment(paths, input) {
  const env = Object.fromEntries(PASSTHROUGH_ENV_KEYS.flatMap((key) => {
    const value = input.baseEnv[key];
    return value === undefined ? [] : [[key, value]];
  }));
  return Object.assign(env, {
    PATH: `${path.dirname(process.execPath)}:${input.baseEnv.PATH ?? ""}`,
    HOME: paths.homeDir,
    CODEX_HOME: path.join(paths.homeDir, ".codex"),
    CLAUDE_HOME: path.join(paths.homeDir, ".claude"),
    PAPERCLIP_HOME: paths.paperclipHome,
    PAPERCLIP_INSTANCE_ID: paths.instanceId,
    PAPERCLIP_CONFIG: paths.configPath,
    PAPERCLIP_CONTEXT: path.join(paths.root, "context.json"),
    PAPERCLIP_AUTH_STORE: path.join(paths.instanceRoot, "auth.json"),
    ADVX_SERVER_PROFILE: input.profile,
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: String(input.ports.api),
    PAPERCLIP_DEPLOYMENT_MODE: "local_trusted",
    PAPERCLIP_DEPLOYMENT_EXPOSURE: "private",
    PAPERCLIP_BIND: "loopback",
    PAPERCLIP_ALLOWED_HOSTNAMES: "127.0.0.1,localhost",
    PAPERCLIP_STORAGE_PROVIDER: "local_disk",
    PAPERCLIP_STORAGE_LOCAL_DIR: path.join(paths.instanceRoot, "storage"),
    PAPERCLIP_SECRETS_PROVIDER: "local_encrypted",
    PAPERCLIP_SECRETS_STRICT_MODE: "false",
    PAPERCLIP_SECRETS_MASTER_KEY_FILE: path.join(paths.instanceRoot, "secrets", "master.key"),
    PAPERCLIP_DB_BACKUP_ENABLED: "false",
    PAPERCLIP_MIGRATION_PROMPT: "never",
    PAPERCLIP_MIGRATION_AUTO_APPLY: "true",
    HEARTBEAT_SCHEDULER_ENABLED: "false",
    SERVE_UI: "false",
    PAPERCLIP_UI_DEV_MIDDLEWARE: "false",
    PAPERCLIP_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
    ADVX_SERVER_ORIGIN: `http://127.0.0.1:${input.ports.api}`,
    ADVX_DEMO_NONCE: input.nonce,
  });
}

export async function createDemoWorkspace(input) {
  const tempParent = path.resolve(input.tempParent ?? os.tmpdir());
  await mkdir(tempParent, { recursive: true });
  const root = await mkdtemp(path.join(tempParent, DEMO_ROOT_PREFIX));
  const nonce = input.nonce ?? randomUUID();
  const instanceId = `advx-demo-${nonce}`;
  const paperclipHome = path.join(root, "paperclip-home");
  const instanceRoot = path.join(paperclipHome, "instances", instanceId);
  const paths = {
    root,
    homeDir: path.join(root, "home"),
    paperclipHome,
    instanceId,
    instanceRoot,
    configPath: path.join(instanceRoot, "config.json"),
  };
  await Promise.all([
    mkdir(paths.homeDir, { recursive: true }),
    mkdir(path.join(instanceRoot, "secrets"), { recursive: true }),
    mkdir(path.join(instanceRoot, "storage"), { recursive: true }),
  ]);
  const markerPath = path.join(root, ".advx-demo-owner.json");
  const manifestPath = path.join(root, "advx-demo-manifest.json");
  await writeDemoJsonAtomic(paths.configPath, buildConfig(paths, input.ports));
  await writeDemoJsonAtomic(markerPath, {
    version: DEMO_MANIFEST_VERSION,
    root,
    nonce,
    repoRoot: path.resolve(input.repoRoot),
  });
  return {
    ...paths,
    markerPath,
    manifestPath,
    nonce,
    repoRoot: path.resolve(input.repoRoot),
    profile: input.profile,
    ports: input.ports,
    apiOrigin: `http://127.0.0.1:${input.ports.api}`,
    uiOrigin: `http://127.0.0.1:${input.ports.ui}`,
    env: buildEnvironment(paths, { ...input, nonce, baseEnv: input.baseEnv ?? process.env }),
  };
}
