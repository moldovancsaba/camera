# Event Data Exports — Low-Level Design

**Version**: 12.2.21
**Last Updated**: 2026-07-04

Manager-gated exports of the data collected for a single event, surfaced on the event
detail page (`/admin/events/[id]`).

## Surfaces

| Export | Route | Formats |
| --- | --- | --- |
| Email addresses | `GET /api/admin/events/[id]/export/emails` | CSV |
| Images | `GET /api/admin/events/[id]/export/images?format=csv\|zip` | CSV (URLs), ZIP (files) |

UI: [`components/admin/EventExportControls.tsx`](../components/admin/EventExportControls.tsx),
rendered on the event detail page only when `canManageEvent` is true.

## Access control

Both routes call `assertPartnerEventAccess(db, session, id, 'manager')`
(`lib/partners/authorization.ts`), which throws `403` below manager access. Global admins
are auto-allowed. A missing event is `404`. Bulk PII/image export is treated as a
manage-level action, not a viewer-level read.

## Shared logic — `lib/events/event-export.ts`

- `loadEventForExport(db, idParam)` — resolves the event by Mongo `_id`, returns
  `{ id, eventId, name }` or `null`.
- `collectEventSubmissionsForExport(db, eventUuid)` — every non-archived submission linked
  via the single `eventId` mirror **or** the `eventIds[]` array; submissions hidden from the
  event are excluded. Inactive-user filtering is intentionally **not** applied so the export
  is complete (these exports double as the GDPR data-export path).
- `buildEmailRows(submissions)` — deduplicates case-insensitively across `userEmail` (SSO)
  and `userInfo.email` (guest form); records name, source (`sso`/`guest`/`sso+guest`),
  submission count, first/last submitted timestamps; synthetic anonymous addresses skipped.
- `collectEventImages(submissions)` — flattens each submission into `original` / `final` /
  `primary` image entries (deduped per submission), covering try-on results (whose primary
  image is the derived result).
- `toCsv` / `csvEscape` — RFC 4180 quoting; `exportSlug` / `imageExtension` — filename helpers.
- `MAX_ZIP_IMAGES = 500`.

## Emails route

Builds a CSV with columns: `email, name, source, submissions, first_submitted_at,
last_submitted_at`. Filename: `event-<slug>-emails-<date>.csv`.

## Images route

- `format=csv` (default, uncapped): one row per image —
  `submission_id, kind, submission_kind, url, user_email, user_name, created_at`.
- `format=zip`: guards `images.length` against `MAX_ZIP_IMAGES` (returns `400` pointing to
  the CSV when exceeded; `400` when there are no images). Otherwise streams a ZIP via
  `archiver`: each image is fetched from imgbb and appended under `original/`, `final/`, or
  `primary/`; per-image fetch failures are recorded in `_errors.txt` instead of aborting the
  archive. The Node `archiver` stream is converted to a web `ReadableStream` via
  `Readable.toWeb` for the App Router response. `runtime = 'nodejs'`.

## Data model references

- Email sources: `submission.userEmail`, `submission.userInfo.email`.
- Image sources: `submission.originalImageUrl`, `submission.finalImageUrl`, `submission.imageUrl`.
- Event linkage: `submission.eventId` (mirror) and `submission.eventIds[]` (reusable submissions).

See [MONGODB_CONVENTIONS.md](./MONGODB_CONVENTIONS.md) and the `Submission` interface in
`lib/db/schemas.ts`.

## Test coverage

`tests/e2e/event-exports.spec.ts` (added v2.15.0) covers the access matrix (401 unauthenticated, 403 viewer, 403 unassigned, 404 missing event, global-admin allow), email-CSV deduplication, the image-CSV column contract, and the ZIP-on-empty-event 400. Run via `npm run test:e2e:safe`.
