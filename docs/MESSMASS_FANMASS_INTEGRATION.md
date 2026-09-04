# messmass + fanmass integration

**Version**: 12.2.21
**Last Updated**: 2026-09-03
_Verified @ a87d78f_

Camera sits between two other apps in the SEYU fan-engagement stack: **messmass**
(event reporting/partner management, the master for organisations/partners/events)
and **fanmass** (image analytics — brand/sponsor/fan recognition on captured
photos). Both integrations are server-to-server, authenticated by a shared
secret, and live entirely under `app/api/internal/**`. Neither messmass nor
fanmass has any other way into Camera's data — no shared database access, no
session reuse.

```text
messmass  --(provision org/partner/event)-->  camera
messmass  --(send email)-------------------->  camera
camera    <--(poll: events, then media)---    fanmass
```

Camera is mostly inbound but DOES call messmass outbound in two cases (see §4): it
pushes partners it creates natively to `POST {MESSMASS_BASE_URL}/api/integrations/camera/partners`
(`pushPartnerToMessmass`, [lib/messmassClient.ts:64-87](../lib/messmassClient.ts),
called from [app/api/partners/route.ts:136](../app/api/partners/route.ts) and
[app/api/partners/[partnerId]/route.ts:135](../app/api/partners/%5BpartnerId%5D/route.ts))
and mints a cross-app session via `POST .../api/integrations/camera/sso-session`
(`pushSsoSessionToMessmass`, [lib/messmassClient.ts:36-62](../lib/messmassClient.ts),
called from [app/api/auth/callback/route.ts:44](../app/api/auth/callback/route.ts)).
It otherwise serves authenticated requests from them, including the reverse
sso-session mint documented at the end of §1. Rate limits are enforced per
route (§5) but callers are not end users, so 429s should read as "a caller is
misbehaving," not "a user hit a public limit."

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
Idempotent on `messmassEventId` (unique+sparse index, see §6) — a second call
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

### `POST /api/internal/messmass/sso-session`
Reverse-direction sibling of `pushSsoSessionToMessmass` (§4): messmass forwards
the SSO access/refresh tokens a user just used to log into messmass, and this
route mints a **real Camera session** for that same user
([app/api/internal/messmass/sso-session/route.ts](../app/api/internal/messmass/sso-session/route.ts)),
so logging into either app produces a working session on both (requires
`SESSION_COOKIE_DOMAIN=.messmass.com`). The shared secret alone does not
authorize this — the route independently re-verifies the forwarded access
token against SSO itself (`getUserInfo` + `getAppPermission`, using Camera's
own `SSO_CLIENT_ID`) before minting anything, so a leaked secret only lets a
caller mint sessions for users who currently hold a live SSO token, not
impersonate anyone (route:17-25).
Body: `{ accessToken, refreshToken?, expiresIn? }`.
Response: `{ success: true, appRole } | { success: false, error: 'no_access' }` (403).

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

## 3. Shared email service (messmass/fanmass → camera)

Camera is the only app in the SEYU stack with a Resend integration and a
verified sending domain. Rather than messmass (or fanmass, if it ever needs
email) keeping a separate Resend account/dependency/error-handling path, they
call this endpoint — added 2026-07-30 as part of a cross-app SSO + email
unification effort (plan doc kept outside the individual app repos).

**Auth**: `assertInternalMessmassSecret()` OR `assertInternalFanmassSecret()`
([app/api/internal/email/send/route.ts](../app/api/internal/email/send/route.ts)) —
either caller's existing secret works; this is the same trust boundary as §1/§2,
not a new one.

### `POST /api/internal/email/send`
Body: `{ to, subject, html, text?, fromName?, fromLocalPart? }` — `to`,
`subject`, `html` required. `fromName` sets the display name (defaults to the
calling app's name); `fromLocalPart` sets the address local-part (defaults to
`notifications`). The **domain is always Camera's own verified Resend
domain** (parsed from `CAMERA_EMAIL_FROM`) — callers can't send from an
arbitrary unverified address, only customize the display name and local-part
under Camera's domain.
Response: `{ sent: true, messageId } | { sent: false, error }` — always HTTP
200 for a well-formed request; `sent: false` means Resend rejected the send or
isn't configured. Treat as a soft failure (log it), not something to retry
forever.

Shared send primitive: [lib/email/send.ts](../lib/email/send.ts) — also used
internally by Camera's own submission-result email
([lib/email/submission-notification.ts](../lib/email/submission-notification.ts)),
so the actual "call Resend, interpret the response" logic exists exactly once
in Camera, not duplicated between the internal API and Camera's own feature.

## 4. What Camera does NOT do

- Camera is inbound for the §1-§3 routes, but see §4: camera → messmass partner
  push and sso-session mint are outbound (lib/messmassClient.ts), and camera is
  the fleet's email transport (POST /api/internal/email/send). Not inbound-only.
- Camera does not know about `launchmass` — no code, config, or data path
  connects them.
- Camera does not resolve the analytics fanmass produces; that data flows
  fanmass → messmass directly (`messmass.fanmass.analytics-summary.v1`,
  documented in the messmass repo), bypassing Camera entirely.

## 5. Rate limiting

All 8 routes above are rate-limited via the shared token-bucket limiter
([lib/api/rateLimiter.ts](../lib/api/rateLimiter.ts)):

- `RATE_LIMITS.INTERNAL_READ` — 120 requests/minute (the three `GET` routes:
  partners lookup, fanmass events, fanmass media)
- `RATE_LIMITS.INTERNAL_WRITE` — 60 requests/minute (the five `POST` routes:
  organizations, partners, events, sso-session, email send)

These tiers exist to catch a misbehaving caller (retry storm, bad cron, buggy
poll loop) — not to police untrusted public traffic, since every caller here
is already secret-authenticated. A `429` on these routes means the *calling
app* (messmass or fanmass) is retrying too aggressively, not that a rate limit
config needs loosening for a legitimate one-off burst.

## 6. Data model / indexes

- `organizations.organizationId` — unique
- `organizations.messmassOrganizationId` — sparse
- `partners.messmassPartnerId` — sparse
- `events.messmassEventId` — **unique**, sparse (enforces "one Camera event per
  messmass event" at the DB level, not just in `provisionEvent()`'s
  findOne-then-insert app logic)

Defined in [lib/db/ensure-indexes.ts](../lib/db/ensure-indexes.ts), applied via
`npm run db:ensure-indexes`. The email service (§3) touches no database.

## 7. Required environment variables

See `.env.example` for the full list; the integration-specific ones:

| Var | Direction | Purpose |
|---|---|---|
| `CAMERA_MESSMASS_INTERNAL_SECRET` | messmass → camera **and** camera → messmass | Auth for §1 routes (including sso-session) and §3 (email); also the secret camera sends outbound in §4's `pushPartnerToMessmass`/`pushSsoSessionToMessmass` calls (same shared secret both directions) |
| `CAMERA_FANMASS_INTERNAL_SECRET` | fanmass → camera | Auth for §2 routes and §3 (email) |
| `MESSMASS_BASE_URL` | camera → messmass | Base URL camera calls outbound for the §4 partner-push and sso-session-mint requests ([lib/messmassClient.ts](../lib/messmassClient.ts):14) |
| `RESEND_API_KEY`, `CAMERA_EMAIL_FROM` | (Camera's own) | Required for §3 to actually send; without them every call returns `sent: false` |

Both internal-auth routes return 403 if their respective secret is unset —
there is no "integration disabled, skip silently" mode on the Camera side
(unlike messmass, which treats an unconfigured `CAMERA_BASE_URL`/secret as
`camera_not_configured` and skips provisioning without erroring).

## 8. Testing locally

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

# 4. Send an email (messmass or fanmass side)
curl -X POST http://localhost:3000/api/internal/email/send \
  -H "x-messmass-secret: $CAMERA_MESSMASS_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"to":"you@example.com","subject":"Test","html":"<p>hi</p>","fromName":"messmass"}'
```

## 9. See also

- [ARCHITECTURE.md §8](../ARCHITECTURE.md) — main collections
- [lib/db/schemas.ts](../lib/db/schemas.ts) — full record shapes
- messmass repo: `docs/guides/guides-tutorial-camera-app.md`,
  `docs/guides/guides-tutorial-fanmass.md`
- fanmass repo: `docs/messmass-integration-delivery-plan-2026-06-25.md`,
  `services/camera_client.py`, `services/camera_sync.py`
