# Try-On analytics and data operations

**Version**: 12.2.21  
**Last Updated**: 2026-07-04

## Scope

This document defines reporting contracts for moderation outcomes and queue behavior in the Try-On workflow.

The analytics data model is built from:

- archived moderation decisions in `submissions` (`submissionKind = 'tryon_result'`)
- current and historical queue outcomes in `tryon_jobs`

## 1) API surfaces

### `GET /api/admin/tryon-analytics`

Query parameters:

- `bucket` (optional): `approved | rejected | service | greatest`
- `eventId` (optional)
- `from` (optional ISO timestamp or date string)
- `to` (optional ISO timestamp or date string)

Response contract:

- `totals`: aggregate by approved/rejected/service/greatest/supersededRerun/total
- `funnel`: pipeline counts (`submitted`, `queued`, `processing`, `generated`, `approved`, `declined`, `service`, `supersededRerun`, `failed`)
- `byPreset`: decisions grouped by setup id/name
- `byGarment`: decisions grouped by garment id/name
- `byEvent`: decisions grouped by event
- `presetPerformance`: preset outcome throughput, including done/failed/retry waits/provider timeouts
- `hourlyOutcomes`: time-bucketed approved/rejected/service/failed totals
- `scannedResultCount`: number of moderation-result docs used to render the page

### `GET /api/admin/tryon-analytics/export`

Supported query:

- `format=csv|json` (default `csv`)
- `bucket`, `eventId`, `from`, `to` as above
- `section=all|hourly|preset|garment|event|preset_performance|funnel` (default `all`)
- `section=preset-performance` is accepted as an alias for `preset_performance`

Invalid `section` values return HTTP 400. CSV filenames include the section slug.

CSV format defaults to all sections unless `section` is set. JSON responses also return a section-specific attachment filename.

## 2) Dashboard behavior (`/admin/tryon/analytics`)

- `/admin/tryon/analytics` shows:
  - Filter form for bucket, event, and date range
  - Totals by approved/rejected/service/superseded rerun
  - Section-specific export cards with CSV and JSON download actions
  - Pipeline funnel chart
  - grouped hourly outcome chart
  - tables by preset, garment, event
  - preset performance table with approval/retry/timeout diagnostics
  - per-section CSV/JSON exports

### Hourly chart behavior

- The chart is a grouped bar view with one group per hour.
- Group bars are `Approved`, `Declined`, `Service`, and `Failed`.
- Day labels appear only at day boundaries to reduce visual noise.
- Segment visibility can be toggled by clicking segment buttons (`Approved`, `Declined`, `Service`, `Failed`).
- The segment controls are true hide/show toggles and affect all chart bars.
- “Selected total” is updated for current visibility state.

## 3) Operational interpretation

- `approved/rejected/service` come from moderation archive buckets.
- `failed` is derived from failed job records (`tryon_jobs.status = failed`) folded into the same hourly axis.
- `greatest` in analytics is derived (`approved` + `metadata.tryOnGreat`).
- For trend monitoring, prefer bucket-agnostic totals in the table view and day-level rollups over narrow hourly slices.

## 4) Data hygiene and identity correction

- Use the unrecoverable identity report when guest/placeholder identity remains visible:

```bash
npm run tryon:report-unrecoverable-identities
npm run tryon:report-unrecoverable-identities:csv
```

- Run recurring integrity audits:

```bash
npm run tryon:audit-data-integrity
npm run tryon:audit-data-integrity:strict
```

The strict variant exits non-zero on unresolved garment references, identity gaps, missing done result links, or moderation consistency issues.

- Use source repair workflows when event analytics show wrong garment labels or unknown source identity:
  - `pnpm tryon:backfill-identity`
  - `pnpm tryon:backfill-identity:apply`

## 5) Failure modes and recovery

- Provider/runtime timeouts increase `providerTimeouts` in preset performance.
- Repeated failures that are not transient should be moved to rerun/recovery and then rerun moderation from queue/failing-job paths.
- A completed result that appears in unexpected buckets should be checked in audit history before rerun; do not modify history fields directly.

## 6) Database Aggregation Performance Design

To ensure fast page load times and avoid blocking the Next.js single-threaded event loop, all analytics aggregation is offloaded directly to the MongoDB engine using `$facet` aggregation pipelines.

### Cross-Event Analytics (`collectCrossEventUserAnalytics`)
App-wide analytics aggregates all submissions (`isArchived !== true`) into:
1. `allUniqueEmails`: A `$group` of all emails to get a total unique email count.
2. `cleanCustomers`: Filters out internal domains and developer emails (`anonymous@event`, `moldovancsaba@gmail.com`, `david.bozsik@seyuselfies.com`, `mate.pecsi@seyuselfies.com`, `m@m.m`, and `seyuselfies.com` domains), groups by email to combine event participations (via `$push` and `$reduce` / `$setUnion` to flatten unique events), and counts submissions.

### Event-Specific Engagement (`collectEventSpecificStats`)
Event-level analytics counts total submissions, AI try-ons, original captures, unique emails, and clean customer emails for a specific event ID. It utilizes a single `$facet` pipeline to compute all counts concurrently in the database:
- `counts`: Groups matching submissions to count total, try-on, and original captures.
- `uniqueEmails`: Groups and counts all non-empty emails.
- `cleanCustomerEmails`: Groups and counts emails matching the clean customer filter criteria.
