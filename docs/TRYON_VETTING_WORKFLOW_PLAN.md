# Try-On Vetting Workflow Plan

## Scope

This plan covers Camera admin changes for try-on result vetting, resubmission history, rejection email handling, failed-job archival, and best-of selections.

The worker remains responsible for processing queue jobs and notifying Camera on completion or final failure. Camera remains the source of truth for admin-facing review state.

## Goals

- Move resubmitted originals out of active vetting into rejected archive.
- Show submission and resubmission history on result cards.
- Let admins choose another processing preset during resubmission.
- Support rejection email checkbox and editable rejection message.
- Archive final failed jobs under failed jobs instead of active vetting.
- Let admins mark approved or pending images as great without exposing provider internals.

## Data model

Admin-facing result state should track:

- review status
- archive bucket
- queue job id
- source submission id
- root and parent result ids
- resubmission attempt number
- selected processing profile id
- rejection message and email status
- failure code and failure time
- greatest-hit flag

Use event history records for:

- result creation
- approval
- manual rejection
- resubmit request
- archive movement
- queue job creation
- queue completion
- queue failure
- rejection email send
- great added or removed

Indexes should support review status, archive bucket, job id, source submission id, and root result id.

## Admin API behavior

### Resubmit result

The resubmit action should:

- validate that the source result can be resubmitted
- archive the original into rejected archive
- create history events for archival and resubmission
- enqueue a new job with source and attempt metadata
- return the new job id and archived original result id

### Result history

History lookup should resolve the root result id and return every attempt in chronological order with thumbnail, selected profile, job id, status, rejection reason, failure reason, and admin events.

### Manual reject

Manual rejection should:

- archive the result into rejected archive
- clear greatest-hit state if present
- persist rejection reason and optional editable email message
- send email only when the admin explicitly enables the email checkbox
- record rejection and optional email events

### Worker failure

Final worker failure should:

- authenticate through the internal shared secret
- upsert an admin-visible failed result
- archive the item into failed jobs
- record failure events
- keep the failed item out of active vetting

## Admin UI

Active vetting cards should show only the final user-visible image for the project type. Actions should include approve, reject, resubmit, and great where applicable.

Approved archive cards should support remove approval, reject, and great or remove great.

Rejected archive cards should support resubmission where allowed.

Failed job archive cards should support requeue where recovery is possible.

Greatest Hits should be a public event-level grid behind an optional event slug. The public page should only show images explicitly marked great and should link each image to its normal share page.

## Email templates

Use template variables for user name, share page URL, terms URL, and message body. Event-specific terms URLs should be editable on the event detail page and default to the configured platform policy URL.

## Safety notes

- Do not expose provider names, model IDs, API URLs, secrets, machine-local paths, or event-specific preset identifiers in public docs.
- Keep provider selection metadata abstract in Camera.
- Store real processing setup payloads in private worker configuration.
