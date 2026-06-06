# Try-On Low-Level Design

**Version**: 2.10.0
**Last Updated**: 2026-06-06

## 1. Objective and scope

This document is the detailed design specification for the Try-On moderation and recovery subsystem. It covers behavior implemented in production code as of the latest repository revision and is intended for both implementation reviews and operations handoff.

In scope:

- try-on queue contracts (`tryon_jobs`) and try-on result moderation (`submissions`)
- admin moderation decisions: approve, reject, service, great/remove_great
- retry/rerun recovery paths and publication re-application
- metadata/audit persistence and observability
- reporting inputs used by analytics
- human-in-the-loop (HIL) publication gate after rerun

Out of scope:

- local worker internals and training-time ML operations
- raw frame capture and public gallery rendering code paths
- partner/authorization onboarding workflows unrelated to try-on moderation

## 2. Runtime state machine

### 2.1 Try-on jobs (`tryon_jobs`)

Status values are defined in `lib/db/schemas.ts`:

- `queued`
- `claimed`
- `processing`
- `uploading_result`
- `notifying_camera`
- `retry_wait`
- `done`
- `failed`

Stage values are:

- `queued`
- `claimed`
- `downloading_input`
- `resolving_suit`
- `running_tryon`
- `uploading_result`
- `uploaded_result`
- `notifying_camera`
- `done`
- `failed`

### 2.2 Moderation review states (derived submissions)

Result submissions are tagged by:

- `submissionKind: 'tryon_result'`
- `reviewStatus: pending_review | approved | rejected`
- `tryOnModerationArchive` bucket: `approved`, `rejected`, `service`

Archive is considered active moderation queue when:

- `tryOnModerationArchive.archived !== true`

Archive bucket drives analytics and archive navigation.

## 3. Data contracts

### 3.1 Queue job request

`TryOnJob.request` includes:

- `leatherSuitId`
- `setupId` (optional explicit preset)
- `rerunOfJobId` (set when created by rerun path)

### 3.2 Result metadata

`Submission` result records use:

- `sourceJobId` and `sourceSubmissionId`
- `tryOnLeatherSuitId`
- `metadata.tryOnGreat`
- `metadata.tryOnService`
- `metadata.tryOnRawResultUrl`
- `metadata.tryOnSupersededByRerun` (set when rerun happens)
- `reviewStatus`, `isShareVisible`, `isSlideshowEligible`
- `tryOnModerationArchive`:
  - `archived`, `bucket`, `archivedAt`, `archivedBy`
  - `reason`, `supersededByJobId`, `supersededAt`

### 3.3 Audit event

`TryOnModerationEvent` captures immutable decision history with:

- `action`: `approve | reject | service | great | remove_great | rerun`
- state snapshots before/after
- actor email
- result id and source/job linkage
- optional notes and metadata

## 4. Architecture components

Core modules:

- `app/api/admin/tryon-results/route.ts`
- `app/admin/tryon-results/page.tsx`
- `components/admin/TryOnResultModerationTable.tsx`
- `components/admin/OldestVettingResultCard.tsx`
- `app/api/admin/tryon-jobs/[jobId]/*` recovery routes
- `lib/tryon/completion.ts`
- `lib/tryon/analytics.ts`
- `lib/tryon/moderation-audit.ts`
- `lib/db/schemas.ts`

## 5. Runtime flow

### 5.1 Completion ingestion

1. Worker posts completion URL via internal secret endpoint.
2. Camera resolves source submission and event context.
3. Derived result is created/updated as a `tryon_result` submission.
4. If event policy does not force auto-visibility, review is set to `pending_review` with:
   - `isShareVisible = false`
   - `isSlideshowEligible = false`
5. For admin-initiated reruns, completion always enforces pending review regardless of event policy.

### 5.2 HIL gate semantics

A result can be shared only after an admin decision action.

- `approve`, `great`, and `remove_great` (when marking approved) set `reviewStatus: approved` and archive bucket to `approved`.
- `reject` sets `reviewStatus: rejected` and bucket `rejected`.
- `service` sets `reviewStatus: rejected` and bucket `service`.

A key rule: reruns always re-enter moderation.

### 5.3 Rerun flow

When admin requests rerun from a result card or a queue action:

1. Validate target job is not in active processing statuses (`processing`, `claimed`, `uploading_result`).
2. Optional preset override (`setupId`) is validated as active setup.
3. Clone source job metadata to new `TryOnJob` with:
   - new `jobId`
   - new `requestHash`
   - status `queued`/`stage` `queued`
   - copied source context
4. Prior result is archived as `rejected` (`quality_rerun_superseded`) with:
   - `isShareVisible = false`
   - `isSlideshowEligible = false`
   - moderation archive metadata
5. New job is linked to source try-on state for publish repair and visibility tracking.
6. API response requires admin approval before user-facing publication.

### 5.4 Queue recovery flow

- `retry` (`/api/admin/tryon-jobs/{jobId}/retry`) is allowed for `failed` and `retry_wait`.
- `rerun` creates a new queued job and can also change preset.
- `reapply-result` replays an already completed job; it updates links and does not bypass moderation.

## 6. Contracts and APIs

### 6.1 Moderation

- `GET /api/admin/tryon-results`
  - query: `reviewStatus`, `archive`, `eventId`, `partnerId`, `suitId`, `offset`, `limit`
  - defaults to active pending queue with `offset=0`, `limit=24`.
- `POST /api/admin/tryon-results/{submissionId}/approve`
- `POST /api/admin/tryon-results/{submissionId}/reject`
- `POST /api/admin/tryon-results/{submissionId}/service`
- `POST /api/admin/tryon-results/{submissionId}/great`
- `POST /api/admin/tryon-results/{submissionId}/remove-great`

### 6.2 Queue recovery

- `GET /api/admin/tryon-jobs`
- `POST /api/admin/tryon-jobs/{jobId}/retry`
- `POST /api/admin/tryon-jobs/{jobId}/rerun`
- `POST /api/admin/tryon-jobs/{jobId}/reapply-result`

### 6.3 Analytics

- `GET /api/admin/tryon-analytics`
- `GET /api/admin/tryon-analytics/export?format=csv|json`

### 6.4 Completion endpoint

- internal callback validates `CAMERA_TRYON_INTERNAL_SECRET` and applies completion state.

## 7. UX and accessibility states

Admin surfaces use `ResponsiveDataView` cards/list with explicit action labels:

- Approve / Reject / Great / Remove Great / Service for moderation cards
- Submit Again in rerun flow
- Retry Job, Rerun Job, Resend to user from queue table
- Auto-refresh control with explicit sound toggle state

Accessibility requirements observed:

- buttons include `aria-label` for all action intents
- modals include titles and contextual content
- image actions support fallback text when missing

## 8. Observability and auditability

Per-decision audit records are appended by all moderation actions and rerun actions. Use:

- `reason` notes where provided by operator
- `actorEmail`, timestamps, previous/next state snapshots

Queue and moderation issues are surfaced through:

- standard API error payloads
- console logs on critical transitions (`retry`, `rerun`, `reapply`, reattempt recoveries)

## 9. Retries and timeouts

- worker-managed retry behavior is governed by job `retry_wait` and `processing.nextAttemptAt`.
- admin retry path resets attempt and heartbeat fields.
- provider timeout errors are tracked in analytics (`providerTimeouts`) and feed preset performance scoring.

## 10. Rollback and recovery

- Do **not** auto-approve rerun outputs.
- Failed jobs stay visible in failed jobs archive and are not counted as active queue work.
- `retry` can be used for transient failures.
- `rerun` is used when source/result quality or preset must change.
- `reapply-result` repairs publication links from completed jobs after DB reconciliation.

## 11. Pseudo-code reference

```ts
// Admin moderation decision
function decideResult(submissionId, action, actor):
  load result
  load source submission
  audit snapshot = snapshot(result)

  if action in ['approve','great','service','reject','remove_great']:
    compute next state
    append moderation event
    update submission fields
      reviewStatus
      share/slideshow flags
      archive bucket
      service/great metadata
    upsert source publication summary
    if action is approve or great:
      try send resubmission email (conditional by event policy)
    return success

// Rerun action
function rerunFromResultOrQueue(jobId, presetId):
  validate request
  clone prior job into new tryon job with new jobId + requestHash suffix
  set source and request fields
  if prior result exists -> archive with reason quality_rerun_superseded
  reset source submission try-on state to queued
  return queued new job details
```

## 12. Edge cases

- Anonymous placeholder emails (`anonymous@event`, `anonymous@event.com`) are treated as non-display names but preserved for audit/linkage.
- If setup list is temporarily empty, action UI degrades with disabled preset selector.
- Missing source/result assets show fallback preview and continue operation.
- Re-apply of non-done jobs is blocked.
- Rerun of active jobs (`processing|claimed|uploading_result`) is blocked.

## 13. Open dependencies

- Event-level terms URL and email templates configured on `Event` documents.
- Worker must emit valid `publicResultUrl` for completion.
- `tryon_setups` active presets are required for preset validation.
- Admin workspace uses global-admin authorization in these routes.
