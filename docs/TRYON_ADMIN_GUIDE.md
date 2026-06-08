# Try-On Admin Guide

**Version**: 2.11.0
**Last Updated**: 2026-06-08

This guide covers day-to-day operator workflows for the Try-On app surfaces.

## 1. Where operators start

Open `/admin/tryon` for the workspace landing page.

From here you can open:

- `/admin/tryon/queue` for live jobs
- `/admin/tryon/suits` for garment catalog
- `/admin/tryon/vetting` for moderation + archive views
- `/admin/tryon/analytics` for reporting

## 2. Vetting workflow

Vetting endpoint: `/admin/tryon-results`

Default behavior:

- shows pending images in oldest-first order (oldest at top)
- auto-refresh is enabled when no archive/search filter is active
- queue cards and table rows are both actionable

### 2.1 Oldest waiting image

When there are items in the active moderation queue, the oldest waiting item is promoted to a featured card above all list cards.

Action options on this card:

- Approve
- Reject
- Great / Remove Great
- Service

All actions immediately update queue visibility:

- approved/rejected/service results move to archived buckets
- great affects `metadata.tryOnGreat`

### 2.2 Card / row actions

For pending and archived rows, actions are:

- **Approve**
- **Reject**
- **Great**
- **Service**

For approved rows, "Great" can be removed via **Remove Great**.

### 2.3 Preset selection and resubmission

Both the featured card and each row expose:

- current preset label
- preset detail (source/profile)
- dropdown of active presets
- **Submit again** action

Submitting again:

- validates preset choice
- creates a new queued job
- archives the current result as rejected (`quality_rerun_superseded`)
- keeps user publication state hidden until HIL approval completes

### 2.4 Archive buckets

Vetting supports three explicit result classes in `?archive=`:

- `approved` → HIL-approved results
- `rejected` → declined results
- `service` → service-only queue for operations review
- `greatest` → alias for approved + great flag

## 3. Failed jobs view

`/admin/tryon-results?failed=1`

Failed jobs use job-level recovery:

- Retry Job (requeue failed/retry-wait)
- Rerun Job (create a new job, optional preset)
- Resend to user (for done jobs with public result)

Important:

- failed jobs are not treated as active queue work
- they remain available for remediation workflows

## 4. Service photos

Use **Service** when a result should be kept separate from approval decisions but still retained for operations, merchandising, or internal review.

Service photos are:

- archived as `service`
- hidden from public visibility and slideshows by default
- still searchable and exportable in analytics

## 5. Archive navigation and filters

Use query parameters from `/admin/tryon-results`:

- `archive=approved|rejected|service|greatest`
- `failed=1`
- `reviewStatus=pending_review|approved|rejected`
- `search=...`
- `eventId=...`

The search bar supports:

- user name/email
- event id/name
- partner
- garment id
- source/job id

## 6. Audio and refresh behavior

- enable/disable sound for new-image notifications
- 15s polling in auto-refresh mode

## 7. Queue diagnostics

`/admin/tryon/queue` and `/admin/tryon-results?failed=1` provide:

- active statuses and worker health
- failure hints (retry vs rerun semantics)
- original source preview and preset info

## 8. Human-in-loop rule

Admins must explicitly approve before sending generated results to users.

Auto-publication is disabled for reruns even if event-level auto-vetting is not enabled in event settings.

## 9. Analytics for operators

Open `/admin/tryon/analytics` to review:

- approved/rejected/service/great totals
- by preset, by garment, by event
- preset performance metrics
- hourly outcomes
- hourly chart: Approved/Declined/Service/Failed with toggleable segments
- exports in CSV or JSON

## 10. Email behavior

After moderation and/or rerun approval, Camera resolves event policy and will dispatch:

- standard after-save email if configured
- related photos email if configured
- approved rerun email (third mode) if enabled on event

Template values available: `{name}`, `{event}`, `{link}`, `{terms}`.

## 11. Error and escalation playbook

- missing source/asset in a row: action remains possible; preview marks failure state
- repeated stale lease or retry storms: use queue retry paths and inspect worker heartbeat
- malformed presets: use a different active preset and rerun
- unknown garment IDs in old records: use admin cleanup/repair utilities from `docs/TRYON_OPERATIONS.md`
