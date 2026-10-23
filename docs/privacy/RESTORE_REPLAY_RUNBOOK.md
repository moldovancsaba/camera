# Isolated Camera restore replay

**Purpose:** apply the SSO erasure tombstone feed to an isolated Camera database restore before anyone can read the restored data. This is a Camera-only replay step, not proof that backups are configured or that the entire cross-product restore is releasable.

## Safety boundary

- The replay deployment must use `VERCEL_ENV=preview`, `CAMERA_PRIVACY_RESTORE_MODE=isolated`, and a separate `MONGODB_DB` whose name contains `restore` or `recovery`.
- The readiness endpoint is disabled on Vercel production and returns only the database name and operator-supplied restore instance ID. It never returns a Mongo URI or credential.
- The runner defaults to dry-run. Apply requires both `--confirm-db` and `--confirm-instance` to match the readiness response exactly.
- Apply sends only exact case/photo/submission references from SSO to Camera's existing case-bound erasure intake. Camera fences the restored row, scrubs its database fields, and runs the existing provider deletion workers serially, one photo at a time. Provider configuration must be scoped and verified before apply; a media failure keeps replay blocked.
- The runner never authorizes traffic release. Fanmass results, Messmass results and projections, backup manifest integrity, non-photo stores, and operator approval remain separate release gates. Whole-cluster/SSO database restore requires an off-database tombstone source; the SSO feed cannot protect a restore that rewinds SSO itself.
- Do not use a production database target or run this against a live Camera deployment.

## Isolated deployment configuration

On a separate Vercel Preview project/deployment, restore the Camera database into a database name such as `camera_restore_20261023`. Set these non-secret controls there:

```dotenv
CAMERA_PRIVACY_RESTORE_MODE=isolated
CAMERA_PRIVACY_RESTORE_DATABASE_NAME=camera_restore_20261023
CAMERA_PRIVACY_RESTORE_INSTANCE_ID=restore-run-20261023-a1b2c3d4
CAMERA_PRIVACY_RESTORE_SECRET=<new random secret, not a production secret>
```

The isolated deployment also needs its restored `MONGODB_URI`/`MONGODB_DB`, Camera's media erasure key, its resolver secret, `CRON_SECRET`, provider credentials required by the restored records, and the SSO resolver client ID/secret. Configure values through the platform secret store; do not put them in a command file, issue, or log. SSO must have a finite `SSO_PRIVACY_BACKUP_RETENTION_DAYS` value and the resolver client must have `sso:privacy.resolve`.

## Preflight and dry-run

Load the isolated operator environment locally, then set `CAMERA_RESTORE_BASE_URL` to the isolated preview origin. Check that the intended database and restore instance are returned before any write:

```sh
npm run privacy:restore-replay -- --dry-run
```

The command verifies isolated readiness, SSO service authentication, finite tombstone retention, feed shape, and every cursor page. It prints only the isolated database/instance and tombstone count. No writes occur.

## Apply

Only after reviewing the dry-run response and confirming the isolated preview deployment, use the exact readiness values:

```sh
npm run privacy:restore-replay -- --apply \
  --confirm-db camera_restore_20261023 \
  --confirm-instance restore-run-20261023-a1b2c3d4
```

The command reads the feed page by page and processes each photo sequentially. Each photo must reach Camera `media_erased`; `not_found`, identity/reference mismatch, provider uncertainty, failed retries, invalid cursors, or timeout stops the run. Repeat is safe: the Camera intake and workers use the case/photo tombstone as their idempotency key.

## Result and release decision

Successful output is `camera_replay_complete` with a count of feed entries and completed Camera erasures. `releaseAuthorized` is always `false`. Preserve the sanitized command output with the restore evidence. An operator must separately replay and verify Fanmass and Messmass tombstones, validate the backup manifest and provider coverage, rebuild derived reports, and authorize release. Any unknown result means the restore remains isolated.

## Recovery

If a command stops, retain the restore database in isolation and inspect fixed error codes and the provider worker's URL-free receipts. Correct the environment/provider cause, then rerun the same command and confirmations; do not restore again over a partially replayed database, clear tombstones, or manually reinsert source rows. The next run will resume using the existing exact-photo receipts. If readiness fails, correct the preview deployment's mode/database/instance configuration before trying again.

## Verification

The route's readiness contract is covered by `lib/privacy/restore-replay-contract.test.ts`. `npm run release:check` runs unit tests, type-check, lint, production guards, and build. This runbook does not assert that an actual provider backup, SSO secret, Vercel preview deployment, or restore drill has been configured or tested.
