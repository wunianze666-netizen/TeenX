import { getDemoCommunity, getForumOverview } from "./forum-api";
import { profileApi } from "./profile-api";

export { ArenaApiError, arenaApi } from "./arena-api";
export type {
  ArenaChallengeDetail,
  ArenaChallengeStatus,
  ArenaChallengeSummary,
  ArenaDimensionDefinition,
  ArenaEventConnection,
  ArenaEventStreamOptions,
  ArenaEventStreamResult,
  ArenaProgressEvent,
  ArenaRunDimension,
  ArenaRunStatus,
  ArenaStage,
  ArenaTerminalEvent,
  PublicArenaBoundTeamVersion,
  PublicArenaDimensionScore,
  PublicArenaEvidence,
  PublicArenaRunDetail,
  PublicArenaRunState,
  PublicArenaScore,
  PublicArenaSubScore,
  PublicSubmission,
} from "./arena-contracts";
export { ArenaSseProtocolError } from "./arena-events";
export type { DemoCommunity, DemoCommunityCategory, DemoCommunityTopic, ForumActivity, ForumBookmark, ForumOverview } from "./forum-api";
export { AdvxApiError } from "./profile-api";
export type {
  AdvxCaptainProfile,
  ContactAction,
  ContactCounterpart,
  ContactDecision,
  ContactGrantSummary,
  ContactMutationResponse,
  ContactPage,
  ContactRequestBox,
  ContactRequestSummary,
  ContactState,
  IdentityInput,
  MeSummary,
  ProfilePrivacy,
  UpdatedIdentity,
  ViewerActions,
} from "./profile-contracts";

const BASE = "/api/advx";

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({ error: response.statusText }));
    const message = payload && typeof payload === "object" && !Array.isArray(payload) && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "请求失败";
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export interface Team {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly memberCount: number;
  readonly versionCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Member {
  readonly id: string;
  readonly teamId: string;
  readonly name: string;
  readonly roleTemplate: string | null;
  readonly title: string | null;
  readonly status: string;
  readonly responsibilities: string | null;
  readonly tools: readonly string[];
  readonly skills: readonly string[];
  readonly collaboration: { readonly reportsTo: string | null; readonly canDelegateTo: readonly string[] };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RoleTemplate {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly responsibilities: string;
  readonly defaultTools: readonly string[];
  readonly defaultSkills: readonly string[];
  readonly collaboration: { readonly reportsTo: string | null; readonly canDelegateTo: readonly string[] };
  readonly icon: string;
}

export interface Tool {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
}

export interface TestTask {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

export interface VersionSnapshot {
  readonly id: string;
  readonly versionNumber: number;
  readonly label: string | null;
  readonly snapshot: {
    readonly teamName: string;
    readonly members: readonly {
      readonly name: string;
      readonly roleTemplate: string | null;
      readonly responsibilities: string | null;
      readonly tools: readonly string[];
      readonly skills: readonly string[];
    }[];
  };
  readonly createdAt: string;
}

export interface ActivityEntry {
  readonly action: string;
  readonly entityType: string;
  readonly createdAt: string;
}

export interface TestRunResult {
  readonly status: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly resultSummary: string | null;
  readonly activity: readonly ActivityEntry[];
  readonly products: readonly { readonly title: string; readonly type: string; readonly summary: string | null }[];
}

export interface DemoBootstrap {
  readonly profile: "prepared_demo" | "prepared_replay";
  readonly team: Team;
  readonly members: readonly Member[];
  readonly created: boolean;
}

export interface DemoPreparedSubmission {
  readonly run: {
    readonly runId: string;
    readonly status: string;
    readonly reused: boolean;
  };
}

export interface DemoLeaderboardEntry {
  readonly rank: number;
  readonly teamId: string;
  readonly teamName: string;
  readonly score: number;
  readonly completedAt: string;
  readonly isCurrent: boolean;
}

export interface DemoLeaderboard {
  readonly profile: "prepared_demo" | "prepared_replay";
  readonly mode: "prepared_fixture";
  readonly official: false;
  readonly challenge: {
    readonly challengeVersionId: string;
    readonly title: string;
    readonly totalMaxScore: number;
  };
  readonly entries: readonly DemoLeaderboardEntry[];
  readonly currentTeamRank: number | null;
}

export const api = {
  ...profileApi,
  forumOverview: getForumOverview,
  demoCommunity: getDemoCommunity,
  demoLeaderboard: () => fetch(`${BASE}/demo/leaderboard`).then(json<DemoLeaderboard>),
  bootstrapDemo: () => fetch(`${BASE}/demo/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).then(json<DemoBootstrap>),
  prepareDemoArena: () => fetch(`${BASE}/demo/prepared-submission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).then(json<DemoPreparedSubmission>),
  createTeam: (body: { readonly name?: string; readonly description?: string | null }) =>
    fetch(`${BASE}/teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json<Team>),
  getMyTeam: () => fetch(`${BASE}/teams/mine`).then(json<Team>),
  listTeams: () => fetch(`${BASE}/teams`).then(json<Team[]>),
  updateTeam: (id: string, body: { readonly name?: string; readonly description?: string | null }) =>
    fetch(`${BASE}/teams/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json<Team>),
  listMembers: (teamId: string) => fetch(`${BASE}/teams/${teamId}/members`).then(json<Member[]>),
  addMember: (teamId: string, body: { readonly name: string; readonly roleTemplate: string; readonly responsibilities?: string; readonly tools?: readonly string[] }) =>
    fetch(`${BASE}/teams/${teamId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json<Member>),
  updateMember: (teamId: string, memberId: string, body: Partial<{
    readonly name: string;
    readonly roleTemplate: string;
    readonly responsibilities: string;
    readonly tools: readonly string[];
    readonly skills: readonly string[];
    readonly reportsTo: string | null;
    readonly canDelegateTo: readonly string[];
  }>) => fetch(`${BASE}/teams/${teamId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(json<Member>),
  deleteMember: (teamId: string, memberId: string) =>
    fetch(`${BASE}/teams/${teamId}/members/${memberId}`, { method: "DELETE" }).then(json<{ readonly ok: boolean }>),
  roleTemplates: () => fetch(`${BASE}/role-templates`).then(json<RoleTemplate[]>),
  tools: () => fetch(`${BASE}/tools`).then(json<Tool[]>),
  testTasks: () => fetch(`${BASE}/test-tasks`).then(json<TestTask[]>),
  createVersion: (teamId: string, body: { readonly label?: string | null }) =>
    fetch(`${BASE}/teams/${teamId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json<VersionSnapshot>),
  listVersions: (teamId: string) => fetch(`${BASE}/teams/${teamId}/versions`).then(json<VersionSnapshot[]>),
  listActivity: (teamId: string) => fetch(`${BASE}/teams/${teamId}/activity?limit=50`).then(json<ActivityEntry[]>),
  startTestRun: (teamId: string, testTaskSlug: string) =>
    fetch(`${BASE}/teams/${teamId}/test-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testTaskSlug }) })
      .then(json<{ readonly runId: string | null; readonly status: string }>),
  getTestRun: (runId: string) => fetch(`${BASE}/test-runs/${runId}`).then(json<TestRunResult>),
};
