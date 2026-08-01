import { sql, type SQL } from "drizzle-orm";
import { issues } from "@paperclipai/db";

const ARENA_SUBMISSION_ORIGIN_KIND = "advx_arena_submission";

type ArenaIssue = {
  readonly id: string;
  readonly originKind?: string | null;
  readonly responsibleUserId?: string | null;
};

type Actor = {
  readonly type: string;
  readonly userId?: string;
};

export type GenericIssueReadScope = {
  readonly captainId: string | null;
};

export type GenericIssueMutationBlock = "not_found" | "immutable";

export function isArenaSubmissionIssue(issue: ArenaIssue): boolean {
  return issue.originKind === ARENA_SUBMISSION_ORIGIN_KIND;
}

export function canReadArenaIssue(actor: Actor, issue: ArenaIssue): boolean {
  return canReadArenaIssueInScope(genericIssueReadScopeForActor(actor), issue);
}

export function canMutateArenaIssue(issue: ArenaIssue): boolean {
  return !isArenaSubmissionIssue(issue);
}

export function genericIssueReadScopeForActor(actor: Actor): GenericIssueReadScope {
  return {
    captainId: actor.type === "board" && actor.userId ? actor.userId : null,
  };
}

export function canReadArenaIssueInScope(scope: GenericIssueReadScope, issue: ArenaIssue): boolean {
  return !isArenaSubmissionIssue(issue)
    || (Boolean(scope.captainId) && scope.captainId === issue.responsibleUserId);
}

export function genericIssueReadCondition(scope: GenericIssueReadScope): SQL {
  if (!scope.captainId) {
    return sql<boolean>`${issues.originKind} IS DISTINCT FROM ${ARENA_SUBMISSION_ORIGIN_KIND}`;
  }
  return sql<boolean>`(
    ${issues.originKind} IS DISTINCT FROM ${ARENA_SUBMISSION_ORIGIN_KIND}
    OR ${issues.responsibleUserId} = ${scope.captainId}
  )`;
}

export function genericIssueMutationBlock(
  actor: Actor,
  issue: ArenaIssue,
): GenericIssueMutationBlock | null {
  if (!isArenaSubmissionIssue(issue)) return null;
  return canReadArenaIssue(actor, issue) ? "immutable" : "not_found";
}

export function projectArenaIssueForGenericRead<T extends ArenaIssue>(issue: T): T {
  if (!isArenaSubmissionIssue(issue)) return issue;
  return { ...issue, executionState: null, originFingerprint: null };
}

export function projectArenaWorkProductForGenericRead<T extends { readonly metadata?: unknown }>(product: T): T {
  return { ...product, metadata: null };
}
