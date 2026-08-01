import { describe, expect, it } from "vitest";
import { assertTeenxChildModeStartup, readTeenxChildConfig } from "../teenx-child-config.js";

describe("TeenX child mode startup compatibility coverage", () => {
  it.each([
    ["TEENX_CHILD_MODE", "TRUE"],
    ["TEENX_ALLOW_LOCAL_IMPLICIT", "1"],
  ] as const)("rejects non-strict %s values", (name, value) => {
    // Given: a non-strict boolean environment value.
    const env = { [name]: value } satisfies NodeJS.ProcessEnv;
    // When/Then: canonical parsing rejects it.
    expect(() => readTeenxChildConfig(env)).toThrow(name);
  });

  it("fails closed without the global boundary or authenticated public deployment", () => {
    // Given: enabled child mode.
    const config = readTeenxChildConfig({ TEENX_CHILD_MODE: "true" });
    // When/Then: missing installation and invalid deployment each fail.
    expect(() => assertTeenxChildModeStartup(config, {
      deploymentMode: "authenticated", deploymentExposure: "public", nodeEnv: "production", gateInstalled: false,
    })).toThrow(/gate/);
    expect(() => assertTeenxChildModeStartup(config, {
      deploymentMode: "local_trusted", deploymentExposure: "private", nodeEnv: "development", gateInstalled: true,
    })).toThrow(/authenticated public/);
  });

  it("permits local implicit only through the non-production opt-in", () => {
    // Given: an explicitly enabled local fixture.
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
