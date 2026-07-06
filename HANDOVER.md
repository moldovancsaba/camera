# Handover

**Version**: 2.18.0
**Last Updated**: 2026-07-06

## Branching

Three long-lived branches only — `main` (production), `preview` (release candidate),
`dev` (development). No feature or per-task branches; promote `dev → preview → main`.
Policy: [docs/BRANCHING.md](docs/BRANCHING.md). Consolidated to this model on 2026-07-06 —
for now only `main` exists; create `preview`/`dev` off `main` when the workflow needs them.

## Production status

- Live and healthy at `camera.messmass.com` (Vercel `narimato/04_camera`).
- **Deployed commit: `1b50664`** (v2.14.0 — RSC fix, exports, submissions fix).
- ⚠️ **`main` is far ahead of production**: the GDS 3.9 migration (`b9b4304`), the lint
  cleanup (`229290a`), and the v2.16.0–v2.17.0 audit/hardening/observability/docs work are
  committed but **NOT deployed**. Ship with `npx vercel@latest --prod` when ready (see
  `RUNBOOK.md`). Git push does **not** auto-deploy. Run `npm run release:check` first.

## Shipped in v2.17.0 (2026-07-04)

- **Structured observability (#83)** — `lib/observability/logger.ts` (JSON to stdout/stderr,
  alertable via Vercel/log drain, no external SDK); wired into `withErrorHandler` /
  `safeAsync` / `dbOperation` and a `/api/observability/client-error` beacon from
  `app/error.tsx` so client/RSC crashes reach server logs keyed by digest.
- **Formalized release gate (#78)** — `npm run release:check` runs the full gate fail-fast
  (decision: local gate, not restored CI). Documented in `docs/GDS_RELEASE_GATE.md`.
- **Logos editor GDS parity (#74)** — `/admin/logos/[id]/edit` migrated to `AdminCrudForm`
  primitives, matching frames.

## Shipped in v2.16.0 (2026-07-04)

- **Issue audit** — all 23 open issues cross-checked against code
  (`docs/ISSUE_AUDIT_2026-06-30.md`): 13 verified already delivered, 2 met-in-intent,
  7 actionable, 1 (#78) premise invalidated by the CI removal. Board reconciliation pending.
- **`npm run test:e2e:safe` (#60)** — one-command E2E runner with env preflight,
  disposable-DB guard, managed web server, no orphan processes.
- **`npm run verify:production-guards` (#85)** — proves dev-login/e2e/debug routes 404 in
  production and that all 9 dangerous route files call the guard (14/14 checks pass).
- **Export-route tests (#84)** — `tests/e2e/event-exports.spec.ts`: access matrix,
  email-CSV dedup, image-CSV contract, ZIP-on-empty 400 (8 tests).
- **GDS confirm parity (#75)** — last two `window.confirm` calls (try-on queue
  rerun/reapply) replaced with `useGdsConfirm`.
- **RSC boundary lint guard (#82)** — custom ESLint rule errors on function-valued
  `component` props in Server Component files under `app/**`.
- **Docs refresh** — relative links repo-wide, CI claims corrected (workflows removed in
  `c0b8b54`), E2E counts updated (23 tests / 7 specs), version headers aligned, historical
  docs bannered, `/admin/slideshows` + email sender settings documented.

## Shipped in v2.15.0 (2026-06-21 → 2026-06-24)

- **Event data exports** — manager-gated email + image (CSV/ZIP) on `/admin/events/[id]`. See `docs/EVENT_EXPORTS.md`. (#79)
- **Production RSC crash fix** — `component={Link}` in Server Components → `component="a"` (digest 4053814135). Rule in `ARCHITECTURE.md` §11. (#80)
- **Admin smoke tests** (`tests/e2e/admin-smoke.spec.ts`) — caught + fixed a second crash on `/admin/submissions`. (#81)
- **`/admin/slideshows`** inventory page and **per-event email sender settings**.
- **Deps** — Next `16.0.10 → 16.2.9` (security); 0 vulnerabilities.
- **GDS migration** — `@doneisbetter/* (3.5) → @sovereignsquad/* (3.9)`, mechanical scope rename, no API changes.

## Verification (current `main`)

`gds:check` ✅ · `type-check` ✅ · `lint` clean (0/0) · `build` ✅ ·
`verify:production-guards` 14/14 ✅ · `npm audit` 0 vulns.
E2E: 15/15 passing pre-merge; 8 new export tests added in v2.16.0 are written and
lint/type-clean but **not yet executed** (sandbox had no MongoDB) — run
`npm run test:e2e:safe` locally to confirm 23/23.

## Open follow-ups

- **Deploy v2.16.0** to production (owner go / `vercel --prod`).
- **Restore Vercel auto-deploy** — GitHub App repo access + production branch (owner, dashboard). Until then deploys are manual.
- ~~Reconcile the GitHub board~~ — **done 2026-07-04**: 17 issues closed; then #74/#78/#83 delivered in v2.17.0 and closed. Board down to **3 open** (#76, #77 GDS UI · #84 export tests awaiting first green run).
- **#84**: run `npm run test:e2e:safe` once against MongoDB (expect 23/23), then close.
- **#76/#77**: remaining GDS public-surface + media-card migrations — best with visual verification.
- Admin create/`new` pages still use raw inputs uniformly (frames included) — separate consistency pass, tracked in `TASKLIST.md`.
- 16 `react-hooks` advisory rules (`set-state-in-effect`, `preserve-manual-memoization`) are **off** in `eslint.config.mjs` — revisit under a React Compiler adoption.

## Docs map

`README.md` · `ARCHITECTURE.md` · `TECH_STACK.md` · `RUNBOOK.md` · `RELEASE_NOTES.md` ·
`TASKLIST.md` · `ROADMAP.md` · `docs/EVENT_EXPORTS.md` · `docs/ISSUE_AUDIT_2026-06-30.md` · `docs/*`.
