import { describe, expect, it } from "vitest";
import { assertTeenxChildModeStartup, readTeenxChildConfig } from "../teenx-child-config.js";

describe("TeenX child configuration compatibility coverage", () => {
  it("rejects non-strict boolean environment values", () => {
    // Given: an invalid child-mode value.
    const env = { TEENX_CHILD_MODE: "1" } satisfies NodeJS.ProcessEnv;
    // When/Then: parsing rejects the truthy alias.
    expect(() => readTeenxChildConfig(env)).toThrow(/TEENX_CHILD_MODE/);
  });

  it("defaults child mode and local implicit access to disabled", () => {
    // Given: no child environment configuration.
    const env = {} satisfies NodeJS.ProcessEnv;
    // When: canonical configuration is parsed.
    const config = readTeenxChildConfig(env);
    // Then: both capabilities remain disabled.
    expect(config).toEqual({ enabled: false, allowLocalImplicit: false });
  });

  it("fails closed without an installed boundary or compatible deployment", () => {
    // Given: enabled production child mode.
    const config = readTeenxChildConfig({ TEENX_CHILD_MODE: "true" });
    // When/Then: both invalid startup states are rejected.
    expect(() => assertTeenxChildModeStartup(config, {
      deploymentMode: "authenticated", deploymentExposure: "public", nodeEnv: "production", gateInstalled: false,
    })).toThrow(/gate/);
    expect(() => assertTeenxChildModeStartup(config, {
      deploymentMode: "local_trusted", deploymentExposure: "private", nodeEnv: "development", gateInstalled: true,
    })).toThrow(/authenticated public/);
  });

  it("permits local implicit only through the non-production opt-in", () => {
    // Given: the explicit local fixture opt-in.
    const config = readTeenxChildConfig({ TEENX_CHILD_MODE: "true", TEENX_ALLOW_LOCAL_IMPLICIT: "true" });
    // When/Then: test is accepted and production is rejected.
    expect(() => assertTeenxChildModeStartup(config, {
      deploymentMode: "local_trusted", deploymentExposure: "private", nodeEnv: "test", gateInstalled: true,
    })).not.toThrow();
    expect(() => assertTeenxChildModeStartup(config, {
      deploymentMode: "local_trusted", deploymentExposure: "private", nodeEnv: "production", gateInstalled: true,
    })).toThrow(/non-production/);
  });
});
