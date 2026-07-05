# GitHub Issue Audit — 2026-06-30

**Repository**: `moldovancsaba/camera`
**Audited against**: `package.json` v2.14.0, branch `claude/repo-sandbox-issue-audit-le5tsk` (base `main` @ `c0b8b54`)
**Scope**: 23 open issues (60 closed). Each open issue was cross-referenced against the current code, docs, and `TASKLIST.md`.

> Method: the verdicts below are based on direct inspection of the running code (routes, `lib/`, components, tests), not on issue text alone. `npm ci` and `npm run type-check` both pass clean on this checkout.

---

## 1. Headline finding — the tracker is stale

The board does not reflect the code. `docs/DOCUMENTATION.md` §9 explicitly warns that "a stale tracker snapshot is a known source of process drift" — that is exactly the current state.

- **`TASKLIST.md` already declares the work done.** It records the Try-On lifecycle/analytics/identity batch (**#61–#68**) as "complete on 2026-06-08" and the GDS admin migration (**#70–#75**) as "largely complete on 2026-06-08" — yet all of those issues are still **OPEN** on GitHub.
- **The code confirms it.** The contracts, routes, components, and scripts those issues ask for exist in the repository today (evidence per-issue below).
- **Net effect (all verdicts now code-verified):** of 23 open issues, **13 are fully implemented**, 2 meet their intent with only a spec detail differing, **7 are genuinely actionable**, and 1 (#78) has a premise that has since been invalidated.

**Recommended first action:** reconcile the board before any further planning. Closing the already-delivered issues shrinks the "open" backlog from 23 to roughly 8 real items (7 actionable + the #78 rewrite).

---

## 2. Verdict summary

| Verdict | Count | Issues |
|---|---|---|
| **CLOSE** — implemented & verified in code | 13 | #59, #61, #62, #63, #64, #65, #66, #67, #70, #71, #72, #75¹, #81 |
| **CLOSE or re-scope** — intent met, spec detail differs | 2 | #58 (guard shape), #82 (only lint rule remains) |
| **KEEP OPEN** — genuinely actionable | 7 | #60, #74, #76, #77, #83, #84, #85 |
| **RECONCILE** — premise changed since filing | 1 | #78 |

¹ #75 has one residual: two raw `window.confirm` calls in `components/admin/TryOnQueueTable.tsx:300,313` should move to `GdsConfirmProvider`. Everything else is centralized.

Label hygiene across the 23: every issue carries exactly one priority (p0×5, p1×15, p2×3) — good. But **no issue has an assignee or milestone**, and dependency relationships are encoded only as free-text "Depends on #N" lines, not native GitHub sub-issues — making the board hard to sequence mechanically.

---

## 3. Cross-cutting issues (not tied to a single ticket)

1. **CI was removed, which breaks #78's premise and several docs.** Commit `c0b8b54` ("Remove GitHub Actions workflows", 2026-06-29) deleted both `.github/workflows/deploy-production.yml` and `.github/workflows/gds-release-gate.yml`. There is now **no CI** in the repo, but `README.md`, `docs/GDS_RELEASE_GATE.md`, `docs/GDS_CAMERA_ADOPTION.md`, and `docs/DOCUMENTATION.md` still describe the GDS release gate / push-to-deploy workflow as if it runs. The `gds:check` npm script still exists but nothing invokes it automatically. **Reconcile the docs and decide whether the gate moves to a pre-commit/local lane or is restored.**
2. **GDS version drift across three sources.** `README.md` says GDS **3.4.7**, the GDS issues (#70–#78) were written against **3.4.3** contracts, and `package.json` ships `@doneisbetter/gds-* ^3.5.0` (latest commit: "align camera with GDS 3.5"). Issues authored against 3.4.3 may reference primitives/names that have since moved. Re-validate the GDS epic against the 3.5 contract before resuming it.
3. **`pnpm` vs `npm` framing.** Issues #58 and #60 specify `pnpm test:e2e:safe`, but the repo's canonical package manager is **npm** (`package-lock.json` present; README states npm is canonical). A `pnpm-workspace.yaml` exists but scripts run under npm. Reframe those issues to npm.
4. **PII test gap is real.** The v2.14.0 email/image export routes (`/api/admin/events/[id]/export/*`) ship personal data and have **no automated test** (#84) — this is the most material genuinely-open risk on the board.

---

## 4. Per-issue findings

### Cluster A — Try-On rerun / E2E / analytics / identity (#58–#67, filed 2026-06-06)
`TASKLIST.md` marks #61–#68 complete on 2026-06-08.

| Issue | Verdict | Evidence in code |
|---|---|---|
| **#58** Disposable DB guard | VERIFY & CLOSE | `lib/e2e/safety.ts` implements `assertDisposableE2EDatabase()` + `isDisposableE2EDatabaseName()`, wired into `app/api/e2e/bootstrap` & `cleanup`. **Spec gap:** file is `safety.ts` not `lib/e2e/db-guard.ts`; rejects via thrown error/403 not `409`; uses a keyword list (`e2e/test/dev/local/sandbox/staging`) rather than the strict `camera_e2e`/`camera-test` + `ALLOW_E2E_ATLAS_WRITES` override the issue specifies. Core safety intent is met — close, or re-scope to "tighten to exact contract." |
| **#59** Fixture lifecycle cleanup | **CLOSE** | `buildE2ERunId()` in `lib/e2e/safety.ts`; **verified**: `app/api/e2e/bootstrap/route.ts` stamps `metadata.e2eRunId` on every fixture record (partners, events, access, submissions, slideshows, jobs, …) and `cleanup/route.ts` filters by it, reporting per-collection `deletedCount`. |
| **#60** Safe one-command runner | **KEEP OPEN** | No `test:e2e:safe` script exists in `package.json` (only `test:e2e` / `test:e2e:headed`). Genuinely undone. Reframe `pnpm` → `npm`. |
| **#61** Superseded state contract | **CLOSE** | `quality_rerun_superseded` / `supersededByJobId` present in `lib/db/schemas.ts`, `lib/tryon/analytics.ts`, `lib/tryon/moderation-audit.ts`, and `app/api/admin/tryon-jobs/[jobId]/rerun/route.ts`. Backfill script `tryon:backfill-superseded-archive-reason` exists. |
| **#62** Superseded admin visibility | **CLOSE** | **Verified** in `TryOnResultModerationTable.tsx`: "superseded by rerun" label (`:136-137`), `isSupersededRow()` filter (`:142`), read-only archived state (`:472`), and a "Superseded by rerun job" badge linking `archiveSupersededByJobId` to the queue (`:478-481`, `:1012-1014`). |
| **#63** Rerun HiTL E2E | **CLOSE** | **Verified** in `tests/e2e/tryon-rerun-lifecycle.spec.ts`: asserts `oldResultArchiveReason === 'quality_rerun_superseded'` (`:55`) and the new result has `reviewStatus === 'pending_review'` (`:84`) — i.e. rerun never auto-approves — plus approved-list checks (`:92`). |
| **#64** Identity classification contract | **CLOSE** | `lib/tryon/identity.ts` + `lib/db/schemas.ts` define the classification; operator scripts `tryon:backfill-identity`, `tryon:apply-identity-corrections`, `tryon:report-unrecoverable-identities` exist. |
| **#65** Identity admin review workflow | **CLOSE** | `app/admin/tryon/identity/page.tsx` + `app/api/admin/tryon-identities/route.ts` & `[submissionId]/route.ts` implement list/correct/mark-unrecoverable. |
| **#66** Funnel contract | **CLOSE** | Funnel metrics implemented in `lib/tryon/analytics.ts`; export route `app/api/admin/tryon-analytics/export/route.ts`. |
| **#67** Funnel UI | **CLOSE** | `components/admin/TryOnFunnelChart.tsx` + `app/admin/tryon/analytics/page.tsx`; `tests/e2e/tryon-analytics-smoke.spec.ts` covers it. |

### Cluster B — GDS migration epic (#70–#78, filed 2026-06-07)
`TASKLIST.md` marks #70–#75 "largely complete on 2026-06-08." Re-validate against GDS **3.5** (issues were written for 3.4.3).

| Issue | Verdict | Evidence in code |
|---|---|---|
| **#70** Adapter removal (foundation) | **CLOSE** | 3 of the 4 named adapters are **gone**: `components/gds/DataTable.tsx`, `ResponsiveDataView.tsx`, `EditorScaffold.tsx` no longer exist. **Verified**: the remaining `CameraGdsProvider.tsx` is a thin composition of official packages — `GdsProvider` (`@doneisbetter/gds-theme`) wrapping `GdsTelemetry/Notification/Toast/OverlayManager/Confirm` providers — i.e. the intended provider boundary, not a bespoke adapter. |
| **#71** Admin resources → resource manager | **CLOSE** | Inventory screens migrated: `components/gds/{Events,Frames,Logos,Users,Submissions,Slideshows,Partners,LandingPages,TryOnSuits}InventoryList/View.tsx`. |
| **#72** Try-on moderation GDS | **CLOSE** | **Verified**: `TryOnResultModerationTable.tsx` carries 11 `CameraSemanticButton`/`useGdsToasts`/`useGdsConfirm` call sites; semantic actions/toasts also in `TryOnQueueTable.tsx`, tryon suits pages, and the wider admin action components. HiTL rule proven by #63's spec. (Two legacy `window.confirm`s remain in `TryOnQueueTable.tsx` — tracked under #75's residual.) |
| **#74** Admin forms GDS | **KEEP OPEN** (partial) | Frames editor on `AdminCrudForm` (`app/admin/frames/[id]/edit/page.tsx`). But `TASKLIST.md` "Admin UX follow-through" lists **logos editor `AdminCrudForm` parity still active** — so #74 is not finished. |
| **#75** Operator feedback centralization | **CLOSE** (1 residual) | **Verified**: `CameraGdsProvider.tsx` mounts exactly the providers the issue asks for — `GdsNotificationProvider`, `GdsToastProvider`, `OverlayManagerProvider`, `GdsConfirmProvider` — at the shell. No direct `@mantine/notifications`/`@mantine/modals` usage outside the GDS layer (only the required CSS import in `app/layout.tsx`). **Residual**: two raw `window.confirm` calls in `components/admin/TryOnQueueTable.tsx:300,313` should move to `useGdsConfirm`. Close and fold the residual into a small follow-up. |
| **#76** Public surfaces GDS | **KEEP OPEN** (partial) | `components/gds/PublicPrimitives.tsx` + `components/public/*` exist but the full capture/share/recovery/playback primitive adoption is incomplete; `TASKLIST.md` lists #76–#77 as active. |
| **#77** Media cards GDS | **KEEP OPEN** (partial) | `components/media/MediaPreviewCard.tsx` exists; migration to official GDS card primitives (object-fit contain, no crop) is not confirmed complete. |
| **#78** Compliance enforcement / CI guardrails / exception register | **RECONCILE** | Premise broken: the CI lane this issue depends on was **deleted** in `c0b8b54`. `scripts/check-gds-boundaries.mjs` + `gds:check` exist but run nothing automatically. Decide the enforcement model (local/pre-commit vs restored CI), update the exception register, and rewrite the issue against that reality + GDS 3.5. Depends on #71/#72/#74/#75/#76/#77 (mostly done). |

### Cluster C — Production crash hardening (#81–#85, filed 2026-06-21)

| Issue | Verdict | Evidence in code |
|---|---|---|
| **#81** Authenticated admin smoke test | **CLOSE** | `tests/e2e/admin-smoke.spec.ts` exists and does exactly the ask: dev-login as global admin, renders `/admin`, `/admin/events`, `/admin/events/[id]`, `.../edit`, partners, frames, logos, submissions, users, tryon, landing-pages, `/profile`, asserting the error boundary is absent — with an explicit "RSC component-prop regression guard." Commit `1b50664` references (#81). |
| **#82** RSC boundary audit | VERIFY & CLOSE (or narrow) | The 3 offending Server Components from #80 are fixed. The only remaining `component={Link}` usages (`app/capture/page.tsx`, `app/error.tsx`, `app/admin/events/new/page.tsx`, `app/admin/events/[id]/edit/page.tsx`) are all in `'use client'` files, where it is **valid**. No Server-Component offenders remain. The runtime guard (#81's smoke test) covers regressions. **Only remaining ask:** a static lint rule banning function props from Server→Client. Narrow the issue to that, or close as covered. |
| **#83** Observability / alerting | **KEEP OPEN** | No Sentry/structured-log sink found wired to `app/error.tsx` or server catch paths. Genuinely undone; aligns with ROADMAP "Observability and governance." |
| **#84** Export route tests | **KEEP OPEN** (high value) | No tests cover `/api/admin/events/[id]/export/emails` or `/export/images`. These ship PII (email CSV) and large ZIPs (500-file cap) — untested. **Highest-priority genuinely-open item.** |
| **#85** Dev-route prod-unreachability test | **KEEP OPEN** | `app/api/auth/dev-login/route.ts` exists; existing specs *use* it to authenticate but none asserts it returns 404 in production with `ALLOW_DANGEROUS_DEV_ROUTES` unset. Genuinely undone; security-relevant. |

---

## 5. Recommended actions, in order

1. **Reconcile the board (cheap, high impact).** Close the 13 verified-done issues (#59, #61, #62, #63, #64, #65, #66, #67, #70, #71, #72, #75, #81) with a comment pointing at the delivering commit/file. Close-or-re-scope #58 (guard shape differs from spec) and #82 (only the lint rule remains).
2. **Fix the doc/CI contradiction.** Update `README.md` + GDS docs to reflect that GitHub Actions workflows were removed (`c0b8b54`), and rewrite **#78** around the actual enforcement model.
3. **Normalize the GDS epic to 3.5.** #70, #71, #72, #75 verified done — close them; keep the genuinely-partial ones (#74 logos editor, #76, #77) and re-validate their primitive names against `@doneisbetter/gds-* 3.5.0` before resuming.
4. **Work the real backlog (~8 items).** Priority order by risk: **#84** (untested PII exports) → **#85** (dev-route prod guard) → **#83** (observability) → **#60** (safe e2e runner) → GDS finish (#74, #76, #77) → **#82** (lint rule).
5. **Hygiene going forward.** Add milestones, use GitHub native sub-issues for the dependency chains, and close issues in the same change that delivers them (the §9 discipline the docs already mandate).

---

*Generated from a sandbox checkout on 2026-06-30. `npm ci` + `npm run type-check` pass clean.*

---

## 6. Remediation shipped on this branch (post-audit)

The following fixes were implemented on `claude/repo-sandbox-issue-audit-le5tsk` after the audit:

| Issue | Fix | Verified |
|---|---|---|
| **#75 residual** | The two `window.confirm` calls in `components/admin/TryOnQueueTable.tsx` (rerun / reapply) now use `useGdsConfirm().confirm()` from the GDS core client package, matching the house idiom (scope renamed to `@sovereignsquad/*` on main, 2026-06). | type-check + lint clean |
| **#60** | New `npm run test:e2e:safe` → `scripts/run-e2e-safe.ts`: loads env, fails fast without `MONGODB_URI`, enforces the disposable-DB guard (imports `isDisposableE2EDatabaseName` from `lib/e2e/safety.ts` — single source of truth), checks the browser, runs Playwright with a managed web server (`PLAYWRIGHT_START_WEB_SERVER=true`), forwards SIGINT/SIGTERM so no orphan processes remain. | type-check + lint clean; not executed end-to-end in the sandbox (no MongoDB reachable — `fastdl.mongodb.org` is blocked by the sandbox network policy and no Atlas URI is configured) |
| **#85** | New `npm run verify:production-guards` → `scripts/verify-production-guards.ts`: behaviorally asserts `blockDangerousApiInProduction()` returns 404 under `NODE_ENV=production` with `ALLOW_DANGEROUS_DEV_ROUTES` unset (and only the literal `'true'` unlocks it), plus a static wiring check that all 9 dangerous route files call the guard. | **Executed: all 14 checks pass** |
| **#84** | New `tests/e2e/event-exports.spec.ts`: 8 tests covering 401 unauthenticated, 403 viewer, 403 unassigned user, 404 missing event, email-CSV dedup (2 fixture submissions → 1 row, `submissions=2`, source `sso`), image-CSV column contract, ZIP-on-empty-event 400, and global-admin allow. | type-check + lint clean; not executed in the sandbox (same MongoDB constraint as above — run `npm run test:e2e:safe` locally) |
| **#82** | Custom ESLint rule `camera-rsc/no-component-fn-prop-in-server-files` (in `eslint.config.mjs`) errors on function-valued `component` props in `app/**` files lacking `'use client'`. Verified: clean codebase passes; a planted Server-Component violation is flagged; the same code under `'use client'` passes. | **Executed: rule verified both ways** |
| **Doc drift** | `README.md`: GDS contract note corrected to 3.5; release-gate and deploy sections no longer claim GitHub Actions runs (workflows removed in `c0b8b54`); new scripts documented. `RUNBOOK.md`: guard verification added to health checks. | n/a (docs) |

Still open after this branch: **#83** (observability sink — needs a Sentry-vs-Vercel-logging decision), **#74/#76/#77** (remaining GDS UI migrations), **#78** (rewrite around the post-CI enforcement model), and the board reconciliation itself.

> **Post-audit note (2026-07-04):** package scope references above reflect audit time (`@doneisbetter/* 3.5`). `main` has since migrated to `@sovereignsquad/* ^3.9.0` (commit `b9b4304`); read the GDS package names accordingly.
