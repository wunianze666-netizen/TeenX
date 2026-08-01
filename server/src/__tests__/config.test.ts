import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config-file.js", () => ({ readConfigFile: () => null }));
vi.mock("../paths.js", () => ({ resolvePaperclipEnvPath: () => "/__advx_missing_env__" }));
vi.mock("../worktree-config.js", () => ({
  maybeRepairLegacyWorktreeConfigAndEnvFiles: () => undefined,
}));

import { loadConfig } from "../config.js";

const ORIGINAL_ENV = { ...process.env };

function restoreEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

function configureDisposableLocalStartup(): void {
  process.env.NODE_ENV = "test";
  process.env.PAPERCLIP_DEPLOYMENT_MODE = "local_trusted";
  process.env.PAPERCLIP_BIND = "loopback";
  process.env.HOST = "127.0.0.1";
  process.env.PAPERCLIP_STORAGE_PROVIDER = "local_disk";
  process.env.PAPERCLIP_TAILNET_BIND_HOST = "100.64.0.1";
  delete process.env.DATABASE_URL;
  delete process.env.PAPERCLIP_MANAGED_CONFIG;
  delete process.env.PAPERCLIP_TRUSTED_MCP_RUNTIME_HOST;
  delete process.env.PAPERCLIP_TOOL_RUNTIME_TRUSTED_HOST;
  delete process.env.TRUST_PROXY;
}

describe("ADVX server profile startup contract", () => {
  beforeEach(() => {
    restoreEnvironment();
    configureDisposableLocalStartup();
    delete process.env.ADVX_SERVER_PROFILE;
  });

  afterEach(() => {
    restoreEnvironment();
  });

  it("defaults to real when ADVX_SERVER_PROFILE is absent", () => {
    // Given: a startup environment without a profile override.

    // When: startup configuration is loaded.
    const config = loadConfig();

    // Then: normal server behavior remains the default.
    expect(config.advxServerProfile).toBe("real");
  });

  it.each(["prepared_demo", "prepared_replay"])(
    "admits the %s profile only for disposable local startup",
    (profile) => {
      // Given: the exact prepared profile on the safe local baseline.
      process.env.ADVX_SERVER_PROFILE = profile;

      // When: startup configuration is loaded.
      const config = loadConfig();

      // Then: the parsed profile is frozen into typed configuration.
      expect(config.advxServerProfile).toBe(profile);
    },
  );

  it("rejects an unknown ADVX_SERVER_PROFILE value", () => {
    // Given: an unsupported profile supplied at process startup.
    process.env.ADVX_SERVER_PROFILE = "demo";

    // When/Then: configuration fails closed instead of falling back to real.
    expect(() => loadConfig()).toThrow(/ADVX_SERVER_PROFILE/);
  });

  it("does not apply prepared-profile restrictions to real startup", () => {
    // Given: the real profile under production settings forbidden to prepared data.
    process.env.ADVX_SERVER_PROFILE = "real";
    process.env.NODE_ENV = "production";
    process.env.PAPERCLIP_DEPLOYMENT_MODE = "authenticated";
    process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE = "public";
    process.env.PAPERCLIP_BIND = "lan";
    process.env.HOST = "0.0.0.0";
    process.env.PAPERCLIP_STORAGE_PROVIDER = "s3";
    process.env.DATABASE_URL = "postgresql://db.internal/paperclip";
    process.env.PAPERCLIP_MANAGED_CONFIG = "{}";
    process.env.TRUST_PROXY = "true";
    process.env.PAPERCLIP_TRUSTED_MCP_RUNTIME_HOST = "worker.internal";

    // When: startup configuration is loaded.
    const config = loadConfig();

    // Then: existing real server behavior remains available and unchanged.
    expect(config.advxServerProfile).toBe("real");
  });

  it.each([
    {
      name: "production",
      configure: () => {
        process.env.NODE_ENV = "production";
      },
    },
    {
      name: "authenticated deployment",
      configure: () => {
        process.env.PAPERCLIP_DEPLOYMENT_MODE = "authenticated";
      },
    },
    {
      name: "public exposure",
      configure: () => {
        process.env.PAPERCLIP_DEPLOYMENT_MODE = "authenticated";
        process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE = "public";
      },
    },
    {
      name: "non-loopback bind",
      configure: () => {
        process.env.PAPERCLIP_DEPLOYMENT_MODE = "authenticated";
        process.env.PAPERCLIP_BIND = "lan";
        process.env.HOST = "0.0.0.0";
      },
    },
    {
      name: "S3 storage",
      configure: () => {
        process.env.PAPERCLIP_STORAGE_PROVIDER = "s3";
      },
    },
    {
      name: "external PostgreSQL",
      configure: () => {
        process.env.DATABASE_URL = "postgresql://localhost/advx_prepared_forbidden";
      },
    },
    {
      name: "managed deployment configuration",
      configure: () => {
        process.env.PAPERCLIP_MANAGED_CONFIG = "{}";
      },
    },
    {
      name: "unrestricted trusted proxy",
      configure: () => {
        process.env.TRUST_PROXY = "true";
      },
    },
    {
      name: "trusted MCP runtime host",
      configure: () => {
        process.env.PAPERCLIP_TRUSTED_MCP_RUNTIME_HOST = "worker.internal";
      },
    },
  ])("rejects prepared startup under $name", ({ configure }) => {
    // Given: a prepared profile combined with one unsafe startup setting.
    process.env.ADVX_SERVER_PROFILE = "prepared_demo";
    configure();

    // When/Then: validation rejects it before startup can initialize a database.
    expect(() => loadConfig()).toThrow(/ADVX_SERVER_PROFILE/);
  });
});
