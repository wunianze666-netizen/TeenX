import { describe, expect, it } from "vitest";
import {
  assertTeenxChildModeStartup,
  readTeenxChildConfig,
} from "../teenx-child-config.js";
import { readTeenxProfileConfig } from "../services/teenx-profile-config.js";

const PROFILE_ENV = {
  NODE_ENV: "production",
  TEENX_PROFILE_PUBLIC_ID_SECRET: encodedSecret("public-id"),
  TEENX_PROFILE_BRIDGE_BASE_URL: "https://profile.internal.teenx.example",
  TEENX_PROFILE_BRIDGE_SECRET: encodedSecret("profile-bridge"),
  TEENX_PROFILE_BRIDGE_KEY_ID: "paperclip-primary",
  TEENX_DISCOURSE_BASE_URL: "https://forum.teenx.example",
  TEENX_DISCOURSE_CONNECT_SECRET: encodedSecret("discourse-connect"),
  TEENX_PROFILE_SSO_MAINTENANCE_LOCK: "true",
} satisfies NodeJS.ProcessEnv;

describe("TeenX child boundary configuration", () => {
  it("parses only exact booleans and defaults disabled", () => {
    // Given: absent, valid, and invalid environment values.
    const absent = {} satisfies NodeJS.ProcessEnv;
    const enabled = {
      TEENX_CHILD_MODE: "true",
      TEENX_ALLOW_LOCAL_IMPLICIT: "false",
    } satisfies NodeJS.ProcessEnv;
    const invalid = { TEENX_CHILD_MODE: "1" } satisfies NodeJS.ProcessEnv;
    const localWithoutChild = { TEENX_ALLOW_LOCAL_IMPLICIT: "true" } satisfies NodeJS.ProcessEnv;

    // When/Then: valid values parse exactly and truthy aliases fail.
    expect(readTeenxChildConfig(absent)).toEqual({ enabled: false, allowLocalImplicit: false });
    expect(readTeenxChildConfig(enabled)).toEqual({ enabled: true, allowLocalImplicit: false });
    expect(() => readTeenxChildConfig(invalid)).toThrow(/TEENX_CHILD_MODE/);
    expect(() => readTeenxChildConfig(localWithoutChild)).toThrow(/requires TEENX_CHILD_MODE/);
  });

  it("rejects the stale local implicit environment name", () => {
    // Given: an environment using the superseded flag name.
    const env = {
      TEENX_CHILD_MODE: "true",
      TEENX_CHILD_ALLOW_LOCAL_IMPLICIT: "true",
    } satisfies NodeJS.ProcessEnv;

    // When/Then: startup configuration rejects rather than ignores it.
    expect(() => readTeenxChildConfig(env)).toThrow(/TEENX_CHILD_ALLOW_LOCAL_IMPLICIT/);
  });

  it("fails startup when the enabled boundary is not installed", () => {
    // Given: an enabled production child deployment without the installation marker.
    const config = readTeenxChildConfig({ TEENX_CHILD_MODE: "true" });

    // When/Then: startup fails closed before listening.
    expect(() => assertTeenxChildModeStartup(config, {
      deploymentMode: "authenticated",
      deploymentExposure: "public",
      nodeEnv: "production",
      gateInstalled: false,
    })).toThrow(/gate/);
  });

  it("admits local implicit identity only through the explicit non-production setting", () => {
    // Given: the exact local-implicit environment opt-in.
    const config = readTeenxChildConfig({
      TEENX_CHILD_MODE: "true",
      TEENX_ALLOW_LOCAL_IMPLICIT: "true",
    });

    // When/Then: test mode is admitted while production is rejected.
    expect(() => assertTeenxChildModeStartup(config, {
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      nodeEnv: "test",
      gateInstalled: true,
    })).not.toThrow();
    expect(() => assertTeenxChildModeStartup(config, {
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      nodeEnv: "production",
      gateInstalled: true,
    })).toThrow(/non-production/);
  });

  it("derives Profile child state from the resolved child config", () => {
    // Given: resolved child mode that disagrees with raw child env keys.
    const env = { ...PROFILE_ENV, TEENX_CHILD_MODE: "false" };
    const child = { enabled: true, allowLocalImplicit: false } as const;

    // When: Profile configuration is parsed from its own environment fields.
    const profile = readTeenxProfileConfig(env, child, {
      deploymentMode: "authenticated",
      deploymentExposure: "public",
    });

    // Then: Profile uses the already resolved child policy without reparsing it.
    expect(profile.childMode).toBe(true);
    expect(profile.allowLocalFixture).toBe(false);
  });

  it("fails Profile startup closed when enabled identity material is missing", () => {
    // Given: enabled child mode without its persistent public identity secret.
    const env = { ...PROFILE_ENV };
    delete env.TEENX_PROFILE_PUBLIC_ID_SECRET;

    // When/Then: Profile configuration rejects the incomplete deployment.
    expect(() => readTeenxProfileConfig(
      env,
      { enabled: true, allowLocalImplicit: false },
      { deploymentMode: "authenticated", deploymentExposure: "public" },
    )).toThrow(/PUBLIC_ID_SECRET/);
  });

  it.each([
    { name: "whitespace", value: ` ${encodedSecret("public-id")} ` },
    { name: "default", value: "change-me-change-me-change-me-change-me" },
    { name: "low entropy", value: "a".repeat(43) },
  ])("rejects $name public identity secret material", ({ value }) => {
    // Given: child mode with syntactically present but unsafe identity material.
    const env = { ...PROFILE_ENV, TEENX_PROFILE_PUBLIC_ID_SECRET: value };

    // When/Then: startup rejects the secret instead of deriving public identities from it.
    expect(() => readTeenxProfileConfig(
      env,
      { enabled: true, allowLocalImplicit: false },
      { deploymentMode: "authenticated", deploymentExposure: "public" },
    )).toThrow(/PUBLIC_ID_SECRET/);
  });

  it("requires distinct secrets and distinct bridge and browser origins", () => {
    // Given: complete child configuration that reuses trust material and origins.
    const duplicateSecret = {
      ...PROFILE_ENV,
      TEENX_PROFILE_BRIDGE_SECRET: PROFILE_ENV.TEENX_PROFILE_PUBLIC_ID_SECRET,
    };
    const duplicateOrigin = {
      ...PROFILE_ENV,
      TEENX_DISCOURSE_BASE_URL: PROFILE_ENV.TEENX_PROFILE_BRIDGE_BASE_URL,
    };

    // When/Then: trust domains cannot silently collapse onto one secret or origin.
    expect(() => readTeenxProfileConfig(
      duplicateSecret,
      { enabled: true, allowLocalImplicit: false },
      { deploymentMode: "authenticated", deploymentExposure: "public" },
    )).toThrow(/distinct/);
    expect(() => readTeenxProfileConfig(
      duplicateOrigin,
      { enabled: true, allowLocalImplicit: false },
      { deploymentMode: "authenticated", deploymentExposure: "public" },
    )).toThrow(/distinct/);
  });

  it("enables configured Profile SSO for a non-child local development fixture", () => {
    // Given: full Profile trust configuration on the normal local development app.
    const env = { ...PROFILE_ENV, NODE_ENV: "development", TEENX_PROFILE_SSO_MAINTENANCE_LOCK: "false" };

    // When: Profile configuration is resolved with the child gate disabled.
    const profile = readTeenxProfileConfig(
      env,
      { enabled: false, allowLocalImplicit: false },
      { deploymentMode: "local_trusted", deploymentExposure: "private" },
    );

    // Then: the local interactive fixture can use the safe SSO route without enabling child mode.
    expect(profile.enabled).toBe(true);
    expect(profile.allowLocalFixture).toBe(true);
    expect(profile.discourseBaseUrl?.origin).toBe("https://forum.teenx.example");
  });

  it("fails Profile startup closed for a production local fixture", () => {
    // Given: complete identity material paired with the forbidden production fixture policy.
    const child = { enabled: true, allowLocalImplicit: true } as const;

    // When/Then: Profile parsing applies the resolved child deployment invariant.
    expect(() => readTeenxProfileConfig(
      PROFILE_ENV,
      child,
      { deploymentMode: "local_trusted", deploymentExposure: "private" },
    )).toThrow(/non-production/);
  });

  it("fails Profile startup closed for an incompatible deployment mode", () => {
    // Given: complete identity material with child mode enabled outside authenticated public deployment.
    const child = { enabled: true, allowLocalImplicit: false } as const;

    // When/Then: Profile parsing rejects the incompatible resolved deployment.
    expect(() => readTeenxProfileConfig(
      { ...PROFILE_ENV, NODE_ENV: "development" },
      child,
      { deploymentMode: "local_trusted", deploymentExposure: "private" },
    )).toThrow(/authenticated public/);
  });
});

function encodedSecret(label: string): string {
  return Buffer.from(`teenx-${label}-independent-secret-material-2026`).toString("base64url");
}
