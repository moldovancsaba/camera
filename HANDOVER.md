# Handover

**Version**: 12.3.40
**Last Updated**: 2026-10-06

`RELEASE_NOTES.md` is kept current on every release and is the detailed record;
this file is the short current-state summary. Previous rewrite: 2026-08-17
(v2.23.0 era); everything from v12.2.0 to v12.3.37 is in `RELEASE_NOTES.md`.
Open work is tracked on the GitHub project board, not in this file (next section).

## Status 2026-10-06

- **`main`** is `fe43367`: CI `Verify` green and deployed to production.
  `package.json` is still 12.3.40; everything since is in `RELEASE_NOTES.md`
  under "Unreleased" and dated headings (strict share opt-in for savetheworld,
  bounded SSO revoke and messmass push, axios 1.20.0, operator-managed try-on
  prompt snapshots).
- **Where the work is tracked:** project board
  [#24](https://github.com/users/moldovancsaba/projects/24), rebuilt on
  2026-10-05. Open work is camera issues #177-#198 plus the image.direct and
  try-on issues placed on it. `TASKLIST.md` and `ROADMAP.md` now point to the
  board instead of duplicating it.
- **Licence:** MIT (`LICENSE`, #176), "Copyright (c) 2026 moldovancsaba". The
  vendored CatVTON licence question belongs to the try-on repo (try-on#51).
- **image.direct** is being introduced as a second renderer next to try-on
  (owner decision 2026-10-05: alongside; try-on stays paused and is retired only
  after a consented canary and sign-off). Camera has the gated result callback,
  setup-owned prompts and immutable prompt snapshots; it does not yet have the
  dispatch/outbox, a per-event renderer setting, admission metadata
  (input hashes, sizes, consent record) or reconciliation and health. Every gate
  is off and nothing dispatches. Tracker camera#189; contract and current
  state: `docs/IMAGE_DIRECT_INTEGRATION.md`. try-on#52 tracks a precondition for
  any re-enable: the legacy worker's claim query has no `renderer` filter and
  would claim image.direct jobs.
- **Camera module overhaul (owner-approved 2026-10-06):** black photos about 25%
  of the time (rate differs by device and browser), only a slice of the camera
  view used, back camera first, no lens choice. Plan in `docs/CAMERA_MODULE_PLAN.md`,
  tracker camera#203 (diagnostics #204, harness #205, quick wins #206, constraints
  #207, full-frame capture #208, reframe step #209, storage #210, privacy #211,
  lenses #212, canary #213). Decisions: front camera is the global default;
  anonymous diagnostics approved; record the full frame, then crop to the frame
  in a second step; the owner tests on phones. Merged 2026-10-06: #204, #206,
  #207 (constraints), #208 (whole-frame capture), #209 (reframe step); #210
  (storage of the original and the reframe record) in review. Next: #211 privacy
  (file deletion, consent wording), #212 lenses, #205 test harness.
- **Generated default frame (owner-approved 2026-10-06, epic camera#231, plan `docs/DEFAULT_FRAME_PLAN.md`):** every
  event without an active frame of its own gets a frame built from messmass data (partner logo top right, teams text
  top left, theme-coloured bar with a random message per photo; 1920x1080). Merged: layout engine, messmass endpoint,
  snapshot and message list, server renderer, guest capture flow, event editor panel (`/admin/events/[id]/frames`),
  pairing-in-event-name split, placeholder rule, the rollout tool for existing events and try-on consistency
  (camera#238, `/admin/frames/generated`, merged but not run). Not yet done: the renderer has not run inside a deployed function (RUNBOOK
  "First check on Vercel"), nothing is generated in production, so guests see no change; then the dry-run report for the
  owner, then the run. Open: messmass#430, camera#237 (real save, accessibility audit).
- **Capture works the same way for every camera (owner decision 2026-10-06, camera#257):** the largest still, zoom and pan
  anywhere, "Continue" (which saves, camera#344; the "Love it" screen is gone), and only the frame-sized result is saved; the full-size original is no longer uploaded. Every touch
  device takes the photo with its own camera app (file input with `capture`); a desktop webcam keeps the live view and takes a
  real still where the browser can; `?capture=frame` is the way back. Not yet tried on a real iPhone. Cleanup once no old page
  can be open: `POST /api/uploads/original`, the original claim handling in `POST /api/submissions`, `blob:orphans`.
- **GDS:** camera is on 6.3.0 (vendored); the latest release is 6.7.0. The
  audit and ordered plan are in `gds_fix_handover.md` (merged in #175):
  camera#183 done 2026-10-06 (official stylesheet imported, forked CSS deleted;
  Inter now loaded from the root layout, see `LEARNINGS.md` FRONT-009),
  camera#184 (bump to 6.7.0) next, work packages camera#185-#187, owner
  decisions camera#188.
- **messmass and sso:** nothing blocks camera. The 2026-09-30 decision (separate
  logins) stands; sso 5.41.1 and 5.42.0 need no camera change. A `CAMERA_` env
  prefix is an open owner decision (camera#195).
- **Auth and dependencies (2026-10-05):** axios raised to 1.20.0 (#199);
  Dependabot raised no alert for it and the cause is unexplained (camera#177).
  The SSO revoke and the messmass session push are bounded at 3000 ms (#200);
  camera#178 stays open for the keep-or-drop decision on the messmass push and
  the calls that are still unbounded (`pushPartnerToMessmass`, other fetches in
  `lib/auth/sso.ts`).

## Status 2026-09-28 (history through 2026-09-30)

- **Version** 12.3.40 (try-on cron removed; the v12.3.39 hardening batch is below). Fleet policy
  (messmass `docs/_audit/fleet-version-policy.md`) bumps messmass, fanmass,
  try-on and savetheworld to the same version in the same coordinated release;
  12.3.38 was a camera-only security release; 12.3.39 and 12.3.40 are fleet releases.
- **Production = git `main`.** Every push to `main` auto-deploys
  `narimato/04_camera` via the Vercel Git integration (verified 2026-09-28:
  latest READY production deployment `meta.githubCommitSha` = `ccd77d5` =
  `origin/main`). Vercel does not wait for GitHub Actions, so run
  `npm run inventory:check && npm run release:check` before pushing. Steps and
  post-deploy checks: `RUNBOOK.md`.
- **CI was red on `main` from `386d3fe` to `06f3029`** — `inventory:check`
  failed because the new publish-selfies route was never added to
  `docs/_audit/*.json`. Fixed in `ccd77d5` (12.3.37); `main` and the rebased
  Dependabot PRs are green again.
- **publish-selfies scoping fix (12.3.37).**
  `POST /api/internal/savetheworld/events/[eventId]/publish-selfies` built a
  filter whose second `$or` overwrote the event match, so it would have
  published non-tryon selfies across all events. Now `$and`-combined in
  `lib/savetheworld/publishSelfies.ts` with a unit test. The bug never
  triggered in production: an aggregate check on 2026-09-28 found 13 events,
  11 of them with zero visible submissions.
- **v12.3.39 hardening batch (2026-09-29).**
  - `upload-logo` and the two try-on setup routes no longer admit any SSO
    account.
  - The six shared-secret gates compare in constant time and return a generic
    403.
  - The try-on sync backstop is idempotent, and `?jobId=` works. A re-applied
    framed result is never replaced by the raw image, and the generic
    `DELETE /api/submissions/[id]` refuses try-on results (409).
  - `POST /api/internal/messmass/sso-session` answers 403, not 500, when SSO
    refuses the permission read (every messmass login today).
  - Setup reads no longer write.
  - `images.remotePatterns` is narrowed to camera's Blob store and `i.ibb.co`.
  - The dormant TypeScript try-on worker is deleted.
  - CI runs a gitleaks secret scan.
  - `.env.example`, `RUNBOOK.md` and the audit docs are brought up to date.

  Details: `RELEASE_NOTES.md` v12.3.39. Follow-ups: `docs/_audit/drift-register.md` §8.
- **Owner decisions 2026-09-30.**
  - Try-on is paused: the local worker is stopped and `tryOn.enabled` is off on
    every event (MotoGP Balaton Park 2026, Brain Bar 2026 x AUDI F1, FIBA 3X3 2026
    TRYON). Switching it off also removes approved try-on results from those
    events' slideshows, because the slideshow policy treats a disabled event as
    "originals only" (`lib/tryon/slideshow-policy.ts:28`). The previous settings
    are kept outside the repo so they can be restored.
  - The `*/5` try-on sync cron is removed from `vercel.json` (v12.3.40);
    `CRON_SECRET` stays unset. `RUNBOOK.md` "Scheduled jobs and workers" has the
    steps to restore it.
  - messmass and camera keep separate logins for now: `client_credentials` is not
    enabled for their SSO clients and a messmass login mints no camera session
    (the 403 above is expected).
  - The fan-selfie consent question is closed with no change to behaviour.
  - Cleaned up: `fff.messmass.com` detached from the Vercel project,
    `camera.doneisbetter.com` kept (savetheworld reads camera through it); the
    unused `camera_MONGODB_URI` and `GITHUB_TOKEN` Vercel variables removed;
    GitHub Pages disabled; 30 merged remote branches (including five `claude/*`)
    and the stray `phase0-ux-bugs` worktree deleted; PR #88 and issue #117 closed.
  - Branch protection on `main` now applies to admins and blocks force-pushes
    (was `enforce_admins: false`), so a red `Verify` check blocks the merge.
- **Firewall (2026-09-30).** Vercel Firewall rule `fan-upload-flood-ceiling`
  rate-limits `POST /api/submissions` to 100 requests a minute per IP, globally
  (see `RUNBOOK.md` "Rate limits"). It is not in git. To recreate it:
  `npx --yes vercel@latest firewall rules add fan-upload-flood-ceiling --project 04_camera --scope narimato --action rate_limit --condition '{"type":"path","op":"eq","value":"/api/submissions"}' --condition '{"type":"method","op":"eq","value":"POST"}' --rate-limit-algo fixed_window --rate-limit-window 60 --rate-limit-requests 100 --rate-limit-keys ip --rate-limit-action rate_limit --yes`,
  then `firewall publish`. Verified live: of 130 rapid requests, 100 reached
  camera and 30 were stopped by the firewall. Upstash is not planned.
- **Dependabot**: 0 open alerts on 2026-09-29 (v12.3.38 updated `sharp`, `next`,
  the `postcss` override and the transitive packages). On 2026-10-05
  `npm audit --omit=dev` still reported a high finding: axios 1.18.1 sat inside
  twelve GitHub-reviewed advisories published 2026-09-30 (fixed in 1.20.0, now
  installed). Dependabot alerts are enabled (39 past alerts, all fixed) but
  none was ever raised for axios, and why is unexplained; do not treat "0 open
  alerts" as proof of a clean tree, run `npm audit --omit=dev` as well. Five
  dev-only highs remain (`eslint-config-next` pulling `braces`/`micromatch`);
  npm's only offered fix is a downgrade to 14.x, so they are left alone.
- **Design system**: GDS 6.3.0 installed from vendored release tarballs
  (`vendor/gds/*.tgz` via `file:` specs in `package.json`, since v12.3.29); no
  registry token needed.

## Open items

Each item has a board issue; see the board for current status.

- **Vercel Node setting** (camera#182). Project `04_camera` is set to Node 22.x;
  builds run on 24 because `package.json` `engines.node` (`>=24.0.0 <25.0.0`)
  overrides it. Set the dashboard to 24.x.
- **Secret scanning settings (owner)** (camera#182). Non-provider patterns and
  validity checks are off for this public repo (Settings > Code security). The CI
  gitleaks step covers the working tree only, not history.
- **`CameraCapture` `autoStart` unreliable under `next dev`** (FRONT-008, camera#191) —
  found, not fixed. A `useRef` double-invoke guard survives React StrictMode's
  dev-only mount→cleanup→remount cycle, but the `setTimeout(startCamera, 0)`
  it guards does not, so the first mount's cleanup cancels the pending timer
  and the real mount sees the ref already `true` and returns early —
  `autoStart` never fires under `next dev`. Not yet verified whether this
  reproduces in a production build. Likely fix: don't gate the timer's
  *scheduling* on a ref that survives remounts.
- **partners/tryon-suits edit pages** — still raw `FormSection` + inputs
  (`app/admin/partners/[id]/edit/page.tsx`,
  `app/admin/tryon/suits/[id]/edit/page.tsx`), unlike their migrated `new`
  counterparts (`AdminCrudForm`). Covered by GDS work package A (camera#185,
  handover PRs 5 and 6).
- Two `react-hooks` advisory ESLint rules (`set-state-in-effect`,
  `preserve-manual-memoization`) still off in `eslint.config.mjs:78-79` —
  revisit under a React Compiler adoption (camera#194).

Older follow-ups from the 2026-08-17 handover:
- GDS `AdminResourceCard`/`MediaPreviewCard` workarounds. Re-checked 2026-10-06
  against the installed 6.3.0: the forced "edit" label and the double-wrapped
  `Badge` are still present (upstream `sovereignsquad/general-design-system#755`,
  tracked in camera#187); the missing "omit the media block" option was fixed
  upstream in 3.10.0 (`hideWhenNoMedia`). Details:
  `docs/GDS_CAMERA_ADOPTION.md`.
- The E2E export suite (#84, closed 2026-07-08) should be run green against a
  MongoDB-backed environment before trusting that closure (camera#198).

## Branching

Single long-lived branch `main` (production), plus short-lived per-task branches
(`feature/*`, `fix/*`, `chore/*`, `dependabot/*`, …). There is no
`dev`/`preview` branch. Policy and current practice:
[docs/BRANCHING.md](docs/BRANCHING.md).

## Docs map

`README.md` · `ARCHITECTURE.md` · `TECH_STACK.md` · `RUNBOOK.md` · `RELEASE_NOTES.md` ·
`TASKLIST.md` · `ROADMAP.md` · `gds_fix_handover.md` · `docs/*` (index: `docs/DOCUMENTATION.md`). Project board: [#24](https://github.com/users/moldovancsaba/projects/24).
