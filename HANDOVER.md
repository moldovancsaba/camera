# Handover

**Version**: 2.15.0
**Last Updated**: 2026-06-21
**main HEAD**: `229290a`

## Production status

- Live and healthy at `camera.messmass.com` (Vercel `narimato/04_camera`).
- **Deployed commit: `1b50664`** (v2.14.0 — RSC fix, exports, submissions fix).
- ⚠️ **`main` is ahead of production**: the GDS 3.9 migration (`b9b4304`) and the lint
  cleanup (`229290a`) are committed but **NOT deployed**. Ship with `npx vercel@latest --prod`
  when ready (see `RUNBOOK.md`). Git push does **not** auto-deploy.

## Shipped this cycle (v2.14.0 → v2.15.0)

- **Event data exports** — manager-gated email + image (CSV/ZIP) on `/admin/events/[id]`. See `docs/EVENT_EXPORTS.md`. (#79)
- **Production RSC crash fix** — `component={Link}` in Server Components → `component="a"` (digest 4053814135). Rule in `ARCHITECTURE.md` §11. (#80)
- **Duplicate "Edit" buttons** removed on Events / Try-On Suits / Landing Pages cards. (#71 ongoing)
- **Admin smoke tests** (`tests/e2e/admin-smoke.spec.ts`) — caught + fixed a second crash on `/admin/submissions`. (#81)
- **Deps** — Next `16.0.10 → 16.2.9` (security); `sharp` logo dimensions; `archiver` for ZIP. 0 vulnerabilities.
- **GDS migration** — `@doneisbetter/* (3.5) → @sovereignsquad/* (3.9)`, mechanical scope rename, no API changes.
- **Ops** — `RUNBOOK.md` + guarded `.github/workflows/deploy-production.yml`.

## Verification (current `main`)

`gds:check` ✅ · `type-check` ✅ · `lint` clean (0/0) · `build` ✅ · **e2e 15/15** ✅ · `npm audit` 0 vulns.

## Open follow-ups

- **Deploy the GDS migration** to production (owner go / `vercel --prod`).
- **Restore Vercel auto-deploy** — GitHub App repo access + production branch (owner, dashboard). Until then deploys are manual.
- Tracked issues: **#82** RSC boundary lint guard · **#83** error observability · **#84** export-route tests · **#85** dev-route prod-unreachable test.
- GDS board: **#74/#75/#76/#77/#78**.
- 16 `react-hooks` advisory rules (`set-state-in-effect`, `preserve-manual-memoization`) are **off** in `eslint.config.mjs` — revisit under a React Compiler adoption.

## Docs map

`README.md` · `ARCHITECTURE.md` · `TECH_STACK.md` · `RUNBOOK.md` · `RELEASE_NOTES.md` · `docs/EVENT_EXPORTS.md` · `docs/*`.
