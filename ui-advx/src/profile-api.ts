import type {
  AdvxCaptainProfile,
  ContactAction,
  ContactDecision,
  ContactGrantSummary,
  ContactMutationResponse,
  ContactPage,
  ContactRequestBox,
  ContactRequestSummary,
  IdentityInput,
  MeSummary,
  ProfilePrivacy,
  UpdatedIdentity,
} from "./profile-contracts";

const PROFILE_BASE = "/api/advx";
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export class AdvxApiError extends Error {
  readonly name = "AdvxApiError";

  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

function errorField(payload: unknown, key: "error" | "code"): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = Reflect.get(payload, key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function profileJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new AdvxApiError(
      errorField(payload, "error") ?? (response.statusText.trim() || "个人资料请求失败"),
      response.status,
      errorField(payload, "code"),
    );
  }
  return response.json();
}

function jsonRequest(method: "PATCH" | "POST", body: unknown): RequestInit {
  return { method, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export const profileApi = {
  me: (signal?: AbortSignal) => fetch(`${PROFILE_BASE}/me`, signal ? { signal } : undefined).then(profileJson<MeSummary>),
  updateIdentity: (body: IdentityInput) =>
    fetch(`${PROFILE_BASE}/me/identity`, jsonRequest("PATCH", body)).then(profileJson<UpdatedIdentity>),
  updateProfile: (body: { readonly name: string }) =>
    fetch(`${PROFILE_BASE}/me/identity`, jsonRequest("PATCH", { nickname: body.name })).then(profileJson<UpdatedIdentity>),
  getPrivacy: (signal?: AbortSignal) =>
    fetch(`${PROFILE_BASE}/me/privacy`, signal ? { signal } : undefined).then(profileJson<ProfilePrivacy>),
  updatePrivacy: (body: ProfilePrivacy) =>
    fetch(`${PROFILE_BASE}/me/privacy`, jsonRequest("PATCH", body)).then(profileJson<ProfilePrivacy>),
  getCaptainProfile: (publicId: string, signal?: AbortSignal) =>
    fetch(`${PROFILE_BASE}/captains/${encodeURIComponent(publicId)}/profile`, { signal, cache: "no-store" })
      .then(profileJson<AdvxCaptainProfile>),
  listContactRequests: (box: ContactRequestBox, cursor?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ box });
    if (cursor !== undefined) query.set("cursor", cursor);
    return fetch(`${PROFILE_BASE}/me/contact-requests?${query.toString()}`, signal ? { signal } : undefined)
      .then(profileJson<ContactPage<ContactRequestSummary>>);
  },
  listContacts: (cursor?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (cursor !== undefined) query.set("cursor", cursor);
    query.set("limit", "50");
    return fetch(`${PROFILE_BASE}/me/contacts?${query.toString()}`, signal ? { signal } : undefined)
      .then(profileJson<ContactPage<ContactGrantSummary>>);
  },
  createContactRequest: (targetPublicId: string) =>
    fetch(`${PROFILE_BASE}/contact-requests`, jsonRequest("POST", { targetPublicId }))
      .then(profileJson<ContactMutationResponse>),
  decideContactRequest: (requestId: string, decision: ContactDecision) =>
    fetch(`${PROFILE_BASE}/contact-requests/${encodeURIComponent(requestId)}`, jsonRequest("PATCH", { decision }))
      .then(profileJson<ContactMutationResponse>),
  revokeContactRequest: (requestId: string) =>
    fetch(`${PROFILE_BASE}/contact-requests/${encodeURIComponent(requestId)}`, { method: "DELETE" })
      .then(profileJson<ContactMutationResponse>),
  changeContact: (publicId: string, action: ContactAction) =>
    fetch(`${PROFILE_BASE}/contacts/${encodeURIComponent(publicId)}?action=${action}`, { method: "DELETE" })
      .then(profileJson<ContactMutationResponse>),
  unblockContact: (publicId: string) =>
    fetch(`${PROFILE_BASE}/contacts/${encodeURIComponent(publicId)}/unblock`, jsonRequest("POST", {}))
      .then(profileJson<ContactMutationResponse>),
} as const;
