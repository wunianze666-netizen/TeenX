import type { RequestHandler, Response } from "express";
import type { TeenxChildConfig } from "../teenx-child-config.js";

export const TEENX_CHILD_API_BOUNDARY_INSTALLED = "teenxChildApiBoundaryInstalled";
export const TEENX_CHILD_API_DENIED_CODE = "TEENX_CHILD_API_DENIED";

const PUBLIC_EXACT_ROUTES = new Set([
  "GET /api/health",
  "POST /api/auth/sign-in/email",
  "POST /api/auth/sign-out",
  "GET /api/auth/callback/credentials/sign-in",
  "GET /api/advx/session",
  "GET /api/advx/demo/status",
] as const);

const BROWSER_EXACT_ROUTES = new Set([
  ...PUBLIC_EXACT_ROUTES,
  "GET /api/advx/me",
  "GET /api/advx/forum/session",
  "GET /api/advx/sso/discourse-connect",
  "POST /api/advx/teams",
  "GET /api/advx/teams",
  "GET /api/advx/teams/mine",
  "GET /api/advx/role-templates",
  "GET /api/advx/tools",
  "GET /api/advx/skills",
  "GET /api/advx/test-tasks",
  "PATCH /api/advx/me/identity",
  "GET /api/advx/me/privacy",
  "PATCH /api/advx/me/privacy",
  "GET /api/advx/me/contact-requests",
  "GET /api/advx/me/contacts",
  "POST /api/advx/contact-requests",
  "GET /api/advx/arena/challenges",
  "POST /api/advx/demo/bootstrap",
  "POST /api/advx/demo/prepared-submission",
  "GET /api/advx/demo/replay",
] as const);

const PUBLIC_ROUTE_PATTERNS: readonly RegExp[] = [];

const UUID_SEGMENT = "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}";
const VERSION_SEGMENT = "v[1-9][0-9]*-[0-9]{13}";
const PUBLIC_ID_SEGMENT = "captain_v1_[A-Za-z0-9_-]{43}";
const CHALLENGE_VERSION_SEGMENT = "[A-Za-z0-9_-]+:v[1-9][0-9]*";

const BROWSER_ROUTE_PATTERNS = [
  ...PUBLIC_ROUTE_PATTERNS,
  new RegExp(`^(?:GET|PATCH) /api/advx/teams/${UUID_SEGMENT}$`),
  new RegExp(`^(?:GET|POST) /api/advx/teams/${UUID_SEGMENT}/members$`),
  new RegExp(`^(?:PATCH|DELETE) /api/advx/teams/${UUID_SEGMENT}/members/${UUID_SEGMENT}$`),
  new RegExp(`^(?:GET|POST) /api/advx/teams/${UUID_SEGMENT}/versions$`),
  new RegExp(`^GET /api/advx/teams/${UUID_SEGMENT}/versions/${VERSION_SEGMENT}$`),
  new RegExp(`^GET /api/advx/teams/${UUID_SEGMENT}/activity$`),
  new RegExp(`^POST /api/advx/teams/${UUID_SEGMENT}/test-runs$`),
  new RegExp(`^GET /api/advx/test-runs/${UUID_SEGMENT}$`),
  new RegExp(`^GET /api/advx/captains/${PUBLIC_ID_SEGMENT}/profile$`),
  new RegExp(`^(?:PATCH|DELETE) /api/advx/contact-requests/${UUID_SEGMENT}$`),
  new RegExp(`^DELETE /api/advx/contacts/${PUBLIC_ID_SEGMENT}$`),
  new RegExp(`^POST /api/advx/contacts/${PUBLIC_ID_SEGMENT}/unblock$`),
  new RegExp(`^GET /api/advx/arena/challenges/${CHALLENGE_VERSION_SEGMENT}$`),
  new RegExp(`^POST /api/advx/arena/challenges/${CHALLENGE_VERSION_SEGMENT}/submissions$`),
  new RegExp(`^POST /api/advx/arena/submissions/${UUID_SEGMENT}/runs$`),
  new RegExp(`^GET /api/advx/arena/runs/${UUID_SEGMENT}$`),
  new RegExp(`^GET /api/advx/arena/runs/${UUID_SEGMENT}/events$`),
  new RegExp(`^POST /api/advx/arena/runs/${UUID_SEGMENT}/cancel$`),
  new RegExp(`^GET /api/advx/arena/runs/${UUID_SEGMENT}/result$`),
] as const;

const FULLY_DENIED_SOURCES: ReadonlySet<Express.Request["actor"]["source"]> = new Set([
  "board_key",
  "cloud_tenant",
]);

const AGENT_EXACT_ROUTES = new Set([
  "GET /api/issues",
  "GET /api/agents/me",
  "GET /api/agents/me/inbox-lite",
  "GET /api/agents/me/inbox/mine",
] as const);

const AGENT_ROUTE_PATTERNS = [
  new RegExp(`^(?:GET|PATCH) /api/issues/${UUID_SEGMENT}$`),
  new RegExp(`^GET /api/issues/${UUID_SEGMENT}/heartbeat-context$`),
  new RegExp(`^POST /api/issues/${UUID_SEGMENT}/(?:checkout|release|read|children)$`),
  new RegExp(`^(?:GET|POST) /api/issues/${UUID_SEGMENT}/(?:comments|work-products|interactions)$`),
  new RegExp(`^GET /api/issues/${UUID_SEGMENT}/(?:attachments|documents)$`),
  new RegExp(`^GET /api/attachments/${UUID_SEGMENT}/content$`),
  new RegExp(`^POST /api/companies/${UUID_SEGMENT}/issues$`),
] as const;

const AGENT_SOURCES: ReadonlySet<Express.Request["actor"]["source"]> = new Set([
  "agent_key",
  "agent_jwt",
]);

function matchesRoute(
  route: string,
  exactRoutes: ReadonlySet<string>,
  patterns: readonly RegExp[],
): boolean {
  return exactRoutes.has(route) || patterns.some((pattern) => pattern.test(route));
}

function requestRoute(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function isTeenxChildPublicRouteAllowed(method: string, path: string): boolean {
  return matchesRoute(requestRoute(method, path), PUBLIC_EXACT_ROUTES, PUBLIC_ROUTE_PATTERNS);
}

export function isTeenxChildBrowserRouteAllowed(method: string, path: string): boolean {
  return matchesRoute(requestRoute(method, path), BROWSER_EXACT_ROUTES, BROWSER_ROUTE_PATTERNS);
}

function isTeenxChildAgentRouteAllowed(method: string, path: string): boolean {
  return matchesRoute(
    requestRoute(method, path),
    AGENT_EXACT_ROUTES,
    AGENT_ROUTE_PATTERNS,
  );
}

function isUnambiguousPath(path: string, originalUrl: string): boolean {
  const rawPath = originalUrl.split("?", 1)[0] ?? "";
  if (path !== rawPath || !path.startsWith("/") || rawPath.includes("%") || rawPath.includes("\\")) {
    return false;
  }
  return !path.split("/").some((segment) => segment === "." || segment === "..");
}

export function sendTeenxChildApiDenied(response: Response): void {
  response.status(403).json({
    error: "TeenX child API access denied",
    code: TEENX_CHILD_API_DENIED_CODE,
  });
}

function isCoherentActor(actor: Express.Request["actor"]): boolean {
  if (actor.source === "none") return actor.type === "none";
  if (actor.source === "session") {
    return actor.type === "board" && Boolean(actor.userId && actor.sessionId);
  }
  if (actor.source === "local_implicit") {
    return actor.type === "board" && Boolean(actor.userId);
  }
  if (actor.source === "agent_key") {
    return actor.type === "agent" && Boolean(actor.agentId && actor.companyId && actor.keyId);
  }
  if (actor.source === "agent_jwt") {
    return actor.type === "agent" && Boolean(actor.agentId && actor.companyId && actor.runId);
  }
  return false;
}

export function teenxChildApiBoundary(config: TeenxChildConfig): RequestHandler {
  return (request, response, next) => {
    if (!config.enabled) {
      next();
      return;
    }

    if (!isUnambiguousPath(request.path, request.originalUrl)) {
      sendTeenxChildApiDenied(response);
      return;
    }
    const source = request.actor.source;
    if (FULLY_DENIED_SOURCES.has(source)) {
      sendTeenxChildApiDenied(response);
      return;
    }
    if (!isCoherentActor(request.actor)) {
      sendTeenxChildApiDenied(response);
      return;
    }
    if (AGENT_SOURCES.has(source)) {
      if (isTeenxChildAgentRouteAllowed(request.method, request.path)) {
        next();
        return;
      }
      sendTeenxChildApiDenied(response);
      return;
    }
    if (source === "none") {
      if (isTeenxChildPublicRouteAllowed(request.method, request.path)) {
        next();
        return;
      }
      sendTeenxChildApiDenied(response);
      return;
    }
    if (source === "local_implicit" && !config.allowLocalImplicit) {
      sendTeenxChildApiDenied(response);
      return;
    }
    if (
      (source === "session" || source === "local_implicit") &&
      isTeenxChildBrowserRouteAllowed(request.method, request.path)
    ) {
      next();
      return;
    }
    sendTeenxChildApiDenied(response);
  };
}
