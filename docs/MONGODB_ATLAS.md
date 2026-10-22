# MongoDB Atlas

**Last Updated**: 2026-10-22

Operational guide for Atlas setup, connection validation, and index maintenance.

## 1. Environment variables

Required:

- `MONGODB_URI`
- `MONGODB_DB`

Optional:

- `MONGODB_MAX_POOL_SIZE`
- `MONGODB_MIN_POOL_SIZE`
- `CAMERA_PIPELINE_DATABASE` (defaults to `fanmass_camera_pipeline`)

## Production stack decision and current state

**Target:** one Atlas cluster with separate logical databases: `camera`, `fanmass_camera_pipeline`, and `messmass`. The owner chose to keep the existing AtlasAdmin credential rather than create a scoped service user. Database names therefore organize data but do **not** enforce per-app permissions; AtlasAdmin can access all three databases and bypass application-level read-only boundaries.

**Audited current state (2026-10-22):** Camera and Fanmass use `camaraclastar.koyedpi.mongodb.net`. Messmass's current local production configuration points to `messmass-cluster.r96vlxs.mongodb.net`. A `messmass` database also exists on the Camera/Fanmass cluster, but a read-only content digest found differences in `drive_folder_links`, `notifications`, `projects`, and `v3_metrics_summary` compared with the current Messmass cluster. The MTK project's Camera event link is identical on both clusters, but the databases are not fully in parity. Do not change Messmass's production connection until the existing database has a recoverable backup, the four differences are reconciled, exact document/index parity is verified, and the cutover is performed with writes controlled. Vercel does not expose the production secret value through `env pull`; no claim is made that the deployed production variable was changed.

Camera reuses its Mongo client to read Fanmass's queue, result, and delivery records through `connectToDatabaseByName()`. Fanmass independently discovers eligible Camera submissions and writes its own pipeline collections. Camera writes only human review/correction evidence to the Camera submission; Fanmass reads that evidence and republishes the corrected per-photo result through the Messmass API. Messmass owns report aggregation. Exact result properties and IDs are documented in [FANMASS_RESULTS_IN_CAMERA.md](FANMASS_RESULTS_IN_CAMERA.md).

## 2. Commands

```bash
npm run db:verify-uri
npm run db:ensure-indexes
```

## 3. What `db:ensure-indexes` covers

The repo maintains indexes for the live query patterns in:

- partners
- events
- frames
- logos
- submissions
- slideshows
- slideshow layouts
- landing pages
- partner user access
- server-side web sessions

Index definitions live in:

- [lib/db/ensure-indexes.ts](../lib/db/ensure-indexes.ts)

## 4. Current operational hotspots

### Submissions

Heaviest read patterns:

- slideshow playlist sourcing by event UUID
- gallery views by user or partner
- admin submission inventory

### Events and partners

Common filters:

- partner-scoped event lists
- active/inactive filters
- search by cached names and descriptions

### Partner-scoped access

Newer operational reads:

- `partner_user_access` lookups by `userEmail`
- partner assignment lists by `partnerId`
- active assignment filters by `appKey`

## 5. Atlas operations

- use `mongodb+srv://`
- retain the owner-approved AtlasAdmin credential in the current deployment; a move to scoped service users requires a separate migration and owner approval
- store credentials only in environment variables
- enable backups on production-grade clusters
- monitor connection count, slow queries, and index suggestions
- verify restore readiness with a documented restore drill; enabled backups without a tested restore are not a verified recovery plan

## 6. DNS and connectivity troubleshooting

### `querySrv ENOTFOUND`

Usually means:

- bad Atlas hostname
- broken DNS resolution
- network/VPN resolver issue

Actions:

1. recopy the Atlas driver connection string
2. verify the cluster still exists
3. test from another network
4. run `npm run db:verify-uri`

### Authentication failure

Check:

- username/password correctness
- URL encoding in password
- database user permissions
- `MONGODB_DB` value

### Server selection timeout

Check:

- Atlas network access rules
- VPN/firewall restrictions
- cluster health

## 7. Important note on schema docs

Atlas operations should follow:

- [lib/db/schemas.ts](../lib/db/schemas.ts)
- actual route persistence code in `app/api/**/route.ts`

Do not assume the broad TypeScript schema alone describes the hot runtime write shape.

## 8. Related docs

- [docs/MONGODB_CONVENTIONS.md](MONGODB_CONVENTIONS.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
