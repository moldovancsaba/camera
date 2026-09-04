# Handover

**Version**: 12.2.21
**Last Updated**: 2026-08-17

This file had drifted five weeks stale (still describing v2.18.0 / deployed
commit `1b50664`) — `RELEASE_NOTES.md` (kept current on every release) was the
real source of truth in the meantime. Rewritten from `RELEASE_NOTES.md`,
`TASKLIST.md`, and `git log` to reflect actual current state.

## Branching

Single long-lived branch `main` (production), plus short-lived per-task branches
(`feature/*`, `fix/*`, `chore/*`, `dependabot/*`, …) merged in via PR and then
deleted. There is no `dev`/`preview` branch — an earlier three-branch plan was
never adopted (`git branch -a` has zero `dev`/`preview` refs). Policy:
[docs/BRANCHING.md](docs/BRANCHING.md).

## Production status

- Live and healthy at `camera.messmass.com` (Vercel `narimato/04_camera`).
- **Deployed commit is not verified as part of this rewrite** — no Vercel CLI/API
  access available to confirm which commit is actually live vs. `main` HEAD
  (`9e41425`). Git push does **not** auto-deploy; ship with
  `npx vercel@latest --prod` when ready (see `RUNBOOK.md`), and run
  `npm run release:check` first. Treat the deployed commit as unknown until
  someone checks the Vercel dashboard directly — don't assume it matches `main`.
- Working tree is clean, local `main` matches `origin/main`.

## Shipped since the last handover (v2.19.0 → v2.23.0)

- **v2.23.0** — bumped vendored GDS `4.1.3` → `6.0.0` (still unpublished to any
  registry; `gds-adoption.json`'s `gdsVersion` deliberately stays at `3.9.0`,
  same pattern as prior vendoring bumps). Checked upstream breaking-change docs
  between the tags; zero references to either breaking change in this repo.
- **v2.22.0** — the four admin create/`new` pages (frames, logos, partners,
  try-on suits) migrated from raw `<input>`/`<textarea>`/`<select>` to
  `AdminCrudForm`/`Admin*` primitives, closing a backlog item open since
  v2.17.0. Their **edit** counterparts for partners/tryon-suits are still on
  raw `FormSection` + inputs — separate, not-yet-scoped gap.
- **v2.21.0** — vendored GDS `4.1.3`, migrated `HashtagInput` chips to `ChoiceChip`.
- Between v2.20.0 and v2.21.0 (PR #110, no version bump) — expanded the
  AI-attribution branding policy to cover the full workflow surface.
- **v2.20.0** — guided tour (spotlight onboarding overlay) for admin panel +
  capture flow (#109): a from-scratch engine (no vendored GDS/third-party
  equivalent exists, documented `package-coverage-gap` exception), driving
  the admin nav/account panel tour and the public capture flow's three
  phase-scoped mini-tours.
- **v2.19.0** — SSO integration + admin sign-in rework; GDS card fixes.
- Preview-image thumbnails for grid/list photo views (sharp downscale + imgbb
  upload).
- `.gitignore` broadened to cover all `.env*` variants, and one commit
  (`9e41425`, `main` tip) redacts credentials that had leaked onto the branch —
  if you're investigating repo secret hygiene, start there.

## Verification (current `main`, per RELEASE_NOTES.md v2.23.0 entry)

`npm run release:check` (manifest validate → GDS boundary check → type-check →
lint → production guards → build) clean as of the v2.23.0 commit. Not
independently re-run as part of this handover rewrite.

## Open follow-ups (from TASKLIST.md, 2026-08-08)

- **`CameraCapture` `autoStart` unreliable under `next dev`** (FRONT-008) —
  found, not fixed. A `useRef` double-invoke guard survives React StrictMode's
  dev-only mount→cleanup→remount cycle, but the `setTimeout(startCamera, 0)`
  it guards does not, so the first mount's cleanup cancels the pending timer
  and the real mount sees the ref already `true` and returns early —
  `autoStart` never fires under `next dev`. Not yet verified whether this
  reproduces in a production build. Likely fix: don't gate the timer's
  *scheduling* on a ref that survives remounts.
- **GDS `AdminResourceCard`/`MediaPreviewCard` limitations** — mostly worked
  around this cycle (forced "edit" label on actions, double-wrapped `Badge`
  in the `status` slot, no way to omit the media block for imageless
  records). These are workarounds in camera's own code, not upstream fixes —
  file against `sovereignsquad/general-design-system` if reachable. Any new
  list/grid component must follow the same patterns or it'll reintroduce one
  of these bugs.
- **partners/tryon-suits edit pages** — still raw `FormSection` + inputs,
  unlike their now-migrated `new` counterparts and the already-migrated
  frames/logos edit pages.
- **E2E export suite (#84)** — was closed in an earlier cycle; re-verify it's
  actually been run green against a MongoDB-backed environment before
  trusting that closure.
- 16 `react-hooks` advisory ESLint rules (`set-state-in-effect`,
  `preserve-manual-memoization`) still off in `eslint.config.mjs` — revisit
  under a React Compiler adoption.

## Docs map

`README.md` · `ARCHITECTURE.md` · `TECH_STACK.md` · `RUNBOOK.md` · `RELEASE_NOTES.md` ·
`TASKLIST.md` · `ROADMAP.md` · `docs/*`.
