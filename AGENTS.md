# AGENTS.md

Guidance for human and AI contributors working in this repository.

## 0. ADVX Fork Context (authoritative for this branch)

This repository is a **fork of `paperclipai/paperclip`** on branch `advx/main`. It is the **ADVX** project — an AI team-building platform for ages 11–16. **It does NOT track upstream.** Below are the ADVX-specific rules that override the legacy Paperclip sections later in this file.

### 0.1 Read This First (ADVX)

1. `docs/00-studio-v0.1.md` — full product spec (positioning / concepts / config / architecture)
2. `docs/01-handoff-1-paperclip-moddify.md` — engineering handoff that produced the current state
3. `docs/01-handoff-1-report.md` — what was actually done (this handoff's completion report)
4. `docs/09-handoff-9-report.md` — Arena integration architecture, security boundary, and verification

### 0.2 Term Mapping (L2 semantic layer — schema unchanged)

Paperclip's DB schema is **untouched**. ADVX only remaps the API/UI vocabulary. Internal storage uses Paperclip terms; the `/api/advx/*` surface uses ADVX terms:

| Paperclip term | ADVX term |
|---|---|
| Company | Team（队伍）|
| Agent | 队员 |
| Board User | Captain（队长）|
| Issue | Task（任务）|
| Work Product | 产物 |
| Activity Log | 活动记录 |
| Heartbeat Run | Run（试跑）|

### 0.3 Hard Constraints (do not violate)

1. **Never re-enable budget display.** All `budget`/`cost`/`credits`/`spend` fields are stripped from `/api/advx/*` responses via `advx-mapper.ts`. Do not remove the stripBudget filter.
2. **Never expose model parameters to children.** The platform pins one model (`deepseek`, see `ADVX_MODEL` in `advx-mapper.ts`). Agent `adapterConfig.model` is force-set on creation. Do not surface `temperature`/`max_tokens`.
3. **Never expose the approval gate to children.** Paperclip's Governance & Approvals module is left intact but ADVX does not expose execution-policy endpoints. Keep it that way.
4. **Never modify the Paperclip DB schema.** Add ADVX fields only inside existing JSON `metadata` / `executionState` columns. Version and Arena checkpoints use instance-directory JSON files, not new tables.
5. **Arena scope stops at official challenges and private evaluation.** Do not add child-created challenges, leaderboard, season points, public submissions, or forum-post automation without a new approved handoff.
6. **Arena production judging fails closed.** Missing or policy-mismatched DeepSeek configuration must reject a run. Mock is test/development-only and every Mock score is `official: false`.
7. **Arena internals stay server-only.** Never expose prompts, full source, checkpoint paths, object keys, raw analysis/model errors, `agentRunLog`, model endpoints, token usage, or cost data through ADVX APIs/SSE.

### 0.4 ADVX-added modules

- `server/src/routes/advx.ts` — all `/api/advx/*` routes (teams, members, templates, tools, test-runs, versions, activity)
- `server/src/services/advx-mapper.ts` — term mapping + budget stripping + model pin
- `server/src/services/advx-catalog.ts` — role templates, tool list, test tasks (in-code catalog)
- `server/src/services/advx-versions.ts` — file-based version snapshots
- `server/src/routes/advx-arena.ts` — captain-scoped challenge, submission, run, SSE, cancel, and result API
- `server/src/services/advx-arena/` — ZIP safety, scoring contract, DeepSeek gateway, deterministic evaluator, checkpoint repository, and run lifecycle
- `server/src/services/advx-arena-catalog.ts` + `server/src/built-ins/advx-arena/challenges/` — immutable official challenge versions
- `packages/teams-catalog/catalog/bundled/advx/` — four-role catalog packages (scout / inventor / builder / critic + starter-team)
- `ui-advx/` — React+Vite UI for Studio, Arena, forum, and captain pages
- `scripts/advx-smoke.sh` — end-to-end smoke script
- `scripts/advx-arena-smoke.sh` — Arena upload, idempotency, score, redaction, and activity smoke

### 0.5 DEVX dev commands

```sh
pnpm dev          # Paperclip server on :3100 (dev middleware, embedded PGlite)
pnpm --filter @advx/ui dev   # ADVX UI on :5174 (proxies /api → :3100)
bash scripts/advx-smoke.sh   # end-to-end smoke (needs server running on :3100)
ADVX_ARENA_ALLOW_MOCK=true bash scripts/advx-arena-smoke.sh
pnpm --filter @paperclipai/server typecheck
pnpm --filter @paperclipai/server test -- arena
pnpm --filter @advx/ui typecheck
pnpm --filter @paperclipai/teams-catalog build:manifest
```

> The legacy `pnpm test:run` suite is heavy and unrelated to ADVX additive changes; run it only when modifying Paperclip core. ADVX-specific correctness is covered by the smoke script + typechecks.

### 0.6 Known limitations (this handoff)

- Test runs queue and are queryable, but actual agent execution requires a configured DeepSeek adapter API key; without it, runs end in `failed` (expected).
- Paperclip auto-provisions built-in agents (Reflection Coach, Summarizer) on company creation; these appear as `roleTemplate: null` members. ADVX UI shows them but they are not part of the four-role model.
- `reportsTo` / `canDelegateTo` resolve by role-template slug but are not yet enforced by the runtime (stored in metadata only).
- Arena P0 intentionally supports one server process only; health reports `arena.singleServerOnly: true`. PostgreSQL locks prevent duplicate starts, but checkpoint event fan-out is process-local.
- Arena evaluates a Team Version plus a manually uploaded ZIP. The current Paperclip Agent runtime does not yet guarantee a bounded, immutable ZIP work product, so the UI does not claim that the Studio team automatically produced the submission.
- Real official Arena validation requires protected DeepSeek credentials. Local smoke uses explicit Mock and asserts `official: false`.

---

## 1. Purpose

Paperclip is a control plane for AI-agent companies.
The current implementation target is V1 and is defined in `doc/SPEC-implementation.md`.

## 2. Read This First

Before making changes, read in this order:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

`doc/SPEC.md` is long-horizon product context.
`doc/SPEC-implementation.md` is the concrete V1 build contract.

## 3. Repo Map

- `server/`: Express REST API and orchestration services
- `ui/`: React + Vite board UI
- `packages/db/`: Drizzle schema, migrations, DB clients
- `packages/shared/`: shared types, constants, validators, API path constants
- `packages/adapters/`: agent adapter implementations (Claude, Codex, Cursor, etc.)
- `packages/adapter-utils/`: shared adapter utilities
- `packages/plugins/`: plugin system packages
- `doc/`: operational and product docs

## 4. Dev Setup (Auto DB)

Use embedded PGlite in dev by leaving `DATABASE_URL` unset.

```sh
pnpm install
pnpm dev
```

This starts:

- API: `http://localhost:3100`
- UI: `http://localhost:3100` (served by API server in dev middleware mode)

Quick checks:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Reset local dev DB:

```sh
rm -rf data/pglite
pnpm dev
```

## 5. Core Engineering Rules

1. Keep changes company-scoped.
Every domain entity should be scoped to a company and company boundaries must be enforced in routes/services.

2. Keep contracts synchronized.
If you change schema/API behavior, update all impacted layers:
- `packages/db` schema and exports
- `packages/shared` types/constants/validators
- `server` routes/services
- `ui` API clients and pages

3. Preserve control-plane invariants.
- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for mutating actions

4. Do not replace strategic docs wholesale unless asked.
Prefer additive updates. Keep `doc/SPEC.md` and `doc/SPEC-implementation.md` aligned.

5. Keep repo plan docs dated and centralized.
When you are creating a plan file in the repository itself, new plan documents belong in `doc/plans/` and should use `YYYY-MM-DD-slug.md` filenames. This does not replace Paperclip issue planning: if a Paperclip issue asks for a plan, update the issue `plan` document per the `paperclip` skill instead of creating a repo markdown file.

6. Attach inspectable generated artifacts.
When your task produces a user-inspectable deliverable file, follow the Paperclip skill's "Generated Artifacts and Work Products" workflow before final disposition. In this repo, prefer the self-contained skill helper at `skills/paperclip/scripts/paperclip-upload-artifact.sh` so the file is available through the Paperclip API, create/update an artifact work product when the file is the deliverable, link the uploaded artifact in the final issue comment, and then set status. Do not rely on local filesystem paths as the only access path. If an important file intentionally remains workspace-only, create/update a work product with `metadata.resourceRef.kind: "workspace_file"` and a workspace-relative path, then name that work product and path in the final comment. Treat browse/search as a fallback for recovering workspace files, not the preferred deliverable path. See `doc/AGENT-ARTIFACTS.md` for details and `.mp4`/`.webm` examples.

## 6. Database Change Workflow

When changing data model:

1. Edit `packages/db/src/schema/*.ts`
2. Ensure new tables are exported from `packages/db/src/schema/index.ts`
3. Generate migration:

```sh
pnpm db:generate
```

4. Validate compile:

```sh
pnpm -r typecheck
```

Notes:
- `packages/db/drizzle.config.ts` reads compiled schema from `dist/schema/*.js`
- `pnpm db:generate` compiles `packages/db` first

## 7. Verification Before Hand-off

Default local/agent test path:

```sh
pnpm test
```

This is the cheap default and only runs the Vitest suite. Browser suites stay opt-in:

```sh
pnpm test:e2e
pnpm test:release-smoke
```

Run the browser suites only when your change touches them or when you are explicitly verifying CI/release flows.

For normal issue work, run the smallest relevant verification first. Do not default to repo-wide typecheck/build/test on every heartbeat when a narrower check is enough to prove the change.

Run this full check before claiming repo work done in a PR-ready hand-off, or when the change scope is broad enough that targeted checks are not sufficient:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

If anything cannot be run, explicitly report what was not run and why.

## 8. API and Auth Expectations

- Base path: `/api`
- Board access is treated as full-control operator context
- Agent access uses bearer API keys (`agent_api_keys`), hashed at rest
- Agent keys must not access other companies

When adding endpoints:

- apply company access checks
- enforce actor permissions (board vs agent)
- write activity log entries for mutations
- return consistent HTTP errors (`400/401/403/404/409/422/500`)

## 9. UI Expectations

- Keep routes and nav aligned with available API surface
- Use company selection context for company-scoped pages
- Surface failures clearly; do not silently ignore API errors

## 10. Pull Request Requirements

When creating a pull request (via `gh pr create` or any other method), you **must** read and fill in every section of [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md). Do not craft ad-hoc PR bodies — use the template as the structure for your PR description. Required sections:

- **Thinking Path** — trace reasoning from project context to this change (see `CONTRIBUTING.md` for examples)
- **What Changed** — bullet list of concrete changes
- **Verification** — how a reviewer can confirm it works
- **Risks** — what could go wrong
- **Model Used** — the AI model that produced or assisted with the change (provider, exact model ID, context window, capabilities). Write "None — human-authored" if no AI was used.
- **Checklist** — all items checked

## 11. Definition of Done

A change is done when all are true:

1. Behavior matches `doc/SPEC-implementation.md`
2. Typecheck, tests, and build pass
3. Contracts are synced across db/shared/server/ui
4. Docs updated when behavior or commands change
5. PR description follows the [PR template](.github/PULL_REQUEST_TEMPLATE.md) with all sections filled in (including Model Used)

## 11. Fork-Specific: HenkDz/paperclip

This is a fork of `paperclipai/paperclip` with QoL patches and a **built-in** Hermes adapter story on branch `feat/externalize-hermes-adapter` ([tree](https://github.com/HenkDz/paperclip/tree/feat/externalize-hermes-adapter)).

### Branch Strategy

- `feat/externalize-hermes-adapter` now ships `hermes_local` and `hermes_gateway` as built-in core adapters.
- Older fork branches may still document plugin-only Hermes; treat this file as authoritative for the current branch.

### Hermes (built-in)

- `hermes_local` is available without Adapter manager installation and runs the local Hermes CLI.
- `hermes_gateway` is available without Adapter manager installation and calls an already-running Hermes API server.
- Operators may still install external Hermes packages through Adapter manager to override/shadow the built-ins.
- Optional: `file:` entry in `~/.paperclip/adapter-plugins.json` remains useful for local development of override packages.

### Local Dev

- Fork runs on port 3101+ (auto-detects if 3100 is taken by upstream instance)
- `npx vite build` hangs on NTFS — use `node node_modules/vite/bin/vite.js build` instead
- Server startup from NTFS takes 30-60s — don't assume failure immediately
- Kill ALL paperclip processes before starting: `pkill -f "paperclip"; pkill -f "tsx.*index.ts"`
- Vite cache survives `rm -rf dist` — delete both: `rm -rf ui/dist ui/node_modules/.vite`

### Fork QoL Patches (not in upstream)

These are local modifications in the fork's UI. If re-copying source, these must be re-applied:

1. **stderr_group** — amber accordion for MCP init noise in `RunTranscriptView.tsx`
2. **tool_group** — accordion for consecutive non-terminal tools (write, read, search, browser)
3. **Dashboard excerpt** — `LatestRunCard` strips markdown, shows first 3 lines/280 chars

### Plugin System

PR #2218 (`feat/external-adapter-phase1`) adds external adapter support. See root `AGENTS.md` for full details.

- Adapters can be loaded as external plugins via `~/.paperclip/adapter-plugins.json`
- The plugin-loader should have ZERO hardcoded adapter imports — pure dynamic loading
- `createServerAdapter()` must include ALL optional fields (especially `detectModel`)
- Built-in UI adapters can shadow external plugin parsers; external override pause/resume should restore the built-in parser.
- Reference external adapters: Droid (npm); Hermes can also be tested as an override package.

## Design system

`DESIGN.md` at the repo root is the source of truth for UI design decisions. The token-only rule applies to all `ui/` changes: every color, spacing, radius, type, shadow, and motion value in `ui/src/components/**` and `ui/src/pages/**` comes from the token layer in `ui/src/index.css` — no hex, raw px, arbitrary Tailwind bracket values, or raw `font-size`/`fontSize` declarations in components, outside the documented allowlist in `ui/src/index.css`. Run `pnpm check:token-gates` (`scripts/check-token-gates.mjs`) before committing UI changes — it fails on any violation not covered by that allowlist.

## ADVX UI design system (ui-advx/)

The ADVX Studio UI (`ui-advx/`) has been migrated to the Open Design **七色令牌** system. This section is authoritative for all `ui-advx/` changes and overrides the legacy Paperclip `ui/` rules above for that directory only.

### Token source of truth

- `ui-advx/src/styles/tokens.css` — the **only** file allowed to contain hex color literals
- `ui-advx/src/styles/app.css` — shared component classes (`.card`, `.btn-primary`, `.topnav`, `.seg`, `.tl-item`, etc.)
- `ui-advx/src/index.css` — imports the two files above; **no other CSS**

The seven permitted hex values (defined once in `tokens.css`):
`#000000` bg / `#0a0a0a` surface / `#ffffff` fg / `#737373` muted / `#242424` border / `#f48529` accent (橙) / `#54a2ff` accent-2 (蓝). All other colors must use `var(--xx)` or `color-mix(in oklch, ...)`.

### Hard constraints for ui-advx/

1. **No hex literals in `.tsx`/`.ts` files.** All colors via `var(--xx)` or `color-mix()`. The only hex lives in `tokens.css`.
2. **Never re-introduce Tailwind.** It was removed in handoff #5. `ui-advx/package.json` must not list `tailwindcss`, `@tailwindcss/vite`, `postcss`, or `autoprefixer`.
3. **Shared components live in `ui-advx/src/components/`** — `TopNav`, `PageFoot`, `Feedback` (toast + confirm modal provider), `Seg`. Pages must use these instead of re-rolling navigation/toast/modal markup.
4. **API layer (`ui-advx/src/api.ts`) is preserved.** Visual rewrites must not break the existing `/api/advx/*` calls. The `FeedbackProvider` wraps the router in `main.tsx`.
5. **Pages map to Open Design prototypes.** Studio=`p04`, Member=`p05`, AddMember=`p06`, TestRunLaunch=`p08`, TestRunResult=`p09`, Versions=`p10`, Activity=`p11`. When changing a page, read the corresponding prototype HTML first.

### DEVX commands (ui-advx/)

```sh
pnpm --filter @advx/ui dev        # Vite on :5174, proxies /api → :3100
pnpm --filter @advx/ui typecheck  # tsc --noEmit
pnpm --filter @advx/ui build      # tsc -b && vite build
```

### Verification gate for ui-advx/ changes

Before claiming done, confirm:
- `pnpm --filter @advx/ui typecheck` passes
- `pnpm --filter @advx/ui build` succeeds
- `rg -n '#[0-9a-fA-F]{3,8}\b' --glob '*.tsx' --glob '*.ts' ui-advx/src` returns **no matches** (no hex in TS/TSX)
