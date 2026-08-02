# Tasklist

**Version Context**: 2.20.0  
**Last Updated**: 2026-08-02

This file should contain only active near-term execution items. Historical delivery belongs in `RELEASE_NOTES.md`.

## Active tasks

### CameraCapture autoStart unreliable under `next dev` (new — see LEARNINGS.md FRONT-008)

- status: found, not fixed — out of scope for the guided-tour work that surfaced it
- what's wrong: `CameraCapture.tsx`'s `autoStart` effect guards against
  double-invocation with a `useRef` flag that survives React StrictMode's
  dev-only mount→cleanup→remount cycle, while its `setTimeout(startCamera, 0)`
  does not — the first mount's cleanup cancels the pending timer, and the
  second (real) mount's effect body sees the ref already `true` and returns
  early. Net effect: `autoStart` never calls `startCamera()` under `next dev`.
- not yet verified whether this reproduces in a production build (StrictMode's
  double-invoke is dev-only, so it may not) — that's the first thing to check
  before attempting a fix
- likely fix shape: don't gate the *scheduling* of the timer on a ref that
  survives remounts; either drop the `setTimeout(..., 0)` indirection (call
  `startCamera` directly in the effect body) or reset the ref in the cleanup
  function too

### GDS AdminResourceCard/MediaPreviewCard limitations (new — see RELEASE_NOTES.md v2.19.0)

- status: mostly resolved this cycle, one item genuinely needs an upstream fix
- what shipped: worked around three real bugs in `@sovereignsquad/gds-admin`'s
  `AdminResourceCard`/`MediaPreviewCard` (v3.9.0, the only published version) —
  actions forced to the "edit" label regardless of custom `label` text
  (#103), the `status` slot double-wrapping a `Badge` passed into it (#104),
  and no way to omit the always-rendered media/image block for records with
  no image (#105)
- remaining: these are workarounds in camera's own code, not fixes to the
  library — file an upstream issue/PR against `sovereignsquad/general-design-system`
  if that repo is reachable from this account; until then, any *new*
  `InventoryList` component must follow the same patterns (`onPreview` for a
  second non-edit action, icon-kind for anything that isn't literally
  edit/delete, `ResourceListGrid` instead of `AdminResourceManager` for
  records with no image) or it will reintroduce one of these bugs
- `#71` and `#77` were previously closed as delivering this exact surface
  (`AdminResourceManager` adoption, media-card behavior) — they were closed
  prematurely; see the new GitHub issue filed against this finding rather
  than reopening them directly

### Admin create-page consistency (from v2.17.0 cycle, still open)

- status: backlog — the `new`/create admin pages (frames, logos, partners, suits) remain on
  raw `<input>`/`<textarea>` uniformly; migrate to `AdminCrudForm` primitives for parity with
  the edit pages. Separate from #74 (which was edit-page parity, delivered in v2.17.0).

### E2E suite execution (#84 — closed, verify still holds)

- status: #84 was closed in an earlier cycle; if `event-exports.spec.ts` hasn't
  actually been run green in a MongoDB-backed environment since, re-verify
  before trusting that closure

## Recently completed (v2.19.0 — see RELEASE_NOTES.md)

Two work streams, 16 PRs (#90–#105):

- **SSO / messmass integration**: shared internal email service (#90),
  bidirectional partner sync (#91), mojibake-text repair (#92), shared SSO
  session with messmass (#93), and three incremental sign-in UI fixes
  (#94–#96)
- **Admin sign-in architecture rework**: split the homepage and `/admin/login`
  like messmass (#98), fixed two self-inflicted redirect loops that followed
  (#99, #100), fixed a stale-cached-`appAccess` loop and a cross-subdomain
  stale-cookie bug found via real production reports (#101, #102)
- **GDS admin-card bug fixes**: duplicate/mislabelled "Edit" buttons (#103),
  doubled status pill (#104), unwanted image placeholder on image-less cards
  (#105) — see the "Active tasks" item above for the upstream-fix follow-up
- **Process**: added `CLAUDE.md` (#97); stripped AI attribution footers
  retroactively from all 16 PR descriptions in this range per that same
  file's branding-ban rule

## Recently completed (v2.17.0 — see RELEASE_NOTES.md)

- **#83 observability**: structured logger (`lib/observability/logger.ts`) wired into the API
  error boundary + client-error beacon (`/api/observability/client-error` ← `app/error.tsx`)
- **#78 release gate**: formalized as `npm run release:check` (decision: local gate, not CI)
- **#74 GDS forms**: logos editor migrated to `AdminCrudForm` parity with frames

## Recently completed (v2.15.0–v2.16.0 — see RELEASE_NOTES.md)

- issue audit + backlog fixes: #60 safe runner, #85 production-guard verification,
  #84 export-route tests, #75 GDS confirm parity, #82 RSC lint guard
- tracker reconciliation (23 → 6 open) and repository-wide documentation refresh

## Notes

- `package.json` is the canonical version source
- `README.md`, `ARCHITECTURE.md`, and `docs/*` are the canonical documentation set
- planning beyond active execution belongs in `ROADMAP.md`
- as of 2026-08-02 the GitHub issue tracker for this repo has **zero open issues** —
  every issue referenced in this file's older sections is closed; treat any
  issue number below as historical unless a new one is filed
