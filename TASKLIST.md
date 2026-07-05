# Tasklist

**Version Context**: 2.17.0  
**Last Updated**: 2026-07-04

This file should contain only active near-term execution items. Historical delivery belongs in `RELEASE_NOTES.md`.

## Active tasks

### Tracker reconciliation (from `docs/ISSUE_AUDIT_2026-06-30.md`)

- status: **complete on 2026-07-04** — board reduced from 23 to 6 open issues
- outcome:
  - closed with evidence comments: #58, #59, #60, #61, #62, #63, #64, #65, #66, #67, #70, #71, #72, #75, #81, #82, #85 (17 issues)
  - kept open with status comments: #84 (tests merged, awaiting first green run), #78 (premise note posted; needs CI-vs-local decision)
  - untouched (accurate as filed): #74, #76, #77, #83

### GDS UI follow-through (#76, #77)

- status: active — best done with visual verification
- focus:
  - public capture/share primitive adoption (#76)
  - media card primitives with non-cropping behavior (#77)
  - re-validate primitive names against `@sovereignsquad/* 3.9` before resuming
- note: #74 (logos editor `AdminCrudForm` parity) delivered in v2.17.0

### Admin create-page consistency (new)

- status: backlog — the `new`/create admin pages (frames, logos, partners, suits) remain on
  raw `<input>`/`<textarea>` uniformly; migrate to `AdminCrudForm` primitives for parity with
  the edit pages. Separate from #74 (which was edit-page parity).

### E2E suite execution (#84)

- status: pending — run `npm run test:e2e:safe` in a MongoDB-backed environment to execute
  `event-exports.spec.ts` (written and lint/type-clean, not yet executed); close #84 on first green run

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
