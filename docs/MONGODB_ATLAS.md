# MongoDB Atlas

**Last Updated**: 2026-05-23

Operational guide for Atlas setup, connection validation, and index maintenance.

## 1. Environment variables

Required:

- `MONGODB_URI`
- `MONGODB_DB`

Optional:

- `MONGODB_MAX_POOL_SIZE`
- `MONGODB_MIN_POOL_SIZE`

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

## 5. Atlas setup recommendations

- use `mongodb+srv://`
- keep the database user scoped to the Camera database where possible
- store credentials only in environment variables
- enable backups on production-grade clusters
- monitor connection count, slow queries, and index suggestions

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
