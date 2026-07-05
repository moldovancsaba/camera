# Tasklist

**Version Context**: 2.16.0  
**Last Updated**: 2026-07-04

This file should contain only active near-term execution items. Historical delivery belongs in `RELEASE_NOTES.md`.

## Active tasks

### Tracker reconciliation (from `docs/ISSUE_AUDIT_2026-06-30.md`)

- status: **complete on 2026-07-04** — board reduced from 23 to 6 open issues
- outcome:
  - closed with evidence comments: #58, #59, #60, #61, #62, #63, #64, #65, #66, #67, #70, #71, #72, #75, #81, #82, #85 (17 issues)
  - kept open with status comments: #84 (tests merged, awaiting first green run), #78 (premise note posted; needs CI-vs-local decision)
  - untouched (accurate as filed): #74, #76, #77, #83

### Observability (#83)

- status: blocked on a decision — Sentry vs. structured Vercel logging as the error sink
- scope: wire `app/error.tsx` and server catch paths to the chosen sink; alert on new server errors

### GDS UI follow-through (#74, #76, #77)

- status: active
- focus:
  - logos editor `AdminCrudForm` parity with frames (#74)
  - public capture/share primitive adoption (#76)
  - media card primitives with non-cropping behavior (#77)
  - re-validate primitive names against `@sovereignsquad/* 3.9` before resuming

### Release gate / CI decision (#78)

- status: blocked on a decision — restore GitHub Actions or formalize the local gate
- current state: `gds:check`, type-check, lint, and build run locally/manually only
- note: premise/status comment posted on #78 (2026-07-04)

### E2E suite execution

- status: pending — run `npm run test:e2e:safe` in a MongoDB-backed environment to execute
  the new `event-exports.spec.ts` (written and lint/type-clean, not yet executed)

## Recently completed (v2.15.0 — see RELEASE_NOTES.md)

- issue audit + backlog fixes: #60 safe runner, #85 production-guard verification,
  #84 export-route tests, #75 GDS confirm parity
- documentation refresh: relative links, GDS 3.5 references, CI claims, version headers

## Notes

- `package.json` is the canonical version source
- `README.md`, `ARCHITECTURE.md`, and `docs/*` are the canonical documentation set
- planning beyond active execution belongs in `ROADMAP.md`
