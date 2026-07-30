# messmass + fanmass integration

**Version**: 2.18.0
**Last Updated**: 2026-07-30

Camera sits between two other apps in the SEYU fan-engagement stack: **messmass**
(event reporting/partner management, the master for organisations/partners/events)
and **fanmass** (image analytics — brand/sponsor/fan recognition on captured
photos). Both integrations are server-to-server, authenticated by a shared
secret, and live entirely under `app/api/internal/**`. Neither messmass nor
fanmass has any other way into Camera's data — no shared database access, no
session reuse.

```text
messmass  --(provision org/partner/event)-->  camera
camera    <--(poll: events, then media)---    fanmass
```

Camera never calls messmass or fanmass outbound; it only serves authenticated
requests from them. Rate limits are enforced per route (§4) but callers are not
end users, so 429s should read as "a caller is misbehaving," not "a user hit a
public limit."

## 1. messmass → camera: provisioning (messmass is master)

messmass is the source of truth for organisations, partners, and events.
When an event is created in messmass, it calls these endpoints (fire-and-forget,
inside Next.js `after()` on the messmass side — provisioning failure never
blocks messmass's own event creation) to create or link the mirror records in
Camera.

**Auth**: `assertInternalMessmassSecret()` ([lib/messmass/internal.ts](../lib/messmass/internal.ts)) —
header `x-messmass-secret: <secret>` or `Authorization: Bearer <secret>`,
compared against `CAMERA_MESSMASS_INTERNAL_SECRET`. 403 if the env var is unset
or the secret doesn't match.

**Identity model** ([lib/messmass/provision.ts](../lib/messmass/provision.ts)):
hybrid link — by messmass id if provided, else by case-insensitive name match,
else create new. Linked/created records are stamped `source: 'messmass'`.

### `POST /api/internal/messmass/organizations`
Body: `{ name, messmassOrganizationId? }`
Response: `{ organization: { organizationId, name, created, linked } }`

### `GET /api/internal/messmass/partners?name=&messmassPartnerId=`
Lookup for the linker UI on the messmass side. Returns up to 200 matches.

### `POST /api/internal/messmass/partners`
Body: `{ name, messmassPartnerId?, organizationId?, logoUrl? }`
Response: `{ partner: { partnerId, name, created, linked } }`

### `POST /api/internal/messmass/events`
Body: `{ messmassEventId, eventName, eventDate?, messmassPartnerId? | partnerId? }`
Idempotent on `messmassEventId` (unique+sparse index, see §5) — a second call
with the same id returns the existing event rather than creating a duplicate.
Requires the partner to already exist (404 `camera partner (provision the
partner first)` otherwise) — provision the org, then the partner, then the
event, in that order.
Response: `{ event: { eventId, mongoId, partnerId, created } }`. `mongoId` is
the Mongo `_id` used in capture URLs (`/capture/[eventId]` where `[eventId]`
is actually `mongoId` — see the `_id` vs UUID split in
[ARCHITECTURE.md §7](../ARCHITECTURE.md)).

Provisioned events inherit the partner's default design (`brandColor`,
`frames`, `logos`, …) via `inheritPartnerDefaults()`
([lib/db/events.ts](../lib/db/events.ts)) — still editable afterward in Camera
through the `*Overridden` flags.

### Cross-reference fields stamped on Camera records
- `organizations.messmassOrganizationId`
- `partners.messmassPartnerId`
- `events.messmassEventId` (unique, sparse — one Camera event per messmass event)

## 2. fanmass → camera: read-only pull

fanmass has no push access — it polls. On a schedule (`CAMERA_POLL_MINUTES`,
default 15 minutes on the fanmass side), fanmass lists active events, then
pulls new photos per event using a stored cursor.

**Auth**: `assertInternalFanmassSecret()` ([lib/fanmass/internal.ts](../lib/fanmass/internal.ts)) —
same header pattern as messmass (`x-fanmass-secret` or Bearer), compared
against `CAMERA_FANMASS_INTERNAL_SECRET`. This is a **different secret** from
the messmass one — do not conflate them.

### `GET /api/internal/fanmass/events?all=true`
Lists partner events (active only unless `?all=true`), max 500, sorted by
`eventDate` then `createdAt` descending.
Response: `{ events: [{ eventId, name, partnerId, partnerName, messmassEventId,
isActive, eventDate }] }`. `messmassEventId` falls back to `eventId` for
events created directly in Camera (no messmass link); events provisioned by
messmass (§1) carry a real `messmassEventId`.

### `GET /api/internal/fanmass/events/{eventId}/media?since=<ISO>&limit=<n>`
Incremental photo feed for one event, oldest first, so fanmass can advance a
cursor and only re-pull new images. Matches on `{eventId}` or `{eventIds:
eventId}` (Camera's legacy single-event / current multi-event submission
linkage). Returns only **original** fan photos — `submissionKind !== 'tryon_result'`
and `originalImageUrl` present — never the frame-composited final image or
try-on results, because fanmass measures brand exposure on the fan as
photographed, not on the branded output. `limit` defaults to 200, capped at 500.
Response: `{ eventId, media: [{ captureId, url, createdAt }] }`.

`url` is a public imgbb (`i.ibb.co`) link, fetched by fanmass **without** the
shared secret — deliberate, so the secret is never exposed to a third-party
host. Do not "fix" this by trying to authenticate the imgbb fetch.

## 3. What Camera does NOT do

- Camera does not call messmass or fanmass. Both integrations are inbound-only
  to Camera.
- Camera does not know about `launchmass` — no code, config, or data path
  connects them.
- Camera does not resolve the analytics fanmass produces; that data flows
  fanmass → messmass directly (`messmass.fanmass.analytics-summary.v1`,
  documented in the messmass repo), bypassing Camera entirely.

## 4. Rate limiting

All 5 routes above are rate-limited (added 2026-07-30; previously
unprotected) via the shared token-bucket limiter
([lib/api/rateLimiter.ts](../lib/api/rateLimiter.ts)):

- `RATE_LIMITS.INTERNAL_READ` — 120 requests/minute (the two `GET` routes)
- `RATE_LIMITS.INTERNAL_WRITE` — 60 requests/minute (the three `POST` routes)

These tiers exist to catch a misbehaving caller (retry storm, bad cron, buggy
poll loop) — not to police untrusted public traffic, since every caller here
is already secret-authenticated. A `429` on these routes means the *calling
app* (messmass or fanmass) is retrying too aggressively, not that a rate limit
config needs loosening for a legitimate one-off burst.

## 5. Data model / indexes

Added 2026-07-30 (previously these were full collection scans):

- `organizations.organizationId` — unique
- `organizations.messmassOrganizationId` — sparse
- `partners.messmassPartnerId` — sparse
- `events.messmassEventId` — **unique**, sparse (enforces "one Camera event per
  messmass event" at the DB level, not just in `provisionEvent()`'s
  findOne-then-insert app logic)

Defined in [lib/db/ensure-indexes.ts](../lib/db/ensure-indexes.ts), applied via
`npm run db:ensure-indexes`.

## 6. Required environment variables

See `.env.example` for the full list; the integration-specific ones:

| Var | Direction | Purpose |
|---|---|---|
| `CAMERA_MESSMASS_INTERNAL_SECRET` | messmass → camera | Auth for §1 routes |
| `CAMERA_FANMASS_INTERNAL_SECRET` | fanmass → camera | Auth for §2 routes |

Both routes return 403 if their respective secret is unset — there is no
"integration disabled, skip silently" mode on the Camera side (unlike
messmass, which treats an unconfigured `CAMERA_BASE_URL`/secret as
`camera_not_configured` and skips provisioning without erroring).

## 7. Testing locally

There is no dedicated e2e coverage for these routes yet (`tests/e2e/` has no
messmass/fanmass spec). To exercise them manually:

```bash
# 1. Point at a disposable local database — NEVER test against production Atlas
MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB=camera_dev_test npm run dev

# 2. Provision an organization (messmass side)
curl -X POST http://localhost:3000/api/internal/messmass/organizations \
  -H "x-messmass-secret: $CAMERA_MESSMASS_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Org"}'

# 3. Pull events (fanmass side)
curl http://localhost:3000/api/internal/fanmass/events \
  -H "x-fanmass-secret: $CAMERA_FANMASS_INTERNAL_SECRET"
```

## 8. See also

- [ARCHITECTURE.md §8](../ARCHITECTURE.md) — main collections
- [lib/db/schemas.ts](../lib/db/schemas.ts) — full record shapes
- messmass repo: `docs/guides/guides-tutorial-camera-app.md`,
  `docs/guides/guides-tutorial-fanmass.md`
- fanmass repo: `docs/messmass-integration-delivery-plan-2026-06-25.md`,
  `services/camera_client.py`, `services/camera_sync.py`
