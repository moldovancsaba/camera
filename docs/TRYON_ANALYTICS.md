# Try-On analytics and data operations

**Version**: 2.10.0  
**Last Updated**: 2026-06-06

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

- `totals`: aggregate by approved/rejected/service/greatest/total
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

CSV format contains the same logical sections used by the UI.

## 2) Dashboard behavior (`/admin/tryon/analytics`)

- `/admin/tryon/analytics` shows:
  - Totals by approved/rejected/service/great
  - stacked hourly outcome chart
  - tables by preset, garment, event
  - preset performance table with approval/retry/timeout diagnostics
  - CSV/JSON exports

### Hourly chart behavior

- The chart is a stacked bar view with one bar per hour.
- Stacked segments are `Approved`, `Declined`, `Service`, and `Failed`.
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
pnpm tryon:report-unrecoverable-identities
pnpm tryon:report-unrecoverable-identities:csv
```

- Run recurring integrity audits:

```bash
pnpm tryon:audit-data-integrity
pnpm tryon:audit-data-integrity:strict
```

The strict variant exits non-zero on unresolved garment references, identity gaps, missing done result links, or moderation consistency issues.

- Use source repair workflows when event analytics show wrong garment labels or unknown source identity:
  - `pnpm tryon:backfill-identity`
  - `pnpm tryon:backfill-identity:apply`

## 5) Failure modes and recovery

- Provider/runtime timeouts increase `providerTimeouts` in preset performance.
- Repeated failures that are not transient should be moved to rerun/recovery and then rerun moderation from queue/failing-job paths.
- A completed result that appears in unexpected buckets should be checked in audit history before rerun; do not modify history fields directly.
