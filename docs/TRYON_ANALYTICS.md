# Try-On analytics and data integrity operations

## Admin exports

Global admins can export the current analytics filter from `/admin/tryon/analytics`.

- `Export CSV` downloads hourly outcomes, preset performance, garment totals, and event totals in one CSV file with section headers.
- `Export JSON` returns the same analytics contract used by the admin UI.
- Filters supported by both formats: `bucket`, `eventId`, `from`, and `to`.

## Identity cleanup

Use the unrecoverable identity report when try-on result submissions still show `Guest` or placeholder email values after the source backfill.

```bash
pnpm tryon:report-unrecoverable-identities
pnpm tryon:report-unrecoverable-identities:csv
```

Manual corrections are dry-run by default and require a JSON array:

```json
[
  {
    "resultSubmissionId": "000000000000000000000000",
    "userName": "Real Name",
    "userEmail": "person@example.com",
    "reason": "Recovered from onsite registration export"
  }
]
```

Apply corrections only after reviewing the dry-run output:

```bash
pnpm tryon:apply-identity-corrections -- --file=corrections.json
pnpm tryon:apply-identity-corrections:apply -- --file=corrections.json
```

## Data integrity audit

Run the recurring Atlas audit before and after try-on data migrations:

```bash
pnpm tryon:audit-data-integrity
pnpm tryon:audit-data-integrity:strict
```

The strict variant exits non-zero when it finds unknown garment IDs, source-recoverable identity gaps, done jobs without result submissions, or moderation/publication inconsistencies.
