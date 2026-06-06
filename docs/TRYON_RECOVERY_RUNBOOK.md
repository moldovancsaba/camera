# Try-On recovery runbook

This runbook is for live-event recovery when try-on jobs are stuck, failed, waiting for retry, or need publication repair.

## Decision tree

1. Worker looks offline or stale.

Check `/admin/tryon` worker health. If active jobs exist but no fresh heartbeat is present, restart the local worker first. Do not rerun jobs until the worker is healthy unless the original job settings are wrong.

2. Job is `failed`.

Use `Retry job` when the failure was transient, for example provider timeout, rate limit, upload failure, or worker/network interruption. Retry resets the same job to `queued` with the same garment and preset.

Use `Rerun job` when the image quality is poor, the preset needs changing, or the operator wants a new output. Rerun creates a new queued job. The new result must go through human vetting before it is sent to the user.

3. Job is `retry_wait`.

Use `Retry job` to bypass the scheduled wait and put the job back into `queued`. This is safe for repeated clicks: if the job is already queued, the endpoint returns `already_queued`.

4. Job is `done` but the result is missing from vetting/share state.

Use `Resend to user` from the queue table. Despite the legacy button label, this re-applies the completed job result into Camera result/publication state. If the result is pending review, it remains pending review and must still be approved by a human before publication.

5. Result is pending vetting.

Use Approve, Reject, Great, or Service from the vetting page. Approval is the only action that makes a result share-visible. Rerun results are never auto-approved.

## Safe action summary

- `Retry job`: same job, same settings, returns failed/retry-wait/queued job to queued.
- `Rerun job`: new job, selected preset, creates a new result that requires vetting.
- `Resend to user` / reapply result: repairs result/publication links from a done job and preserves HITL approval rules.
- `Approve`: publishes to the user/share page according to event slideshow policy.
- `Reject` / `Service`: keeps result private and archives into the selected analytics bucket.

## Observability

Recovery endpoints log actor email, target job id, action type, and outcome with the `tryon:recovery` prefix. Moderation and rerun actions append records to `tryon_moderation_events`.

## Rollback

If a recovery action was wrong, do not delete audit history. Use the moderation archive buckets to reclassify the result, or rerun the original job with the intended preset. Internal schema/API names such as `leatherSuitId` remain compatibility contracts.
