# Try-On Operations

## Queue status contract

The active queue count is only the work that can still require worker attention.

Active queue statuses:

- `queued`
- `claimed`
- `processing`
- `uploading_result`
- `retry_wait`

Historical or exception statuses are not part of the active queue total:

- `done`
- `failed`

`failed` jobs remain operationally important, but they must be presented as failed/recovery work, not as queued work.

## Dashboard rule

The Try-On dashboard `Queue Status` card must use the active queue total from `lib/tryon/queue-status.ts`.

Do not calculate queue health from the number of loaded table rows. Queue stats must use database counts.

## Worker health

Worker health is derived from active worker-owned jobs:

- `claimed`
- `processing`
- `uploading_result`

Health states:

- `Worker Online`: at least one worker-owned job has a fresh heartbeat/lease.
- `Worker Stale`: at least one worker-owned job has an expired lease or stale heartbeat.
- `Worker Offline`: active jobs are waiting, but no worker currently owns a job.
- `Worker Idle`: no active queue work exists.

The admin-only API `GET /api/admin/tryon-worker-health` returns the same summary contract used by the Try-On dashboard.

## Failure classification

Worker failures must use stable error codes so operators can distinguish local issues from provider issues.

Retryable provider/runtime errors:

- `provider_timeout`
- `provider_rate_limited`
- `result_upload_failed`
- `transient_network_error`

Non-retryable validation errors:

- `invalid_suit`
- `invalid_source_image`
- `processing_failed`

Retry scheduling must only retry retryable classifications. Non-retryable classifications move directly to `failed`.

## Analytics buckets

Try-on analytics are based on archived moderation decisions:

- `approved`
- `rejected`
- `service`
- `greatest` as an approved result with `metadata.tryOnGreat`

The admin analytics page is `/admin/tryon/analytics`.

The admin-only API is `GET /api/admin/tryon-analytics`.

Preset performance combines job execution data with moderation outcomes:

- jobs
- done
- failed
- retry wait
- provider timeouts
- approved/rejected/service/great outcomes
- approval rate over decided outcomes
