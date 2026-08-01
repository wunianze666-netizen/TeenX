# Handoff 10 TeenX Profile Enhancement Report

Date: 2026-07-25

## Scope

This report covers the implemented TeenX Profile safety handoff across the Paperclip/ADVX and TeenX Forum working trees. It includes the child API boundary, opaque Captain identity, Profile BFF and UI, signed bridge client, safe Discourse Connect payload, redacted ADVX DTOs, and Discourse Profile/PM enforcement. The separate Profile source repository remained read-only and was used only as a design and concurrency reference.

No Paperclip database schema was changed. Existing user, Team, run, activity, and version storage remains authoritative.

## Child API Boundary

`TEENX_CHILD_MODE=true` installs a global deny-by-default middleware immediately after actor resolution. Startup fails when the gate is absent or when the deployment mode is incompatible.

- Production requires authenticated, public deployment.
- Local implicit Captain fixtures require `TEENX_ALLOW_LOCAL_IMPLICIT=true`, non-production, `local_trusted`, and private exposure.
- Board-key and cloud-tenant actors are rejected in child mode. Coherent `agent_key` and `agent_jwt` actors retain the audited core agent API they need, but cannot access browser identity, Profile, contact, forum-session, or SSO surfaces.
- The allowlist is an exact HTTP method/path contract. Core cost, budget, approval, execution-policy, secret, adapter, productivity-profile, and administrative routes remain inaccessible.
- Better Auth is limited to the minimum session and sign-in/sign-out surface needed by the child deployment.

## Identity And Profile Contract

Captain public identity is `captain_v1_<base64url HMAC-SHA256>` derived with `TEENX_PROFILE_PUBLIC_ID_SECRET`. Raw auth IDs, email addresses, provider identities, model settings, cost fields, token data, and internal activity identifiers are not returned by the child Profile API.

Paperclip exposes these child-safe routes:

- `GET /api/advx/session`
- `GET /api/advx/me`
- `PATCH /api/advx/me/identity`
- `GET|PATCH /api/advx/me/privacy`
- `GET /api/advx/captains/:publicId/profile`
- `GET|POST|PATCH|DELETE /api/advx/contacts/*`
- `GET /api/advx/forum/session`
- `GET /api/advx/forum/sso`

Public nickname, Team name, forum text, avatar paths, and forum message paths cross explicit safety validators. Avatar and forum paths must be same-origin relative paths. P0 does not add avatar upload or external avatar URLs.

## Profile Visibility Matrix

| Field | Self | Other Captain | Bridge unavailable |
| --- | --- | --- | --- |
| `publicId`, safe nickname, joined date | visible | visible | visible |
| Safe Discourse-relative avatar | bridge policy | bridge policy | omitted |
| Team name/counts | privacy policy | privacy policy | self only |
| Forum counts/activity | privacy policy | privacy policy | omitted |
| Contact state/actions | visible | visible | unavailable for others |
| Email/raw auth ID/model/cost/token | never | never | never |
| Arena score/rank/submission/result | never | never | never |

## Contact Action Matrix

| State | Request DM | Respond | Message | Block | Unblock |
| --- | ---: | ---: | ---: | ---: | ---: |
| self | no | no | no | no | no |
| none | policy | no | no | yes | no |
| incoming request | no | yes | no | yes | no |
| outgoing request | no | no | no | yes | no |
| granted | no | no | yes | yes | no |
| blocked | no | no | no | no | yes |
| unavailable | no | no | no | no | no |

Paperclip forwards relationship commands only through the signed bridge and never stores a second message or relationship system. Contact request bodies contain typed identifiers and decisions only; free-text messages are not accepted by the BFF.

## Bridge And SSO

The bridge uses one bounded request with no automatic retry. Mutations carry a fresh nonce. The HMAC-SHA256 signature covers method, bridge path, canonical query, body hash, timestamp, and nonce; the key ID selects the configured verification secret and scopes nonce claims. Responses are parsed with strict Zod schemas before entering the application.

Discourse Connect uses opaque `publicId` as the external identity and a derived `tx_<digest16>` username. Admin and moderator flags are never emitted. `TEENX_PROFILE_SSO_MAINTENANCE_LOCK=true` returns maintenance status during identity migration. The forum session BFF forwards only the approved Discourse cookies and rejects a session whose username differs from the expected opaque username.

## ADVX Profile UI

The existing `ui-advx` router and seven-color token system now provide:

- `/me/settings` for nickname and independent privacy controls with revision guards, dirty-navigation protection, and stale-response protection. Privacy controls remain locked until an authoritative privacy read succeeds; failed hydration exposes an explicit retry without allowing private defaults to be edited or saved.
- `/me/contacts` for cursor-based request/grant/block management without free-text request messages.
- `/captains/:publicId` for authenticated, privacy-filtered Captain profiles driven only by server-provided `viewerActions`.
- An enhanced `/me` with owner-only Arena history, safe forum links, and explicit partial/unavailable states.

The UI preserves the single router and existing API layer, validates same-origin forum/avatar paths defensively, and does not add follow, public score/rank, stranger-DM, user-directory, or second-message-system behavior.

## Discourse Safety Plugins

The Forum working tree contains `teenx-profile-safety` and the strengthened `teenx-pm-safety` plugins. Together they provide signed bridge verification with timestamp/nonce replay protection, privacy preference storage, contact request/grant/block state, opaque-ID SSO migration tasks, and pre-persistence PM validation.

Child PM creation, edit, reply, and participant invitation are denied unless the topic is exactly one authorized pair with an active grant. External contact details, uploads, group PMs, third-party invitations, and replies after grant revocation are rejected before persistence. Deployment settings disable Chat and the user directory, restrict PM recipients to one, and lock SSO-controlled identity/profile fields.

## Configuration

Child mode requires independent secrets and an explicit SSO migration state:

```text
TEENX_CHILD_MODE=true
TEENX_ALLOW_LOCAL_IMPLICIT=false
TEENX_PROFILE_PUBLIC_ID_SECRET=<at least 32 characters>
TEENX_PROFILE_BRIDGE_BASE_URL=https://<internal-profile-origin>
TEENX_PROFILE_BRIDGE_SECRET=<at least 32 characters>
TEENX_PROFILE_BRIDGE_KEY_ID=<active-key-id>
TEENX_PROFILE_SSO_MAINTENANCE_LOCK=true
TEENX_DISCOURSE_CONNECT_SECRET=<at least 32 characters>
```

Optional bounded controls are `TEENX_PROFILE_BRIDGE_TIMEOUT_MS`, `TEENX_PROFILE_PUBLIC_ID_CACHE_TTL_MS`, and `TEENX_PROFILE_PUBLIC_ID_SCAN_CAP`.

## Deployment Order

1. Deploy the Profile bridge and Discourse safety plugin while Discourse Connect remains maintenance-locked.
2. Configure bridge/public-ID secrets and key IDs independently on both sides.
3. Revoke child board keys and audit existing child credentials.
4. Run the external Profile/Discourse migrations for opaque external IDs, role downgrades, hidden profile fields, privacy defaults, and contact-state records.
5. Verify bridge signing, replay rejection, direct Discourse API restrictions, and identity uniqueness.
6. Deploy Paperclip with `TEENX_CHILD_MODE=true` and verify deny-by-default behavior.
7. Unlock SSO only after old raw-ID payloads can no longer recreate or overwrite child identities.

## Remaining External Work

- Production operations still require protected bridge/Discourse credentials and administrator authorization for a real SSO/contact smoke test.
- Before cutover, an operator must create and verify an independent non-child administrator, run the dry-run and migration tasks under the SSO maintenance lock, downgrade and audit existing child staff/API principals, invalidate affected sessions, and rotate any exposed credentials.
- Production must enumerate remaining admin/moderator/API principals and verify Chat/history access, direct Discourse profile/card/avatar endpoints, replay rejection, identity uniqueness, and rejection of legacy raw-ID SSO payloads before unlocking SSO.
- These production mutations were not performed or claimed by repository tests.

## Verification

Verified on 2026-07-25:

- `pnpm --filter @paperclipai/server test -- teenx`: 13 files and 105 tests passed.
- Targeted Profile server verification: 7 files and 62 tests passed.
- `pnpm --filter @paperclipai/server typecheck`: passed.
- Forum plugin specs for `teenx-pm-safety` and `teenx-profile-safety`: 161 examples, 0 failures under Ruby 3.4; RuboCop inspected 68 plugin files with no offenses. This includes bounded contacts pagination, first-child PM-group denial, group-only cutover exposure, credential inventory, and local-login lockdown regressions.
- ADVX Profile Vitest suite: 5 files and 14 tests passed.
- ADVX Profile functional Playwright suites: 28/28 scenarios passed at 1440×900 and 390×844, including delayed, stale, failed, and retried privacy hydration, approved-contact cursor pagination, strict public-ID routing, and owner-only non-official Arena state. After the final CJK phrase-boundary fix, the dedicated full-page visual-capture pass was regenerated and completed 12/12 across 1440×900, 768×1024, and 390×844; its Me scenario also asserts both privacy sentences and their computed `white-space: nowrap` behavior.
- `pnpm --filter @advx/ui typecheck` and `pnpm --filter @advx/ui build`: passed; the build emitted only the pre-existing Landing shader chunk-size warning.
- TS/TSX hex scan under `ui-advx/src`: no matches.
- Visual capture hygiene: 12/12 current full-page screenshots had valid PNG signatures, target viewport widths, complete compositing, and modification times later than the latest relevant UI source.
- Final independent visual QA passed on the same fresh 12-image set: Pass A approved design-system, responsive, focus, compositing, and functional integrity; Pass B directly inspected all 12 captures and approved CJK precision, including the two complete mobile Me privacy sentences, `已经发布`, both contact date-times, and `720 / 1000`. Both reviewers reported no blockers; earlier stale or `REVISE` rounds are not counted as completion evidence.
- Live child-mode `GET /api/advx/session` returned an opaque `captain_v1_...` identity.
- Live child-mode operator API and wrong-method requests returned `403 TEENX_CHILD_API_DENIED`.
- Updated `scripts/advx-smoke.sh` completed 14 checks with zero failures on port 3199. The queued test run reached `failed`, which is expected without a configured DeepSeek adapter key.

`pnpm check:token-gates` remains blocked by five pre-existing raw color literals in the legacy `ui/` tree (`Sidebar.tsx`, `Inbox.tsx`, `IssueDetail.tsx`, `Issues.tsx`, and `Routines.tsx`). The ADVX-specific raw-hex gate is clean.
