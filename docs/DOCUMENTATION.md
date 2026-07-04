# Documentation Maintenance

**Last Updated**: 2026-07-04

The running code is the source of truth. Documentation must be updated from the implementation, not from memory.

## 1. Canonical documents

Use these as the maintained operational set:

- [README.md](../README.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [TECH_STACK.md](../TECH_STACK.md)
- [docs/AUTHORIZATION.md](AUTHORIZATION.md)
- [docs/MONGODB_CONVENTIONS.md](MONGODB_CONVENTIONS.md)
- [docs/MONGODB_ATLAS.md](MONGODB_ATLAS.md)
- [docs/SLIDESHOW_LOGIC.md](SLIDESHOW_LOGIC.md)
- [docs/TRYON_ARCHITECTURE.md](TRYON_ARCHITECTURE.md)
- [docs/TRYON_OPERATIONS.md](TRYON_OPERATIONS.md)
- [docs/TRYON_LOW_LEVEL_DESIGN.md](TRYON_LOW_LEVEL_DESIGN.md)
- [docs/TRYON_ADMIN_GUIDE.md](TRYON_ADMIN_GUIDE.md)
- [docs/TRYON_ANALYTICS.md](TRYON_ANALYTICS.md)
- [docs/GDS_RELEASE_GATE.md](GDS_RELEASE_GATE.md)

Historical and planning docs may exist, but they are not canonical runtime documentation unless explicitly refreshed.

## 2. Source-of-truth map

| Topic | Source of truth |
|------|-----------------|
| App version | `package.json` |
| Public/admin routes | `app/**/page.tsx`, `app/**/layout.tsx` |
| API surface | `app/api/**/route.ts` |
| Session and auth behavior | `lib/auth/*`, `proxy.ts`, `lib/api/middleware.ts` |
| MongoDB shapes | `lib/db/schemas.ts` plus actual route persistence code |
| Partner-scoped access | `lib/partners/*` and affected admin/API routes |
| Slideshow behavior | `lib/slideshow/*`, `components/slideshow/SlideshowPlayerCore.tsx` |

## 3. Common drift traps

### Version drift

Do not hardcode versions from memory. Read `package.json`.

### Identifier drift

Do not write blanket rules like “everything uses `_id`” or “everything uses UUIDs”.

This codebase intentionally mixes:

- Mongo `_id` for many admin URLs and direct document lookup
- business IDs like `eventId`, `partnerId`, `slideshowId`, `layoutId`, `frameId`

### Authorization drift

Do not document `/admin` as “global admin only” at the middleware layer anymore.

Current model:

- edge middleware allows any valid Camera session
- layout/page/API layers refine global vs partner-scoped access

### Removed product surfaces

Do not document Gym, Workout, or FunFitFan (FFF) routes, APIs, or `appKey: "gym"` unless they exist in the current codebase. Those surfaces were removed; partner access is `events` only.

## 4. Required updates when code changes

Update docs in the same change when you modify:

- admin IA or access model
- Mongo identifier semantics
- slideshow playlist/player behavior
- partner/app routing or access model
- env vars or deployment expectations

At minimum, review:

- `README.md`
- `ARCHITECTURE.md`
- whichever focused doc owns the changed area

## 5. Practical workflow

1. inspect the implementation files first
2. update focused docs before summary docs
3. update `README.md` and `ARCHITECTURE.md` last
4. run type-check and lint if the documentation change accompanies code changes

## 6. Recommended validation commands

```bash
rg --files -g '*.md' -g 'docs/**'
find app/api -name route.ts | sort
find app -name page.tsx | sort
cat package.json
```

## 7. Metadata rules

- use the current package version in active docs where a version field exists
- use absolute dates for `Last Updated`
- if a doc is historical or planning-only, say so directly instead of pretending it is current runtime truth

## 8. Minimum review checklist before closing a docs task

- version numbers match `package.json`
- route names and paths match the current app
- admin and auth behavior match current implementation
- Mongo identifier guidance matches the live mixed model
- Events / Partner model matches the current UX and code

## 9. GitHub tracker and release handoff

The GitHub issue tracker and Projects board must be kept aligned with canonical implementation before release handoff.

- Repository: `moldovancsaba/camera`
- Before any production release:
  - all related implementation artifacts are closed or explicitly blocked
  - release notes include scope, verification path, and known risks
  - docs listed in section 1 are updated to match the latest route, model, and contract behavior
  - `docs/TRYON_ADMIN_GUIDE.md` and `docs/TRYON_LOW_LEVEL_DESIGN.md` are updated for any moderation workflow changes
  - any queue/state/analytics contract changes are mirrored in API references and route behavior

Operational note:

- A stale tracker snapshot is a known source of process drift. Refresh this section at handoff time instead of preserving old issue IDs.
- 2026-06-07 handoff note: GDS 3.4.3 issue snapshot for `#69`-`#78` is recorded in `docs/GDS_3_4_3_ALIGNMENT_PLAN.md` and board-sync details are recorded in `docs/GDS_3_4_3_GITHUB_BOARD_HANDOVER.md`. GitHub Project v2 status edits were initially blocked by GraphQL rate limit until 2026-06-07 15:54:46 CEST; after reset, issue comments were posted and `#69` plus `#73` were moved to `Review (ALMOST)`.
- 2026-06-07 release-gate note: `docs/GDS_RELEASE_GATE.md` and `.github/workflows/gds-release-gate.yml` define the canonical npm-based validation lane for GDS compliance, type-check, lint, and build.
- 2026-06-08 reliability hardening: E2E suite passes 12/12 tests serially. Key fixes: middleware.ts conflict removed, parallel DB contention resolved (workers:1), inspectTryOnResultAsset graceful degradation, tryon-results reviewStatus=approved query corrected, API error boundary coverage extended. Committed as 9454b40 and bumped to v2.13.0.
- 2026-07-04 v2.15.0: Repository-wide docs refresh. Absolute machine paths converted to repo-relative links; GDS references corrected to the 3.5 package line; CI claims corrected after GitHub Actions workflows were removed (`c0b8b54`) — the GDS release gate now runs locally/manually. Issue audit recorded in `docs/ISSUE_AUDIT_2026-06-30.md` (13 open issues verified already delivered). New: `npm run test:e2e:safe` (safe E2E runner, #60), `npm run verify:production-guards` (#85), `tests/e2e/event-exports.spec.ts` (#84), GDS confirm parity in the try-on queue (#75). E2E suite is now 23 tests across 7 spec files.
- 2026-06-21 v2.14.0: Added per-event email/image exports (`docs/EVENT_EXPORTS.md`). Fixed the production Server-Components render crash (digest 4053814135) caused by `component={Link}` in Server Components — see the RSC boundary rule in `ARCHITECTURE.md` §11. Removed duplicate "Edit" buttons on Events/Try-On Suits/Landing Pages cards. Bumped Next `16.0.10 → 16.2.9` (security). Added `RUNBOOK.md` documenting manual `vercel --prod` deploys, since git pushes do not currently auto-deploy. Tracker: closed `#68` (analytics section exports, delivered in 9e63bfa).

### Do not drift again

- Do not treat the board as the source of truth when it disagrees with code and docs.
- Sync issue bodies/comments first, then sync Projects item statuses.
- Record temporary blockers like API rate limits directly in the canonical docs when handoff is required.

## 10. E2E Testing and safety gates

### Safety gate checks
To prevent accidental data loss in staging or production environments, dangerous endpoints like `/api/e2e/bootstrap` and `/api/e2e/cleanup` run `assertDisposableE2EDatabase()`. This function throws a `403 Forbidden` error if `MONGODB_DB` does not contain one of the following safe keywords: `e2e`, `test`, `dev`, `local`, `sandbox`, or `staging`.

### Automatic test configuration
When E2E tests are executed using:
```bash
npm run test:e2e
```
Playwright is configured (via `playwright.config.ts`) to automatically initialize process environment variables:
- `MONGODB_DB=camera_test`
- `CAMERA_TRYON_INTERNAL_SECRET=dev-tryon-secret`

If `PLAYWRIGHT_START_WEB_SERVER=true` is used, Playwright spins up a dedicated Next.js instance on port `3100` explicitly passing these environment overrides.

### Manual configuration
If you run tests against an already running dev server on port `3000` (e.g., setting `PLAYWRIGHT_PORT=3000`), you must ensure that your dev server was started with a safe database name (e.g. `camera_test` or `camera_dev`) and the correct callback secret, otherwise test bootstraps will fail.

