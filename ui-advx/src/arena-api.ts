import type {
  ArenaChallengeDetail,
  ArenaChallengeSummary,
  ArenaEventStreamOptions,
  ArenaRunStatus,
  PublicArenaRunDetail,
  PublicArenaRunState,
  PublicSubmission,
} from "./arena-contracts";
import { connectArenaEvents } from "./arena-events";

const ARENA_BASE = "/api/advx/arena";

export class ArenaApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "ArenaApiError";
    this.status = status;
    this.code = code;
  }
}

async function arenaErrorFromResponse(response: Response): Promise<ArenaApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  const message = typeof record?.error === "string" && record.error ? record.error : response.statusText || "Arena 请求失败";
  const code = typeof record?.code === "string" ? record.code : null;
  return new ArenaApiError(message, response.status, code);
}

async function arenaJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw await arenaErrorFromResponse(response);
  return response.json() as Promise<T>;
}

export const arenaApi = {
  listChallenges: () => fetch(`${ARENA_BASE}/challenges`).then(arenaJson<ArenaChallengeSummary[]>),
  getChallenge: (challengeVersionId: string) =>
    fetch(`${ARENA_BASE}/challenges/${encodeURIComponent(challengeVersionId)}`).then(arenaJson<ArenaChallengeDetail>),
  createSubmission: (challengeVersionId: string, file: File, teamVersionId?: string, signal?: AbortSignal) => {
    const body = new FormData();
    body.append("file", file);
    if (teamVersionId) body.append("teamVersionId", teamVersionId);
    return fetch(`${ARENA_BASE}/challenges/${encodeURIComponent(challengeVersionId)}/submissions`, {
      method: "POST",
      body,
      signal,
    }).then(arenaJson<PublicSubmission>);
  },
  startRun: (submissionId: string, signal?: AbortSignal) =>
    fetch(`${ARENA_BASE}/submissions/${encodeURIComponent(submissionId)}/runs`, { method: "POST", signal })
      .then(arenaJson<{ readonly runId: string; readonly status: ArenaRunStatus; readonly reused: boolean }>),
  getRun: (runId: string, signal?: AbortSignal) =>
    fetch(`${ARENA_BASE}/runs/${encodeURIComponent(runId)}`, { signal, cache: "no-store" }).then(arenaJson<PublicArenaRunDetail>),
  connectRunEvents: (runId: string, options: ArenaEventStreamOptions) =>
    connectArenaEvents({ baseUrl: ARENA_BASE, runId, options, errorFromResponse: arenaErrorFromResponse }),
  cancelRun: (runId: string, signal?: AbortSignal) =>
    fetch(`${ARENA_BASE}/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", signal }).then(arenaJson<PublicArenaRunState>),
  getResult: (runId: string, signal?: AbortSignal): Promise<unknown> =>
    fetch(`${ARENA_BASE}/runs/${encodeURIComponent(runId)}/result`, { signal, cache: "no-store" }).then(arenaJson<unknown>),
};
