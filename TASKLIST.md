# Tasklist

**Version Context**: 2.12.0  
**Last Updated**: 2026-06-08

This file should contain only active near-term execution items. Historical delivery belongs in `RELEASE_NOTES.md`.

## Active tasks

### Documentation refresh

- status: complete on 2026-05-20
- outcome:
  - canonical docs rewritten around the current Camera Core + Apps model
  - Mongo identifier guidance corrected
  - authorization docs aligned to the partner-scoped access model
  - roadmap/tasklist metadata normalized

### Partner-scoped authorization follow-through

- status: largely complete on 2026-06-08
- outcome:
  - partner/manager APIs scoped to Events partner assignments
  - auth holes closed on partner detail, frame read, and inactive-event logos
  - viewer role can read events but not manage gallery uploads
  - E2E coverage: `admin-access.spec.ts`, `partner-api-auth.spec.ts`

### Try-On lifecycle, analytics, and identity (issues #61–#68)

- status: complete on 2026-06-08
- outcome:
  - superseded rerun archive contract, vetting visibility, funnel metrics/UI/exports
  - identity classification metadata, `/admin/tryon/identity`, operator scripts
  - E2E: `tryon-rerun-lifecycle.spec.ts`, `tryon-analytics-smoke.spec.ts`

### GDS admin migration (#70–#75)

- status: largely complete on 2026-06-08
- outcome:
  - events/users inventory on `AdminResourceManager` / `AdminDataTable`
  - frame editor on `AdminCrudForm`; moderation on `SemanticButton` + `useGdsToasts`
  - legacy `confirm-destructive` and `modals` bridges removed

### Admin UX follow-through

- status: active
- focus:
  - logos editor `AdminCrudForm` parity with frames
  - public capture/share primitive adoption (#76–#77)

## Notes

- `package.json` is the canonical version source
- `README.md`, `ARCHITECTURE.md`, and `docs/*` are the canonical documentation set
- planning beyond active execution belongs in `ROADMAP.md`
