# MongoDB Atlas — operational foundation

**Purpose**: Stable Atlas setup, connection tuning, and indexes aligned with this app’s query patterns.

See also: [MONGODB_CONVENTIONS.md](./MONGODB_CONVENTIONS.md) (ID semantics in URLs vs UUIDs).

---

## 1. Atlas project checklist

1. **Cluster**: M10+ for production if you expect sustained traffic; M0 is fine for early QA.
2. **Database user**: Least privilege — user scoped to the Camera database only; strong password stored in secrets (Vercel env, not git).
3. **Network Access**:
   - Vercel: allow **`0.0.0.0/0`** only if you accept IP allowlist trade-offs, or use [Atlas Private Endpoint / VPC](https://www.mongodb.com/docs/atlas/security-vpc-peering/) when requirements tighten.
   - Restrict to known office IPs during development when possible.
4. **Connection string**:
   - Use **`mongodb+srv://`** from Atlas UI.
   - Include **`retryWrites=true&w=majority`** (driver also sets `retryWrites` / `retryReads` in code).
5. **Env vars** (Camera app):
   - `MONGODB_URI`
   - `MONGODB_DB` (e.g. `camera`)
   - Optional: `MONGODB_MAX_POOL_SIZE` (default `10`), `MONGODB_MIN_POOL_SIZE` (default `0` for serverless-friendly cold starts; increase on a dedicated Node host if you want a warm pool).

---

## 2. Indexes (required for a solid foundation)

Heavy paths:

- **Slideshow playlist**: `submissions` filtered by `eventId` / `eventIds`, `isArchived`, sorted by `playCount` + `createdAt`.
- **User gallery**: `submissions` by `userId` + `createdAt`.
- **Admin lists**: partners, events, frames, logos by `isActive` + `createdAt`.
- **Lookups**: `slideshowId`, `frameId`, `partnerId`, `eventId` (UUID).

Apply indexes **once per environment** (and after major schema changes):

```bash
npm run db:ensure-indexes
```

Requires `MONGODB_URI` and `MONGODB_DB` in `.env` / `.env.local` (or exported). See `.env.example`.

Implementation: `lib/db/ensure-indexes.ts` (definitions) and `scripts/run-ensure-indexes.ts` (runner).

**If a unique index fails**: duplicate values exist for that field. Deduplicate or fix documents in Atlas / Compass, then re-run.

---

## 3. Data shape — `eventIds` on new submissions

New `POST /api/submissions` writes:

- `eventId` — event UUID (legacy singular field, still used).
- `eventIds` — array containing the same UUID when `eventId` is present (empty array when not).

This keeps **slideshow** and **migration** paths aligned without a one-off DB migration for every row. Older rows can still be backfilled with `GET /api/migrate/submissions` (dev/staging only; gated in production).

---

## 4. Monitoring & backups

- Enable **Atlas backups** (snapshot schedule) on production tiers.
- Watch **metrics**: connections, opcounters, slow queries (Profiler / Performance Advisor).
- **Performance Advisor** often suggests extra indexes; compare with `ensure-indexes` before accepting duplicates.

---

## 5. Troubleshooting

### `querySrv ENOTFOUND` / `ENOTFOUND _mongodb._tcp.<cluster>.mongodb.net`

DNS could not resolve Atlas’s **SRV records** for `mongodb+srv://`. The hostname in `MONGODB_URI` does not exist (from the internet’s DNS) or your network blocks SRV lookups.

1. In **Atlas → Database → Connect → Drivers**, copy a **new** connection string and replace `MONGODB_URI` everywhere (local `.env`, Vercel, etc.).
2. Confirm the **cluster still exists** and the subdomain matches (typos or deleted clusters produce this exact error).
3. Try another network or disable VPN / ad-blocking DNS (some resolvers break SRV or `mongodb.net`).
4. Optional: use Atlas’s **standard connection string** (`mongodb://` with a host list) if your environment blocks SRV only (rare).

The admin UI shows an expanded hint when this error is detected (`lib/db/mongo-errors.ts`).

### Authentication / timeout

- **Authentication failed**: URL-encode special characters in the password; verify Database Access user and role on `MONGODB_DB`.
- **Server selection timed out**: **Network Access** must allow your IP (or `0.0.0.0/0` for serverless hosts if policy allows).

---

## 6. Operational commands

| Task | Command |
|------|---------|
| Verify `MONGODB_URI` + DNS (reads `.env` / `.env.local`) | `npm run db:verify-uri` |
| Ensure indexes | `npm run db:ensure-indexes` |
| Typecheck | `npm run type-check` |

---

**Maintenance**: When you add a new high-volume query (new `$match` / `sort`), update `lib/db/ensure-indexes.ts` and re-run `db:ensure-indexes` in each environment.
