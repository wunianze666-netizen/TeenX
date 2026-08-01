import type { ContactGrantSummary, ContactRequestSummary } from "./profile-contracts";

const PUBLIC_CAPTAIN_ID = /^captain_v1_[A-Za-z0-9_-]{43}$/;

export type ReconciledSave<T> = {
  readonly current: T;
  readonly saved: T;
};

export type RevisionSave<T> = ReconciledSave<T> & {
  readonly currentRevision: number;
  readonly submittedRevision: number;
};

export function reconcileSavedValue<T>(save: RevisionSave<T>): ReconciledSave<T> {
  return {
    current: save.currentRevision === save.submittedRevision ? save.saved : save.current,
    saved: save.saved,
  };
}

export function appendContactRequests(
  current: readonly ContactRequestSummary[],
  incoming: readonly ContactRequestSummary[],
): readonly ContactRequestSummary[] {
  const known = new Set(current.map((item) => item.requestId));
  return [...current, ...incoming.filter((item) => !known.has(item.requestId))];
}

export function appendContactGrants(
  current: readonly ContactGrantSummary[],
  incoming: readonly ContactGrantSummary[],
): readonly ContactGrantSummary[] {
  const known = new Set(current.map((item) => item.counterpart.publicId));
  return [...current, ...incoming.filter((item) => !known.has(item.counterpart.publicId))];
}

export function captainProfilePath(publicId: string): string | null {
  return isCaptainPublicId(publicId) ? `/captains/${encodeURIComponent(publicId)}` : null;
}

export function isCaptainPublicId(publicId: string): boolean {
  return PUBLIC_CAPTAIN_ID.test(publicId);
}
