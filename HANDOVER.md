# Handover

**Version**: 12.3.39
**Last Updated**: 2026-09-29

`RELEASE_NOTES.md` is kept current on every release and is the detailed record;
this file is the short current-state summary. Previous rewrite: 2026-08-17
(v2.23.0 era); everything from v12.2.0 to v12.3.37 is in `RELEASE_NOTES.md`.

## Status 2026-09-28

- **Version** 12.3.39 (the v12.3.39 hardening batch below). Fleet policy
  (messmass `docs/_audit/fleet-version-policy.md`) bumps messmass, fanmass,
  try-on and savetheworld to the same version in the same coordinated release;
  12.3.38 was the last lockstep release.
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
- **Dependabot**: 0 open alerts on 2026-09-29 (v12.3.38 updated `sharp`, `next`,
  the `postcss` override and the transitive packages).
- **Design system**: GDS 6.3.0 installed from vendored release tarballs
  (`vendor/gds/*.tgz` via `file:` specs in `package.json`, since v12.3.29); no
  registry token needed.

## Open items

- **Consent decision (owner).** publish-selfies flips an explicit
  `isShareVisible: false` (a fan who unticked sharing) as well as missing
  values; the pledge wall (`GET /api/internal/savetheworld/pledges`) treats a
  missing `isShareVisible` as visible, which covers 505 legacy submissions
  created before the share opt-in existed. Decide whether both behaviors are
  intended.
- **Vercel Node setting.** Project `04_camera` is set to Node 22.x; builds run on
  24 because `package.json` `engines.node` (`>=24.0.0 <25.0.0`) overrides it.
  Set the dashboard to 24.x.
- **`CRON_SECRET` (owner).** The `*/5` try-on sync cron gets 403 on every run
  while `CRON_SECRET` is unset in production, so the completion backstop is off.
  Its engineering precondition, an idempotent backstop, landed in v12.3.39.
  Decide whether to set the secret, or to remove the cron from `vercel.json`
  while try-on is paused. See `RUNBOOK.md` "Scheduled jobs and workers".
- **messmass → camera shared session (owner).** Every messmass login calls
  `POST /api/internal/messmass/sso-session`, and SSO refuses the forwarded
  messmass token read access to camera's permission record (SSO client scoping,
  sso `6fb1b6a7`). Since v12.3.39 that answers 403
  `sso_token_cannot_read_camera_permission` instead of a 500, so no camera
  session is minted from a messmass login. To make it work: enable the
  `client_credentials` grant with `manage_permissions` for camera's SSO client,
  then read the permission with camera's own client token.
- **Secret scanning settings (owner).** Non-provider patterns and validity
  checks are off for this public repo (Settings > Code security). The CI
  gitleaks step covers the working tree only, not history.
- **Branch protection bypass.** `main` requires a PR and the `Verify` check, but
  not for admins (`enforce_admins: false`); direct pushes bypass it and Vercel
  deploys them regardless of CI.
- **`CameraCapture` `autoStart` unreliable under `next dev`** (FRONT-008) —
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
  counterparts (`AdminCrudForm`).
- Two `react-hooks` advisory ESLint rules (`set-state-in-effect`,
  `preserve-manual-memoization`) still off in `eslint.config.mjs:78-79` —
  revisit under a React Compiler adoption.

Older follow-ups from the 2026-08-17 handover, not re-verified on 2026-09-28:
GDS `AdminResourceCard`/`MediaPreviewCard` workarounds live in camera's own code
(forced "edit" label, double-wrapped `Badge`, no way to omit the media block);
the E2E export suite (#84, closed 2026-07-08) should be run green against a
MongoDB-backed environment before trusting that closure.

## Branching

Single long-lived branch `main` (production), plus short-lived per-task branches
(`feature/*`, `fix/*`, `chore/*`, `dependabot/*`, …). There is no
`dev`/`preview` branch. Policy and current practice:
[docs/BRANCHING.md](docs/BRANCHING.md).

## Docs map

`README.md` · `ARCHITECTURE.md` · `TECH_STACK.md` · `RUNBOOK.md` · `RELEASE_NOTES.md` ·
`TASKLIST.md` · `ROADMAP.md` · `docs/*` (index: `docs/DOCUMENTATION.md`).
