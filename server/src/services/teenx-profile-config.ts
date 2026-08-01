import { z } from "zod";
import {
  assertTeenxChildDeployment,
  type TeenxChildConfig,
  type TeenxChildDeploymentContext,
} from "../teenx-child-config.js";

const booleanValueSchema = z.enum(["true", "false"])
  .transform((value) => value === "true");

const httpsUrlSchema = z.string().url().transform((value, context) => {
  if (value !== value.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "URL must not contain surrounding whitespace" });
    return z.NEVER;
  }
  const url = new URL(value);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== "/"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "URL must be an HTTP(S) origin without credentials, path, query, or fragment",
    });
    return z.NEVER;
  }
  return url;
});

const rawConfigSchema = z.object({
  nodeEnv: z.string().optional().default("development"),
  publicIdSecret: z.string().optional().default(""),
  bridgeBaseUrl: httpsUrlSchema.optional(),
  bridgeSecret: z.string().optional().default(""),
  bridgeKeyId: z.union([z.literal(""), z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/)]).optional().default(""),
  bridgeTimeoutMs: z.coerce.number().int().min(250).max(15_000).optional().default(5_000),
  publicIdCacheTtlMs: z.coerce.number().int().min(1_000).max(300_000).optional().default(30_000),
  publicIdScanCap: z.coerce.number().int().min(1).max(100_000).optional().default(10_000),
  ssoMaintenanceLock: booleanValueSchema.optional(),
  discourseBaseUrl: httpsUrlSchema.optional(),
  discourseConnectSecret: z.string().optional().default(""),
}).strict();

export type TeenxProfileConfig = {
  readonly enabled: boolean;
  readonly childMode: boolean;
  readonly allowLocalFixture: boolean;
  readonly publicIdSecret: string;
  readonly bridgeBaseUrl: URL | null;
  readonly bridgeSecret: string;
  readonly bridgeKeyId: string;
  readonly bridgeTimeoutMs: number;
  readonly publicIdCacheTtlMs: number;
  readonly publicIdScanCap: number;
  readonly ssoMaintenanceLock: boolean;
  readonly discourseBaseUrl: URL | null;
  readonly discourseConnectSecret: string;
};

function isStrongSecret(value: string): boolean {
  if (value !== value.trim() || !/^[A-Za-z0-9_-]{43,171}$/u.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value
    && decoded.length >= 32
    && decoded.length <= 128
    && new Set(decoded).size >= 16;
}

export function readTeenxProfileConfig(
  env: NodeJS.ProcessEnv,
  childConfig: TeenxChildConfig,
  deployment: Omit<TeenxChildDeploymentContext, "nodeEnv">,
): TeenxProfileConfig {
  const parsed = rawConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    publicIdSecret: env.TEENX_PROFILE_PUBLIC_ID_SECRET,
    bridgeBaseUrl: env.TEENX_PROFILE_BRIDGE_BASE_URL,
    bridgeSecret: env.TEENX_PROFILE_BRIDGE_SECRET,
    bridgeKeyId: env.TEENX_PROFILE_BRIDGE_KEY_ID,
    bridgeTimeoutMs: env.TEENX_PROFILE_BRIDGE_TIMEOUT_MS,
    publicIdCacheTtlMs: env.TEENX_PROFILE_PUBLIC_ID_CACHE_TTL_MS,
    publicIdScanCap: env.TEENX_PROFILE_PUBLIC_ID_SCAN_CAP,
    ssoMaintenanceLock: env.TEENX_PROFILE_SSO_MAINTENANCE_LOCK,
    discourseBaseUrl: env.TEENX_DISCOURSE_BASE_URL,
    discourseConnectSecret: env.TEENX_DISCOURSE_CONNECT_SECRET,
  });
  assertTeenxChildDeployment(childConfig, { ...deployment, nodeEnv: parsed.nodeEnv });
  const profileConfigured = Boolean(
    parsed.publicIdSecret || parsed.bridgeSecret || parsed.bridgeKeyId || parsed.discourseConnectSecret,
  );
  if (!childConfig.enabled && !profileConfigured) {
    return {
      enabled: false,
      childMode: false,
      allowLocalFixture: false,
      publicIdSecret: "",
      bridgeBaseUrl: null,
      bridgeSecret: "",
      bridgeKeyId: "",
      bridgeTimeoutMs: parsed.bridgeTimeoutMs,
      publicIdCacheTtlMs: parsed.publicIdCacheTtlMs,
      publicIdScanCap: parsed.publicIdScanCap,
      ssoMaintenanceLock: true,
      discourseBaseUrl: null,
      discourseConnectSecret: "",
    };
  }

  const issues: string[] = [];
  if (!isStrongSecret(parsed.publicIdSecret)) issues.push("TEENX_PROFILE_PUBLIC_ID_SECRET must contain strong, trimmed secret material");
  if (!parsed.bridgeBaseUrl) issues.push("TEENX_PROFILE_BRIDGE_BASE_URL is required");
  if (!isStrongSecret(parsed.bridgeSecret)) issues.push("TEENX_PROFILE_BRIDGE_SECRET must contain strong, trimmed secret material");
  if (!parsed.bridgeKeyId) issues.push("TEENX_PROFILE_BRIDGE_KEY_ID is required");
  if (!parsed.discourseBaseUrl) issues.push("TEENX_DISCOURSE_BASE_URL is required");
  if (!isStrongSecret(parsed.discourseConnectSecret)) issues.push("TEENX_DISCOURSE_CONNECT_SECRET must contain strong, trimmed secret material");
  if (parsed.ssoMaintenanceLock === undefined) issues.push("TEENX_PROFILE_SSO_MAINTENANCE_LOCK must be explicit");
  if (new Set([parsed.publicIdSecret, parsed.bridgeSecret, parsed.discourseConnectSecret]).size !== 3) {
    issues.push("TeenX Profile secrets must be distinct");
  }
  if (parsed.bridgeBaseUrl && parsed.discourseBaseUrl && parsed.bridgeBaseUrl.origin === parsed.discourseBaseUrl.origin) {
    issues.push("TeenX Profile bridge and browser origins must be distinct");
  }

  const production = parsed.nodeEnv === "production";
  if (production && parsed.bridgeBaseUrl?.protocol !== "https:") {
    issues.push("TEENX_PROFILE_BRIDGE_BASE_URL must use HTTPS in production");
  }
  if (production && parsed.discourseBaseUrl?.protocol !== "https:") {
    issues.push("TEENX_DISCOURSE_BASE_URL must use HTTPS in production");
  }
  if (issues.length > 0 || !parsed.bridgeBaseUrl || !parsed.discourseBaseUrl || parsed.ssoMaintenanceLock === undefined) {
    throw new z.ZodError(issues.map((message) => ({ code: z.ZodIssueCode.custom, path: [], message })));
  }

  return {
    enabled: true,
    childMode: childConfig.enabled,
    allowLocalFixture: childConfig.allowLocalImplicit || (
      !childConfig.enabled &&
      !production &&
      deployment.deploymentMode === "local_trusted" &&
      deployment.deploymentExposure === "private"
    ),
    publicIdSecret: parsed.publicIdSecret,
    bridgeBaseUrl: parsed.bridgeBaseUrl,
    bridgeSecret: parsed.bridgeSecret,
    bridgeKeyId: parsed.bridgeKeyId,
    bridgeTimeoutMs: parsed.bridgeTimeoutMs,
    publicIdCacheTtlMs: parsed.publicIdCacheTtlMs,
    publicIdScanCap: parsed.publicIdScanCap,
    ssoMaintenanceLock: parsed.ssoMaintenanceLock,
    discourseBaseUrl: parsed.discourseBaseUrl,
    discourseConnectSecret: parsed.discourseConnectSecret,
  };
}
