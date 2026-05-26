# Try-On Architecture

## Purpose

Camera remains the intake system. The try-on pipeline is asynchronous and uses a dedicated queue collection instead of overloading the main `submissions` flow.

## Runtime flow

1. Camera capture saves the normal composed submission through `POST /api/submissions`.
2. If a leather jersey was selected, Camera uploads the original unframed capture as a second image source.
3. Camera creates or reuses a `tryon_jobs` document linked to the saved submission.
4. The local worker in `/Users/Shared/Projects/try-on` polls Atlas, claims a job with a lease, downloads the source image, resolves the local suit asset, and runs the processor.
5. The worker uploads the final result to imgbb and calls `POST /api/internal/tryon/complete`.
6. Camera materializes a derived `submissionKind=tryon_result` record in `pending_review`.
7. Admins review the generated result in `/admin/tryon-results`.
8. Only approved generated results become share-visible and slideshow-eligible.

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
- `category`
- `assetKey`
- `assetVersion`
- `assetRelativePath`
- `previewUrl`
- `active`

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

### `POST /api/admin/tryon-results/[submissionId]/approve`

Publishes an approved generated result to:
- the source submission share family
- slideshow playlists when the slideshow source mode includes approved try-on results

### `POST /api/admin/tryon-results/[submissionId]/reject`

Keeps the generated result hidden from public share/slideshow surfaces.

## Worker filesystem

Default local root:

```text
/Users/Shared/Projects/try-on/queue
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
