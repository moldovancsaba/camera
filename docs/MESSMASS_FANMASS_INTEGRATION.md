# messmass + fanmass integration

**Version**: 12.3.42
**Last Updated**: 2026-10-22
_Current Camera/Fanmass boundary; historical release details below must be read against the current sections._

Camera integrates with three other apps in the SEYU fan-engagement stack:
**messmass** (event reporting/partner management, the master for
organisations/partners/events), **fanmass** (image analytics — brand/sponsor/fan
recognition on captured photos), and **savetheworld** (pledge campaign app, §2a).
Messmass and Savetheworld use authenticated HTTP integrations. Fanmass is
deliberately different: it independently discovers eligible records in Camera
Atlas, claims its own one-photo queue, and stores analysis in its own pipeline
database. Camera does not enqueue or upload images to Fanmass. Camera reads
Fanmass queue/results for its authorized Photo analysis page and stores the
reviewer's correction/confirmation evidence on the Camera submission; Fanmass
polls that evidence. Fanmass sends each photo result to Messmass, which builds
reports mechanically. The shared-secret email route is separate from image
analysis.

```text
messmass      --(provision org/partner/event)---------->  camera
messmass      --(send email)---------------------------->  camera
camera Atlas  --(source records + review feedback)---->  fanmass
fanmass Atlas --(queue/results; Camera reads status)-->  camera admin
fanmass       --(one photo result + IDs)-------------->  messmass
savetheworld  --(partners/events, pledge wall, publish)-->  camera
camera        --(browser handoff: post-selfie CTA)----->  savetheworld
```

Camera is mostly inbound but DOES call messmass outbound in five cases (see §4): two more than the three described here are the tracked-link totals (`pushLinkStatsToMessmass`, `POST {MESSMASS_BASE_URL}/api/integrations/camera/events/[id]/link-stats`, camera#320, [SHORT_LINKS.md](SHORT_LINKS.md)) and the optional photo counters (`pushPhotoStatsToMessmass`, `.../photo-stats`, currently off by default, [ANALYTICS.md](ANALYTICS.md)). The three: it reads the resolved theme of an event for its generated default frame from `GET {MESSMASS_BASE_URL}/api/integrations/camera/events/[id]/frame-context` (`fetchFrameContext`, [lib/messmassClient.ts](../lib/messmassClient.ts), bounded at 5000 ms, null on any failure; called when messmass provisions an event and when an admin refreshes the event's frame design, see RUNBOOK "Generated default frame"), and it
pushes partners it creates natively to `POST {MESSMASS_BASE_URL}/api/integrations/camera/partners`
(`pushPartnerToMessmass`, [lib/messmassClient.ts:79-102](../lib/messmassClient.ts),
called from [app/api/partners/route.ts:136](../app/api/partners/route.ts) and
[app/api/partners/[partnerId]/route.ts:135](../app/api/partners/%5BpartnerId%5D/route.ts))
and mints a cross-app session via `POST .../api/integrations/camera/sso-session`
(`pushSsoSessionToMessmass`, [lib/messmassClient.ts:41-77](../lib/messmassClient.ts),
called from [app/api/auth/callback/route.ts:44](../app/api/auth/callback/route.ts)).
The session mint runs on every camera login and is best-effort: it is bounded at
3000 ms (`AbortSignal.timeout`), and a timeout, a refusal such as the expected
403 (owner decision 2026-09-30, `HANDOVER.md`: separate logins), or an unreachable messmass all
return `null`, so the user simply gets no messmass session. The partner push is
best-effort too and bounded at 8000 ms (`PARTNER_PUSH_TIMEOUT_MS`, more generous because a
cold messmass can need longer and no user waits for it on a login; the partner is already saved).
**Every attempt of both pushes writes one structured log line** (issue 178, `lib/observability/outbound.ts`):
event `messmass.session_push` or `messmass.partner_push`, with `context.outcome` = `ok` (the session
push: messmass sent a session cookie; the partner push: messmass answered 2xx), `empty` (2xx but no
cookie), `refused` (an error status, with `context.status`; for the session push 403 is the expected
answer for a user without messmass access), `timeout` or `failed` (a network error, with a short code
such as `ECONNREFUSED`), plus `durationMs` and `timeoutMs`; the partner push adds the camera partner
id. The line never holds a token, a cookie, the shared secret, an e-mail, a name or an address with a
query. Counting the `outcome` values of `messmass.session_push` in the Vercel runtime logs is the data
for the keep-or-drop decision on the login push (issue 178, owner's call).
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

### `POST /api/internal/messmass/theme-updated` (camera#285)
messmass tells camera that the look of its events changed. Body `{ "scope": "all" }` (a report style was edited or deleted) or
`{ "scope": "events", "messmassEventIds": ["<24 hex>", ...] }` (a partner's logo, name, style, template or team data changed; at most 500).
Camera marks those events stale (`events.themeStale`) and refreshes the oldest stale ones within 40 seconds, at most 12 per call: a new
snapshot of the messmass theme (`frameDesign.context`, including `style.page`, the page colours of the style) and, for an event that has
generated frame images, the images whose inputs changed. Answer `{ marked, refreshed, unavailable, failed, remaining }`. Events still stale
refresh the next time a guest opens them (after the response), and a snapshot older than a day is refreshed the same way, so no cron is needed.
messmass sends the notice best-effort with a 4 s timeout; it never blocks a save.

### `POST /api/internal/messmass/frame-backfill` (camera#285)
Draws the generated frame images of the events that have none: the work of the admin console's "Give the events a generated frame", for a
holder of the messmass secret. Body `{ "limit": 1..10 (default 3), "after": "<event id>", "redraw": false }`, answer `{ batch }` with
`done` and `nextAfter`; call again with `nextAfter` until `done`. Events with a frame of their own are untouched and events that already
have images are skipped, so it can be repeated.

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
Since v12.3.39 an SSO 401/403 on the permission read answers 403
`{ success: false, error: 'sso_token_cannot_read_camera_permission' }` instead
of a 500. That is the answer on every messmass login today: SSO lets a token
read only its own client's permission records (sso `6fb1b6a7`, 2026-05-10),
and the forwarded token was issued to messmass, so the shared session is never
minted. messmass treats any non-OK answer as "no camera session", so its own
login is unaffected. Minting it needs the permission read to use Camera's own
`client_credentials` token, which requires that grant (with
`manage_permissions`) to be enabled for Camera's SSO client (owner action).

## 2. Camera Atlas → Fanmass → Messmass: per-photo analysis

Camera is the source of truth for the submission, partner/event links, consent,
retention, image and vetting/publication state. When a photo is submitted,
Camera stores those records normally. Fanmass independently discovers source
records in Atlas; Camera does not call Fanmass, create a queue record, or upload
the image at capture or vetting time. If vetting is required, only an approved
photo is eligible. A pending no-login identity record, invalid/missing consent,
erasure-pending or expired record, rejected/waiting photo, archived/hidden
photo, broken source, or derived image is excluded.

**Atlas and databases.** The accepted target is one Atlas cluster with separate
logical databases: `camera`, `fanmass_camera_pipeline`, and `messmass`. The
owner chose to retain the existing AtlasAdmin credential, so those database
names do not provide MongoDB-enforced per-app permissions. As audited on
2026-10-22, Camera and Fanmass use `camaraclastar.koyedpi.mongodb.net`, while
Messmass's current local production configuration points to
`messmass-cluster.r96vlxs.mongodb.net`. A `messmass` database is present on the
Camera/Fanmass cluster but differs in four collections from the current
Messmass database. The MTK project's Camera event link matches on both
clusters; this does not prove full database parity. Do not describe the three
production apps as aligned or switch Messmass until backup, reconciliation,
full parity verification, and a controlled cutover are complete. Keep all
connection strings in secret storage; no URI or password belongs in docs.

**Photo and routing identity.** A task and result are keyed by the Camera
submission Mongo `_id` (photo ID), Camera event UUID, and Camera partner ID. The
Camera event has one exact `messmassEventId` link; Fanmass validates that route
and includes the Messmass event ID in the delivery outbox. Names and labels are
display metadata, never routing keys. The receiver verifies Camera event and
partner links before accepting a photo result. See
[`FANMASS_RESULTS_IN_CAMERA.md`](FANMASS_RESULTS_IN_CAMERA.md) and Fanmass's
`docs/CAMERA_ATLAS_QUEUE_CONTRACT.md` for the field contract.

**Strict single-photo queue.** Fanmass's Camera-image analysis lane has one
global lease; it claims one queue row, processes one source image, persists
that photo's normalized result and image-relative boxes, then releases the
lease. This guarantees serialization for the Camera-photo inference lane; it
does not claim that every unrelated Fanmass batch or local-AI feature is
globally serialized. Durable queue identity, source revision/generation
fencing, bounded retries, and idempotent writes prevent duplicate or stale
results. A crash may cause the same photo to be retried, but does not authorize
a second active photo.

**Human review and reports.** Camera reads Fanmass queue/results for its
authorized per-photo workbench. A reviewer can edit the structured result and
boxes, or confirm the current Fanmass generation. Camera stores the review
against the exact result revision on the Camera submission. Fanmass discovers
that matching review from Atlas, applies corrected summary/analysis/boxes to
the same photo result, and requeues that photo's Messmass delivery. Messmass
validates the ID tuple, upserts one active row per event and photo, and rebuilds
report values from the rows it has received. Fanmass does not create event
reports; Camera does not maintain a parallel manual analytics dataset.

**Consent and cleanup.** Fanmass reads only the minimum source fields needed
to determine eligibility, retrieve the image, and route the result. It does
not use guest email, name, social identity, or consent wording as analysis
inputs. Camera remains the retention authority; Fanmass must remove its local
and derived copies and publish a photo tombstone when the Camera source is
erased or becomes ineligible. A missing or unverifiable consent audit is no
consent and must be excluded and erased by Camera's cleanup path.

**Ownership and reporting**: Fanmass owns per-photo machine analysis and boxes.
Fanmass delivers each normalized single-photo result, with its Camera partner,
event, photo and linked Messmass event IDs, to Messmass through the authenticated
per-photo endpoint. Messmass stores those rows and mechanically rebuilds
event-level roll-ups; it does not consume an event summary from Fanmass. Camera
reads the Fanmass queue and result store for its per-photo operator view, and
stores human correction/confirmation evidence on the source submission tied to
the exact result revision. Fanmass consumes a matching correction and updates
that photo's result and Messmass delivery; the reviewer identity stays in
Camera. Camera does not enqueue work or write Fanmass queue/result rows. The
full source schema, queue state machine, retries, privacy behavior, monitoring,
and release checks are specified in Fanmass `docs/CAMERA_ATLAS_QUEUE_CONTRACT.md`.

## 2a. savetheworld → camera: pledge campaign

savetheworld provisions its partners and events into Camera, reads the public
pledge wall for its event pages, and can bulk-publish an event's fan selfies.

**Auth**: `assertInternalSavetheworldSecret()` ([lib/savetheworld/internal.ts](../lib/savetheworld/internal.ts)) —
header `x-savetheworld-secret: <secret>` or `Authorization: Bearer <secret>`,
compared against `CAMERA_SAVETHEWORLD_INTERNAL_SECRET`. 403 if unset or wrong.
A third, separate secret — not the messmass or fanmass one.

**Identity model** ([lib/savetheworld/provision.ts](../lib/savetheworld/provision.ts)):
partners link by case-insensitive name, else create; events are idempotent on
`savetheworldEventId`. Created records are stamped `source: 'savetheworld'`.

### `GET /api/internal/savetheworld/partners`
Active partners, sorted by name. Response: `{ partners: [{ partnerId, name, logoUrl }] }`.
Rate limit `INTERNAL_READ`.

### `POST /api/internal/savetheworld/partners`
Body: `{ name, logoUrl? }`. Response: `{ partner: { partnerId, name, created, linked } }`
(201 when created). Rate limit `INTERNAL_WRITE`.

### `GET /api/internal/savetheworld/events?partnerId=` | `?eventId=<eventId or Mongo _id>`
Events sorted by `eventDate` descending, capped at 200; `?eventId` returns exactly
that event regardless of the cap. Response: `{ events: [{ eventId, name, partnerId,
partnerName, eventDate, isActive, mongoId, captureUrl, savetheworldLinked }] }`;
`savetheworldLinked` is true when savetheworld provisioned the event (it carries
`savetheworldEventId`), so savetheworld can tell its own events from other products'.
Rate limit `INTERNAL_READ`.

### `POST /api/internal/savetheworld/events`
Body: `{ savetheworldEventId, eventName, eventDate?, partnerId }`. Requires the
partner to exist (404 otherwise). Inherits the partner's default design. When
`SAVETHEWORLD_APP_URL` is set, a new event also gets a default `cta` custom page
sending the fan to `{SAVETHEWORLD_APP_URL}/take-action/for/{eventId}` after the
selfie ([lib/savetheworld/provision.ts:58](../lib/savetheworld/provision.ts)).
Response: `{ event: { eventId, mongoId, partnerId, created, captureUrl } }`.
Rate limit `INTERNAL_WRITE`.

### `GET /api/internal/savetheworld/pledges?eventId=<Mongo _id or event UUID>&limit=<n>`
The public pledge wall, newest first (`limit` default 12, max 60): plain
photos of the event (never a stored try-on result) whose `isShareVisible` is `true` (strict opt-in: a
missing or `false` flag is never listed; legacy photos appear only after
`publish-selfies`) and that have a displayable image. Never returns `userEmail` or
`userInfo`. Response: `{ pledges: [{ pledgeId, imageUrl, name, createdAt }], total }`.
With `&submissionId=<id>` it instead returns that one submission of the event,
bypassing the wall filters — a private lookup for the capturer's own post-selfie
screen. Rate limit `INTERNAL_READ`.

### `POST /api/internal/savetheworld/events/[eventId]/publish-selfies`
Sets `isShareVisible: true` on the event's plain photos (never a stored try-on result) that have an
image and an unset share flag (event resolved by `eventId`, Mongo `_id` or
`savetheworldEventId`). Event-scoped since 12.3.37
([lib/savetheworld/publishSelfies.ts](../lib/savetheworld/publishSelfies.ts)).
Not rate-limited. It only flips submissions whose flag was never set (absent or
null): an explicit `isShareVisible: false` (a fan who unticked sharing) is never
overridden. Response: `{ published, total }`.

### camera → savetheworld
Browser handoff only: the post-selfie CTA page opens the `SAVETHEWORLD_APP_URL`
link with `?submissionId=<id>` appended
([components/capture/CTAPage.tsx](../components/capture/CTAPage.tsx)), so
savetheworld can show the fan their own photo via the private pledges lookup.
Camera makes no server-side call to savetheworld.

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
  push, the sso-session mint, the frame-context read and the link-stats push are outbound (lib/messmassClient.ts), and camera is
  the fleet's email transport (POST /api/internal/email/send). Not inbound-only.
- Camera does not know about `launchmass` — no code, config, or data path
  connects them.
- Camera does not run the Fanmass inference or write Fanmass result rows. It
  reads Fanmass results and queue status for authorized per-photo review, and
  stores review/correction evidence on the Camera submission. Fanmass sends
  each photo result to Messmass; Messmass mechanically builds event reports.

## 5. Rate limiting

All HTTP routes that declare a tier use the shared token-bucket limiter
([lib/api/rateLimiter.ts](../lib/api/rateLimiter.ts)); the §2a savetheworld
routes list their tier per route:

- `RATE_LIMITS.INTERNAL_READ` — 120 requests/minute (the partner lookup and
  public Savetheworld read routes)
- `RATE_LIMITS.INTERNAL_WRITE` — 60 requests/minute (the five `POST` routes:
  organizations, partners, events, sso-session, email send)

These tiers exist to catch a misbehaving HTTP caller (retry storm or bad cron),
not to police untrusted public traffic. Fanmass Atlas reads do not pass through
Camera's HTTP limiter.

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
| `CAMERA_FANMASS_INTERNAL_SECRET` | fanmass → camera | Auth for the shared email route only. It does not authorize image reads or queue operations. |
| `CAMERA_SAVETHEWORLD_INTERNAL_SECRET` | savetheworld → camera | Auth for §2a routes |
| `SAVETHEWORLD_APP_URL` | camera → savetheworld (browser) | Base URL for the default post-selfie CTA on newly provisioned savetheworld events (§2a); unset = no CTA |
| `MESSMASS_BASE_URL` | camera → messmass | Base URL camera calls outbound for the §4 partner-push and sso-session-mint requests ([lib/messmassClient.ts](../lib/messmassClient.ts):14) |
| `RESEND_API_KEY`, `CAMERA_EMAIL_FROM` | (Camera's own) | Required for §3 to actually send; without them every call returns `sent: false` |

Every internal-auth route returns 403 if its secret is unset —
there is no "integration disabled, skip silently" mode on the Camera side
(unlike messmass, which treats an unconfigured `CAMERA_BASE_URL`/secret as
`camera_not_configured` and skips provisioning without erroring).

Since v12.3.39 every rejection has the same body,
`{"success":false,"error":"Forbidden"}`, whether the secret is unset on
Camera, missing from the request, or wrong, and the comparison is constant-time
([lib/security/safeEqual.ts](../lib/security/safeEqual.ts)). To tell those
cases apart, read Camera's server log: an unset secret logs
`[internal-auth] <gate>: <ENV_VAR> is not configured …` (error), a wrong one
`… presented secret does not match <ENV_VAR> …` (warning); a request with no
secret at all is not logged.

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

# 3. Send an email (messmass or fanmass side)
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
