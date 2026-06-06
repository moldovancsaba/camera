# Try-On Architecture

**Version**: 2.10.0  
**Last Updated**: 2026-05-26

## Purpose

Camera remains the intake system. The try-on pipeline is asynchronous and uses a dedicated queue collection instead of overloading the main `submissions` flow.

## Runtime flow

1. Camera capture saves the normal composed submission through `POST /api/submissions`.
2. If a leather jersey was selected, Camera uploads the original unframed capture as a second image source.
3. Camera creates or reuses a `tryon_jobs` document linked to the saved submission.
4. The local worker in the try-on worker repository polls Atlas, claims a job with a lease, downloads the source image, downloads the selected Camera-hosted suit asset, and runs the processor.
5. The worker uploads the final result to imgbb and calls `POST /api/internal/tryon/complete`.
6. Camera materializes a derived `submissionKind=tryon_result` record in `pending_review`.
7. Admins operate Try-On from `/admin/tryon`, monitor live queue state in `/admin/tryon/queue`, manage selectable leather jerseys in `/admin/tryon/suits`, and review generated outputs in `/admin/tryon/vetting`.
8. Approval or rejection archives the result out of the live moderation queue into an archive bucket while preserving its publication state.
9. Only approved generated results become share-visible and slideshow-eligible.

## Why this shape

- `submissions` stays authoritative for Camera galleries, sharing, and slideshows.
- `tryon_jobs` carries queue state, retries, leases, and worker metadata.
- generated try-on outputs become derived `submissions`, not queue-only artifacts
- The worker consumes a clean contract instead of scraping Camera UI or polling random URLs.

## Collections

### `leather_suits`

Canonical suit catalog used by the Camera UI and local worker resolution.

Key fields:
- `leatherSuitId`
- `name`
- `description`
- `category`
- `assetKey`
- `assetVersion`
- `imageUrl`
- `thumbnailUrl`
- `previewUrl`
- `active`

Important boundary:
- Camera manages the uploaded suit asset in imgbb-backed storage, plus the catalog metadata shown in admin and public capture flows.
- The worker downloads the processing suit image from Camera-managed storage first.
- Legacy local asset resolution remains only as a fallback for older suit records.

### `tryon_jobs`

Queue and state machine for asynchronous try-on work.

Key fields:
- `jobId`
- `requestHash`
- `status`
- `stage`
- `pipeline`
- `pipelineVersion`
- `source.submissionId`
- `source.imageUrl`
- `request.leatherSuitId`
- `processing.workerId`
- `processing.leaseExpiresAt`
- `processing.nextAttemptAt`
- `result.publicResultUrl`
- `error`

## Queue semantics

- Claiming uses `findOneAndUpdate` with lease expiry.
- Retries use `status=retry_wait` plus `processing.nextAttemptAt`.
- Manual retry resets a failed or retry-wait job back to `queued`, clears prior error/result state, and zeroes the attempt counter.
- Stale claims are recovered when a worker sees expired leases.
- Deduplication is enforced with `requestHash`.

## API surfaces

### `GET /api/tryon/suits`

Returns the active suit catalog for public capture flows.

### `POST /api/submissions`

Additive try-on request fields:
- `requestTryOn`
- `leatherSuitId`
- `tryOnSourceImageData`

Normal submission creation still succeeds even if try-on enqueue fails. The response includes a `tryOn` block describing the queue outcome.

### `POST /api/internal/tryon/complete`

Signed internal callback used by the local try-on worker after it uploads the generated result to imgbb.

The endpoint:
- validates the queue job
- marks the queue job `done`
- creates a derived `submissionKind=tryon_result` record
- sets `reviewStatus=pending_review`
- keeps the generated result hidden from share/slideshow until approval

### `GET /api/admin/tryon-results`

Admin moderation queue for generated try-on results.

- default view shows only live moderation items
- `?archive=approved` shows approved items archived out of the active queue
- `?archive=rejected` shows rejected items archived out of the active queue
- supported filters:
  - `reviewStatus=pending_review|approved|rejected`
  - `partnerId=<partnerId>`
  - `eventId=<eventId>`
  - `suitId=<leatherSuitId>`
- pagination contract:
  - `page=<n>` (default `1`)
  - `limit=<n>` (default `50`, max `100`)
  - response includes `pagination: { page, limit, total, pages }`

### `POST /api/admin/tryon-jobs/[jobId]/retry`

Admin retry endpoint for failed or retry-wait jobs.

### `GET /api/admin/tryon-suits`

Admin catalog surface for selectable leather jerseys.

### `POST /api/admin/tryon-results/[submissionId]/approve`

Publishes an approved generated result to:
- the source submission share family
- slideshow playlists only when the event-level try-on policy allows approved result publication
- archives the moderation record out of the active vetting queue

### `POST /api/admin/tryon-results/[submissionId]/reject`

Keeps the generated result hidden from public share/slideshow surfaces and archives the moderation record out of the active vetting queue.

## Worker filesystem

Default local root:

```text
<worker-queue-root>
```

Expected structure:

```text
incoming/
processing/<jobId>/
done/<jobId>/
failed/<jobId>/
logs/
```

## Constraints

- Worker source downloads are allowlisted by hostname.
- Try-on should use the original capture image, not the branded composite submission.
- Camera does not block user capture if the try-on queue step fails after submission save.
- Slideshows and public share pages must never read directly from `tryon_jobs`; they only use approved derived submissions.
- Moderation archive is separate from the global `isArchived` submission flag so approved try-on results can stay publicly visible.
- Leather jerseys now follow the same resource pattern as frames and logos: Camera owns the uploaded suit asset and exposes it to the worker through remote URLs.
