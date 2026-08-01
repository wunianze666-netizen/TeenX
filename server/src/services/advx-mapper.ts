import type { agents as agentsTable, companies } from "@paperclipai/db";

type CompanyRow = typeof companies.$inferSelect;
type AgentRow = typeof agentsTable.$inferSelect;

export const ADVX_MODEL = "deepseek" as const;
export const ADVX_MODEL_LABEL = "DeepSeek" as const;
export const ADVX_DEFAULT_TEAM_NAME = "我的 AI 队伍";
export const ADVX_MAX_MEMBERS = 8;
export const ADVX_MIN_MEMBERS = 1;
export const ADVX_MAX_VERSIONS = 20;

const BUDGET_FIELDS = new Set<string>([
  "budgetMonthlyCents",
  "spentMonthlyCents",
  "budget",
  "cost",
  "credits",
  "spend",
  "spent",
  "totalCostUsd",
  "costUsd",
]);

function isBudgetKey(key: string): boolean {
  if (BUDGET_FIELDS.has(key)) return true;
  const lower = key.toLowerCase();
  return lower.includes("budget") || lower.includes("cost") || lower.includes("credit") || lower.includes("spend");
}

function stripBudget<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isBudgetKey(key)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

export interface AdvxTeamView {
  id: string;
  name: string;
  description: string | null;
  status: string;
  model: { id: string; label: string };
  memberCount: number;
  versionCount: number;
  createdAt: string;
  updatedAt: string;
}

type TeamLike = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function toTeamView(company: TeamLike, opts: { memberCount: number; versionCount: number }): AdvxTeamView {
  return {
    id: company.id,
    name: company.name,
    description: company.description ?? null,
    status: company.status,
    model: { id: ADVX_MODEL, label: ADVX_MODEL_LABEL },
    memberCount: opts.memberCount,
    versionCount: opts.versionCount,
    createdAt: new Date(company.createdAt as unknown as Date).toISOString(),
    updatedAt: new Date(company.updatedAt as unknown as Date).toISOString(),
  };
}

export interface AdvxMemberView {
  id: string;
  teamId: string;
  name: string;
  roleTemplate: string | null;
  title: string | null;
  status: string;
  responsibilities: string | null;
  tools: string[];
  skills: string[];
  collaboration: {
    reportsTo: string | null;
    canDelegateTo: string[];
  };
  createdAt: string;
  updatedAt: string;
}

interface AdvxAgentConfig {
  roleTemplate: string | null;
  responsibilities: string | null;
  tools: string[];
  skills: string[];
  collaboration: {
    reportsTo: string | null;
    canDelegateTo: string[];
  };
}

function readAgentConfig(raw: unknown): AdvxAgentConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { roleTemplate: null, responsibilities: null, tools: [], skills: [], collaboration: { reportsTo: null, canDelegateTo: [] } };
  }
  const cfg = raw as Record<string, unknown>;
  const collaborationRaw = cfg.collaboration;
  const collaboration: AdvxAgentConfig["collaboration"] =
    collaborationRaw && typeof collaborationRaw === "object" && !Array.isArray(collaborationRaw)
      ? {
          reportsTo: typeof (collaborationRaw as Record<string, unknown>).reportsTo === "string"
            ? (collaborationRaw as Record<string, unknown>).reportsTo as string
            : null,
          canDelegateTo: Array.isArray((collaborationRaw as Record<string, unknown>).canDelegateTo)
            ? ((collaborationRaw as Record<string, unknown>).canDelegateTo as unknown[]).filter(
                (x): x is string => typeof x === "string",
              )
            : [],
        }
      : { reportsTo: null, canDelegateTo: [] };
  return {
    roleTemplate: typeof cfg.roleTemplate === "string" ? cfg.roleTemplate : null,
    responsibilities: typeof cfg.responsibilities === "string" ? cfg.responsibilities : null,
    tools: Array.isArray(cfg.tools) ? cfg.tools.filter((t): t is string => typeof t === "string") : [],
    skills: Array.isArray(cfg.skills) ? cfg.skills.filter((s): s is string => typeof s === "string") : [],
    collaboration,
  };
}

export function toMemberView(agent: AgentRow): AdvxMemberView {
  const cfg = readAgentConfig((agent as { metadata?: unknown }).metadata);
  const cleaned = stripBudget(agent as unknown as Record<string, unknown>);
  return {
    id: cleaned.id as string,
    teamId: cleaned.companyId as string,
    name: cleaned.name as string,
    roleTemplate: cfg.roleTemplate,
    title: (cleaned.title as string | null | undefined) ?? null,
    status: cleaned.status as string,
    responsibilities: cfg.responsibilities,
    tools: cfg.tools,
    skills: cfg.skills,
    collaboration: cfg.collaboration,
    createdAt: new Date(cleaned.createdAt as unknown as Date).toISOString(),
    updatedAt: new Date(cleaned.updatedAt as unknown as Date).toISOString(),
  };
}

export function buildAgentMetadata(input: {
  roleTemplate?: string | null;
  responsibilities?: string | null;
  tools?: string[];
  skills?: string[];
  reportsTo?: string | null;
  canDelegateTo?: string[];
}): Record<string, unknown> {
  return {
    roleTemplate: input.roleTemplate ?? null,
    responsibilities: input.responsibilities ?? null,
    tools: input.tools ?? [],
    skills: input.skills ?? [],
    collaboration: {
      reportsTo: input.reportsTo ?? null,
      canDelegateTo: input.canDelegateTo ?? [],
    },
    advx: true,
  };
}

export const BUDGET_STRIP_FIELDS = BUDGET_FIELDS;
