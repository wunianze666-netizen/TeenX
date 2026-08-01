import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import { z } from "zod";

const strictBooleanSchema = z.enum(["true", "false"])
  .transform((value) => value === "true");

const teenxChildEnvironmentSchema = z.object({
  TEENX_CHILD_MODE: strictBooleanSchema.optional().default("false"),
  TEENX_ALLOW_LOCAL_IMPLICIT: strictBooleanSchema.optional().default("false"),
  TEENX_CHILD_ALLOW_LOCAL_IMPLICIT: z.undefined(),
}).superRefine((value, context) => {
  if (value.TEENX_ALLOW_LOCAL_IMPLICIT && !value.TEENX_CHILD_MODE) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TEENX_ALLOW_LOCAL_IMPLICIT"],
      message: "TEENX_ALLOW_LOCAL_IMPLICIT requires TEENX_CHILD_MODE=true",
    });
  }
});

export type TeenxChildConfig = {
  readonly enabled: boolean;
  readonly allowLocalImplicit: boolean;
};

export type TeenxChildStartupContext = {
  readonly deploymentMode: DeploymentMode;
  readonly deploymentExposure: DeploymentExposure;
  readonly nodeEnv: string;
  readonly gateInstalled: boolean;
};

export type TeenxChildDeploymentContext = Omit<TeenxChildStartupContext, "gateInstalled">;

export class TeenxChildStartupError extends Error {
  readonly name = "TeenxChildStartupError";
}

export function readTeenxChildConfig(env: NodeJS.ProcessEnv): TeenxChildConfig {
  const parsed = teenxChildEnvironmentSchema.parse({
    TEENX_CHILD_MODE: env.TEENX_CHILD_MODE,
    TEENX_ALLOW_LOCAL_IMPLICIT: env.TEENX_ALLOW_LOCAL_IMPLICIT,
    TEENX_CHILD_ALLOW_LOCAL_IMPLICIT: env.TEENX_CHILD_ALLOW_LOCAL_IMPLICIT,
  });

  return {
    enabled: parsed.TEENX_CHILD_MODE,
    allowLocalImplicit: parsed.TEENX_ALLOW_LOCAL_IMPLICIT,
  };
}

export function assertTeenxChildModeStartup(
  config: TeenxChildConfig,
  context: TeenxChildStartupContext,
): void {
  assertTeenxChildDeployment(config, context);
  assertTeenxChildBoundaryInstalled(config, context.gateInstalled);
}

export function assertTeenxChildDeployment(
  config: TeenxChildConfig,
  context: TeenxChildDeploymentContext,
): void {
  if (!config.enabled) return;
  if (config.allowLocalImplicit) {
    const localEnvironment = context.nodeEnv === "development" || context.nodeEnv === "test";
    if (
      localEnvironment &&
      context.deploymentMode === "local_trusted" &&
      context.deploymentExposure === "private"
    ) {
      return;
    }
    throw new TeenxChildStartupError(
      "TeenX local implicit access is restricted to non-production local test or development deployments",
    );
  }
  if (context.deploymentMode === "authenticated" && context.deploymentExposure === "public") return;
  throw new TeenxChildStartupError(
    "TeenX child mode requires an authenticated public deployment or explicit non-production local implicit access",
  );
}

export function assertTeenxChildBoundaryInstalled(
  config: TeenxChildConfig,
  installed: boolean,
): void {
  if (config.enabled && !installed) {
    throw new TeenxChildStartupError("TeenX child API gate is not installed");
  }
}
