# Next-Agent Handover Prompt

**Last Updated**: 2026-07-04
**Context**: hand this to the next agent that works on Camera in a **non-sandbox**
environment (real MongoDB, deploy credentials, a browser for visual checks). Copy the
fenced block below verbatim as the agent's opening prompt; adjust the two notes after it.

---

```
You are picking up the Camera repo (moldovancsaba/camera, Next.js 16 / React 19 /
TS 5.9, MongoDB Atlas + imgbb + SSO, GDS 3.9 @sovereignsquad, deployed on Vercel).
You are NOT in a sandbox — you have a real MongoDB, deploy credentials, and a browser.

CURRENT STATE (read these first):
- `main` is at v2.17.0. Canonical docs: README.md, ARCHITECTURE.md, TECH_STACK.md,
  HANDOVER.md, docs/*. Version source of truth is package.json.
- A full issue audit + reconciliation already happened: docs/ISSUE_AUDIT_2026-06-30.md.
  The GitHub board went from 23 open issues to 3 open. Do not re-audit; trust that doc
  but re-verify anything before you close it.
- The release gate is `npm run release:check` (GDS manifest+compliance+boundary,
  type-check, lint, verify:production-guards, build). It passes on main. Run it before
  every commit that touches code, and always before deploying.
- IMPORTANT: `main` is several versions AHEAD of production. Production is still on
  commit 1b50664 (v2.14.0). Everything from v2.15.0–v2.17.0 is committed but NOT deployed.
- Git pushes do NOT auto-deploy. Deploy is manual: `npx vercel@latest --prod`.
  GitHub Actions workflows were deliberately removed (commit c0b8b54) — do not re-add
  CI unless explicitly asked.

DEVELOP on branch `claude/repo-sandbox-issue-audit-le5tsk` (or a fresh branch off main
if you prefer); the previous work is already merged to main. Commit with clear messages
and push. Do not open PRs or deploy without confirming with me first.

THE 3 OPEN ISSUES — do these in order:

1) #84 (export-route tests) — HIGHEST PRIORITY, quickest win.
   The test file tests/e2e/event-exports.spec.ts is ALREADY WRITTEN and merged, but was
   never executed (previous agent had no MongoDB). Your job: run it and make it green.
   - Ensure a disposable test DB is configured (MONGODB_DB containing e2e/test/dev/
     local/sandbox/staging, e.g. camera_test) plus MONGODB_URI and
     CAMERA_TRYON_INTERNAL_SECRET.
   - Run: `npm run test:e2e:safe` (this preflights env + the disposable-DB guard and
     manages its own web server). Expect 23 tests across 7 specs.
   - If event-exports.spec.ts fails, fix the spec OR the route — diagnose honestly; the
     spec's fixture assumptions are documented in its header comment and rely on
     /api/e2e/bootstrap seeding two submissions from e2e-user@camera.local.
   - When all 23 pass, comment the green result on issue #84 and close it (state_reason
     completed). Report the actual pass/fail counts — do not claim green without the run.

2) #76 and #77 (GDS public-surface + media-card UI migrations) — need VISUAL verification.
   These are accessibility/visual migrations to official GDS primitives. Full specs are
   in the GitHub issue bodies. #77 = media/image cards → MediaCard/MediaPreviewCard/
   ListingCard/ProductCard with object-fit contain (no cropping). #76 = public capture/
   share/recovery/playback → PublicShell/PublicCaptureFlow/ShareButtonGroup/
   PlaybackControls etc. Both depend on primitives from @sovereignsquad/gds-* 3.9 — first
   confirm which of those primitives actually exist in the installed package version
   (grep node_modules/@sovereignsquad/gds-*/dist/*.d.ts) before designing the migration;
   the issue bodies were written against 3.4.3 names.
   - Do the migration incrementally, one surface at a time, running `npm run dev` and
     visually checking each in a browser (mobile + desktop, light + dark, keyboard-only).
   - Run `npm run release:check` after each surface.
   - These are the acceptance-gated items — do NOT close them without real visual +
     a11y verification (keyboard, focus, screen-reader labels, reduced motion).

AFTER the issues, if I ask you to deploy:
   - `git checkout main && git pull`
   - `npm ci && npm run release:check`  (must pass)
   - `npm run test:e2e:safe`            (must pass, needs test DB)
   - `npx vercel@latest --prod`
   - Verify per RUNBOOK.md (curl the health checks; /admin/events should 307 to SSO,
     NOT 500). Update HANDOVER.md's "Deployed commit" line.

CONVENTIONS TO RESPECT:
- App auth uses session.appRole, NOT session.user.role (see docs/AUTHORIZATION.md).
- eventId is overloaded on purpose: admin URLs use Mongo _id, public slideshow/submission
  matching uses the UUID field. Don't collapse them.
- Server Components must never pass a function `component` prop to a client component —
  there's a lint rule (camera-rsc/no-component-fn-prop-in-server-files) that enforces this;
  use component="a" in Server Components.
- Update docs in the same change as code (README/ARCHITECTURE/RELEASE_NOTES + the focused
  doc for the area). Bump package.json version and add a RELEASE_NOTES entry for anything
  user-facing.
- There's a separate backlog item in TASKLIST.md: admin create/`new` pages (frames, logos,
  partners, suits) still use raw <input> uniformly — a consistency pass, lower priority
  than the above.

Start by running `npm ci && npm run release:check` to confirm a clean baseline, then
`npm run test:e2e:safe` to see where #84 stands. Report what you find before making changes.
```

---

**Before you paste, adjust:**
- If the next agent should use a **fresh branch** instead of continuing
  `claude/repo-sandbox-issue-audit-le5tsk` (already merged to main), change the "DEVELOP on
  branch" line.
- Keep the "confirm before deploying" guard — production is many versions behind, so the
  first deploy is the risky one. Remove it only if you want fully autonomous deploys.
