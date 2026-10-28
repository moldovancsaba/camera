# Event Data Exports — Low-Level Design

**Version**: 12.3.42
**Last Updated**: 2026-10-28

Manager-gated exports of the data collected for a single event, surfaced on the event
detail page (`/admin/events/[id]`).

## Surfaces

| Export | Route | Formats |
| --- | --- | --- |
| Email addresses | `GET /api/admin/events/[id]/export/emails` | CSV |
| All event images | `GET /api/admin/events/[id]/export/images?format=csv\|zip&kind=all` | CSV (URLs), ZIP (files) |
| One event image rendition | `GET /api/admin/events/[id]/export/images?format=zip&kind=original\|final` | ZIP (files) |
| Selected gallery photos | `POST /api/admin/events/[id]/export/images` | ZIP (files), form fields `kind` and repeated `submissionIds` |

UI: [`components/admin/EventExportControls.tsx`](../components/admin/EventExportControls.tsx),
rendered on the event detail page only when `canManageEvent` is true.
The gallery (`/admin/events/[id]/gallery`) offers selected original and framed-photo ZIPs
to managers; selection is limited to the photos currently loaded in the gallery.

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
- `originalImageUrlForExport(submission)` — chooses a retained or verified unframed source;
  for legacy unframed photos, the photo itself is the original. It never treats a known
  framed composition as an original when its source is missing.
- `eventImageForSubmission(submission, kind)` — resolves the requested original or final
  rendition from one submission.
- `collectEventImages(submissions, onlyKind?)` — flattens each submission into `original` /
  `final` / `primary` image entries (deduped per submission); a stored try-on result of the
  removed integration is exported like any submission (its primary image is the derived result).
- `toCsv` / `csvEscape` — RFC 4180 quoting; `exportSlug` / `imageExtension` — filename helpers.
- `MAX_ZIP_IMAGES = 500`.

## Emails route

Builds a CSV with columns: `email, name, source, submissions, first_submitted_at,
last_submitted_at`. Filename: `event-<slug>-emails-<date>.csv`.

## Images route

- `format=csv` (default, uncapped): one row per image —
  `submission_id, kind, submission_kind, url, user_email, user_name, created_at`.
- Optional `kind=all|original|final` narrows the CSV or ZIP. `original` uses the retained
  full-frame source when available; `final` uses the framed result, or the stored primary
  image when it has no separate final URL.
- `format=zip`: guards `images.length` against `MAX_ZIP_IMAGES` (returns `400` pointing to
  the CSV when exceeded; `400` when there are no images). Otherwise streams a ZIP built by
  `createImagesZip` (`lib/events/image-zip.ts`, on `archiver`'s `ZipArchive`): each image is fetched
  from its host and appended under `original/`, `final/`, or `primary/` as
  `<kind>/<NNNN>-<submissionId>.<ext>`. The route allows up to 120 seconds; image reads run in
  bounded batches of eight, each source has a 20-second request/body timeout and up to three
  attempts for network errors, HTTP 408/425/429 and 5xx. Failed sources are listed
  in `_errors.txt`; they do not abort the remaining files. A 95-second work budget keeps
  the response within its 120-second function allowance; remaining entries are explicitly
  listed in `_not-included.txt` rather than returning a truncated archive.
- The selected-photo `POST` is manager-only, accepts one `kind` (`original` or `final`) plus
  repeated `submissionIds`, and re-applies the gallery's consent, approval, erasure and hidden
  photo filters on the server. It rejects stale/ineligible selections rather than exporting
  them. Selected ZIPs are capped at 500 IDs. Selected records without a retained original are
  omitted from the original ZIP and listed by submission ID in `_not-included.txt`.
- Event overview controls keep the combined CSV/ZIP and add separate all-original and
  all-framed ZIP links. Gallery controls submit the selected IDs as a native form so the browser
  can download the response without buffering the whole archive in JavaScript.
- The Node archive stream is converted to a web `ReadableStream` via `Readable.toWeb` for the
  App Router response. `runtime = 'nodejs'`.

## Data model references

- Email sources: `submission.userEmail`, `submission.userInfo.email`.
- Image sources: `submission.originalImageUrl`, retained unframed `photoReview.photoUrl` or
  verified `imageCopies`, unframed `imageUrl`/`finalImageUrl`, then `submission.finalImageUrl` and
  `submission.imageUrl` for the composed result.
- Event linkage: `submission.eventId` (mirror) and `submission.eventIds[]` (reusable submissions).

See [MONGODB_CONVENTIONS.md](./MONGODB_CONVENTIONS.md) and the `Submission` interface in
`lib/db/schemas.ts`.

## Test coverage

ZIP unit coverage reads the completed archive and checks names, bytes, checksums, transient retries and failure/omission manifests. The event-export E2E suite also checks unauthenticated selected-export access, original/final CSV filters, and refusal of a stale or ineligible selection. Run E2E with `npm run test:e2e:safe`; it was not run for this change because the local database/browser test environment is not configured here.
