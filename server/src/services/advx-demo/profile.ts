import type {
  BindMode,
  DeploymentExposure,
  DeploymentMode,
  StorageProvider,
} from "@paperclipai/shared";
import { z } from "zod";

export const ADVX_SERVER_PROFILES = [
  "real",
  "prepared_demo",
  "prepared_replay",
] as const;

const advxServerProfileSchema = z.enum(ADVX_SERVER_PROFILES);

export type AdvxServerProfile = z.infer<typeof advxServerProfileSchema>;

type AdvxServerProfileStartupContext = {
  readonly nodeEnv: string | undefined;
  readonly deploymentMode: DeploymentMode;
  readonly deploymentExposure: DeploymentExposure;
  readonly bind: BindMode;
  readonly host: string;
  readonly storageProvider: StorageProvider;
  readonly databaseMode: "embedded-postgres" | "postgres";
  readonly databaseUrl: string | undefined;
  readonly managedConfig: string | undefined;
  readonly trustProxy: string | undefined;
  readonly trustedMcpRuntimeHost: string | undefined;
};

type AdvxPreparedProfileViolation =
  | "production runtime"
  | "deployment mode must be local_trusted"
  | "deployment exposure must be private"
  | "bind must be loopback"
  | "host must be loopback"
  | "storage provider must be local_disk"
  | "database must be embedded PostgreSQL"
  | "managed deployment configuration is forbidden"
  | "trusted proxy configuration is forbidden"
  | "trusted MCP runtime host is forbidden";

const PROFILE_POLICY = {
  real: "unrestricted",
  prepared_demo: "disposable_local_only",
  prepared_replay: "disposable_local_only",
} as const satisfies Record<AdvxServerProfile, "unrestricted" | "disposable_local_only">;

export class AdvxServerProfileConfigError extends Error {
  readonly name = "AdvxServerProfileConfigError";

  constructor(
    readonly rawProfile: string,
    readonly violations: readonly string[],
  ) {
    super(`ADVX_SERVER_PROFILE=${JSON.stringify(rawProfile)} is not allowed: ${violations.join("; ")}`);
  }
}

export function resolveAdvxServerProfile(
  rawProfile: string | undefined,
  context: AdvxServerProfileStartupContext,
): AdvxServerProfile {
  const parsed = advxServerProfileSchema.safeParse(rawProfile ?? "real");
  if (!parsed.success) {
    throw new AdvxServerProfileConfigError(rawProfile ?? "", ["unknown profile"]);
  }

  const profile = parsed.data;
  if (PROFILE_POLICY[profile] === "unrestricted") return profile;

  const violations: AdvxPreparedProfileViolation[] = [];
  const normalizedHost = context.host.trim().toLowerCase();
  const normalizedTrustProxy = context.trustProxy?.trim();
  if (context.nodeEnv?.trim().toLowerCase() === "production") {
    violations.push("production runtime");
  }
  if (context.deploymentMode !== "local_trusted") {
    violations.push("deployment mode must be local_trusted");
  }
  if (context.deploymentExposure !== "private") {
    violations.push("deployment exposure must be private");
  }
  if (context.bind !== "loopback") {
    violations.push("bind must be loopback");
  }
  if (
    normalizedHost !== "127.0.0.1" &&
    normalizedHost !== "localhost" &&
    normalizedHost !== "::1"
  ) {
    violations.push("host must be loopback");
  }
  if (context.storageProvider !== "local_disk") {
    violations.push("storage provider must be local_disk");
  }
  if (context.databaseMode !== "embedded-postgres" || context.databaseUrl !== undefined) {
    violations.push("database must be embedded PostgreSQL");
  }
  if (context.managedConfig !== undefined) {
    violations.push("managed deployment configuration is forbidden");
  }
  if (
    normalizedTrustProxy !== undefined &&
    normalizedTrustProxy !== "" &&
    normalizedTrustProxy !== "false" &&
    normalizedTrustProxy !== "0"
  ) {
    violations.push("trusted proxy configuration is forbidden");
  }
  if (context.trustedMcpRuntimeHost !== undefined) {
    violations.push("trusted MCP runtime host is forbidden");
  }

  if (violations.length > 0) {
    throw new AdvxServerProfileConfigError(profile, violations);
  }
  return profile;
}
