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
