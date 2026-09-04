# Try-On Architecture

**Version**: 12.2.21  
**Last Updated**: 2026-07-04

## Purpose

Camera uses a strict separation between queue execution and published artifacts for try-on. `tryon_jobs` drives async processing state while `submissions` stores derived output records that are subject to moderation.

## 1. Runtime topology

- Intake creates a source submission and optional try-on request.
- Worker executes queue jobs and returns completed image URLs via signed callback.
- Administration uses `/admin/tryon-results` for moderation and `/admin/tryon` for queue/catalog operations.
- Analytics consumes only archived moderation outcomes for deterministic reporting.

## 2. Data flow

1. User or partner capture flow posts to `POST /api/submissions`.
2. When try-on is requested, Camera:
   - uploads the source image / asset reference
   - creates or updates a `tryon_jobs` document.
3. A local worker claims the job and executes the configured setup:
   - downloads input source
   - downloads garment asset from Camera-hosted storage
   - runs generation pipeline
   - uploads final image and calls `POST /api/internal/tryon/complete`.
4. Completion materializes a derived `submissionKind: 'tryon_result'` record:
   - stores source/garment/job linkage
   - preserves event, partner, and garment metadata
   - sets `reviewStatus = pending_review`
   - sets `isShareVisible = false`, `isSlideshowEligible = false` unless event policy explicitly bypasses moderation.
5. Administrators moderate via `/admin/tryon-results`:
   - pending queue: `tryOnModerationArchive.archived !== true` and `reviewStatus='pending_review'`
   - archive modes: `approved`, `rejected`, `service`, `greatest`
6. Manual recovery happens in job-level flows (`retry`, `rerun`, `reapply-result`) from the queue and moderation pages.

## 3. Contracts and state

- `leather_suits` collection and `tryOnLeatherSuitId` identifiers are retained as the compatibility contract for garments.
- User-facing language uses **Garment** while schemas and APIs preserve legacy names.
- Moderation outcomes:
  - `approve` → `approved` bucket
  - `reject` → `rejected` bucket
  - `service` → `service` bucket
  - `great` / `remove_great` mutate metadata flag only (`metadata.tryOnGreat`) while staying in `approved` bucket.
  - `rerun` supersedes prior result as rejected and queues a fresh job; new result must pass moderation again.
- Active queue is derived from `tryon_jobs` statuses excluding `failed` by default for SLA counters.
- Rerun results are never auto-published.

## 4. Core collections

### `leather_suits`

Canonical garment catalog used by capture and moderation UIs. Legacy identifier names are stable:
- collection: `leather_suits`
- business ID: `leatherSuitId`
- display fields: `name`, `description`, `assetKey`, `assetUrl`

### `tryon_jobs`

Queue document used for:
- lease/worker coordination
- retries and attempt scheduling
- preset selection (`request.setupId`, `processing.resolvedSetup`)
- source/result linkage (`source.submissionId`, `source.imageUrl`, `sourceJobId`)

### `submissions`

Output records for try-on attempts use:
- `submissionKind: 'tryon_result'`
- optional identity resolution against source submission
- moderation link data in `tryOnModerationArchive`

## 5. API surfaces

### `GET /api/tryon/suits`

Returns catalog entries for capture selection.

### `GET /api/admin/tryon-results`

Moderation query API with:
- `reviewStatus`, `archive`, `eventId`, `partnerId`, `suitId`
- paging: `offset` and `limit` (`limit` max 100, default 24)
- sort:
  - active queue and waiting order: `createdAt: 1` (oldest first)
  - archive modes: `createdAt: -1`
- archive filters:
  - `?archive=approved`
  - `?archive=rejected`
  - `?archive=service`
  - `?archive=greatest` (approved + great flag)

### `POST /api/admin/tryon-results/{submissionId}`

- `/approve` — marks approved, updates share/slideshow flags and archive bucket.
- `/reject` — marks rejected and hides from publication.
- `/service` — moves to service bucket.
- `/great` — marks approved + great metadata.
- `/remove-great` — removes great metadata while keeping approval state.

### `POST /api/admin/tryon-jobs/{jobId}`

- `/retry` — requeue `failed` or `retry_wait` jobs.
- `/rerun` — duplicate job with optional new active `setupId`; prior result is superseded as quality/retry recovery.
- `/reapply-result` — re-link completed result after external consistency fixes without creating a new job.

### Internal completion

- `POST /api/internal/tryon/complete` receives signed worker callback and creates/updates try-on result submissions.

### Analytics

- `GET /api/admin/tryon-analytics`
- `GET /api/admin/tryon-analytics/export?format=csv|json`

## 6. Observability and audits

- All moderation actions append immutable audit entries to `tryon_moderation_events` before or alongside submission updates.
- Retry/rerun actions maintain reason code and actor email for incident review.

## 7. Constraints

- `submissions` is the only public source for gallery/share and slideshow pipelines.
- `tryon_jobs` remains operational queue state and must not be read for public rendering.
- Worker failures are surfaced as queue status in queue APIs and recovery views.
- Failed jobs are excluded from active queue totals and handled in failed-job workflows.
