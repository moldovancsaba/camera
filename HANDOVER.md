# Handover

**Version**: 12.3.37
**Last Updated**: 2026-09-28

`RELEASE_NOTES.md` is kept current on every release and is the detailed record;
this file is the short current-state summary. Previous rewrite: 2026-08-17
(v2.23.0 era); everything from v12.2.0 to v12.3.37 is in `RELEASE_NOTES.md`.

## Status 2026-09-28

- **Version** 12.3.37 (fleet lockstep with messmass, fanmass, try-on,
  savetheworld).
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
- **Dependabot alerts** (2026-09-28): 2 critical (`next`), 5 high, 3 medium open;
  details in `RUNBOOK.md`. Dependabot PRs #149–#152 and #134 are open and pass CI.
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
