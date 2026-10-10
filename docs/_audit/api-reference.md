# Camera API Reference

Generated for the fleet audit (camera#124), measured against `docs/_audit/endpoints.json` (rebuilt 2026-09-08 @ head 35a5a84, regenerated 2026-09-29 for v12.3.39); every handler was read in full.

Coverage: every route in endpoints.json is documented below except the ones the try-on removal deleted (issue 557, docs/TRYON_REMOVED.md): `admin/tryon-*`, `admin/settings/card-display`, `internal/tryon/{complete,sync}`, `internal/image-direct/complete` and `tryon/setups*` are gone from this reference together with their code. `GET /api/tryon/suits` and the try-on parts of `POST /api/submissions` stay until the guest-path phase (R3). (First edition: 90 of 90 @ 97c1f67; the edition counts and the reasons for each added or deleted route before the removal are in git history of this file.)

Auth-layer legend (the exact guard called in the handler):

- `requireAuth` — any authenticated Camera session (`lib/api/middleware.ts`; 401 otherwise)
- `requireAdmin` — session with `appRole` admin/superadmin (401/403)
- `optionalAuth` / `getSession` — session read; handler decides what anonymous callers may do
- `isGlobalAdminSession` — post-`requireAuth`/`getSession` check for global admin (403 otherwise)
- `assertPartnerEventAccess` / `assertGlobalAdminOrPartnerEventAccess` / `getPartnerScopedAccessForEvent(Uuid)` / `assertPartnerWorkspaceAccess` / `assertPartnerMongoWorkspaceAccess` — partner-scoped RBAC (viewer/manager/admin) from `lib/partners/authorization.ts`
- `assertInternalMessmassSecret` / `assertInternalFanmassSecret` / `assertInternalSavetheworldSecret` — shared-secret service auth (`x-messmass-secret`, `x-fanmass-secret`, `x-savetheworld-secret` / Bearer); each fails closed (403) when its env secret is unset. Since v12.3.39 the compare is constant-time (SHA-256 digests through `crypto.timingSafeEqual`, `lib/security/safeEqual.ts`) and every rejection — secret unset, missing or wrong — returns the same 403 `{"success":false,"error":"Forbidden"}`; the reason (never the value) is logged server-side as `[internal-auth] …`. Before, the 403 body named the unset env var (`"<VAR> is not configured"`) or said `"Invalid <app> internal secret"`
- production-guard — `blockDangerousApiInProduction()`: 404 under `NODE_ENV=production` unless `ALLOW_DANGEROUS_DEV_ROUTES=true`
- none — no guard at all

## /api/admin

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| POST /api/admin/events/[id]/email-preview | requireAdmin | body `{templateType?, sampleSubmissionId?}` | `{eventId, eventMongoId, context, validations[]}` | none (reads events, submissions) |
| GET /api/admin/events/[id]/export/emails | requireAuth + assertPartnerEventAccess(manager) | path id = event Mongo `_id` | CSV attachment (email, name, source, counts, dates) | none |
| GET /api/admin/events/[id]/export/images | requireAuth + assertPartnerEventAccess(manager) | `?format=csv\|zip` | CSV of image URLs, or streamed ZIP (max `MAX_ZIP_IMAGES`) | external: fetches each stored image URL (Vercel Blob, or imgbb for older photos) for ZIP |
| GET /api/admin/events/[id]/frame-design | requireAuth + assertGlobalAdminOrPartnerEventAccess(viewer) | path Mongo `_id` | `{frameDesign\|null, defaultMessages, limits}`; 400 invalid id, 403, 404 | none. Access is checked before the event is looked up |
| PUT /api/admin/events/[id]/frame-design | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager); rate limit ADMIN 50/min | `{messages: string[]}` or `{reset: true}`; 400 for more than 10 messages, an empty or over-long (80 characters) one, an unknown placeholder, or no JSON body | `{frameDesign, variants: {total, generated, reused}}`; 502 when the list is saved but the images could not be generated | updates `events.frameDesign.messages`, `messagesOverridden`, `updatedAt`; creates the snapshot first when the event has none (camera#234); then renders one PNG per usable message and stores it in Vercel Blob (`frames/generated/<eventId>/`), updating `frameDesign.variants` (camera#235); `maxDuration` 60 s |
| POST /api/admin/events/[id]/frame-design/refresh | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager); rate limit ADMIN 50/min | none | `{frameDesign, changed, messmassUnavailable, variants: {total, generated, reused}}`; 400 invalid id, 403, 404; 502 when the snapshot is saved but the images could not be generated | outbound `GET {MESSMASS_BASE_URL}/api/integrations/camera/events/[id]/frame-context` (5 s bound, `lib/messmassClient.ts` `fetchFrameContext`); updates `events.frameDesign`, then regenerates the frame images whose inputs changed (Blob, camera#235). When messmass gives nothing usable the previous snapshot is kept and `messmassUnavailable` is true; `maxDuration` 60 s |
| GET /api/admin/settings/defaults-rollout | requireAuth + global admin | none | `{settingId, applyToExistingEvents, updatedAt, updatedBy}`; 403 | reads `admin_settings` (`defaults-rollout`) (docs/JOURNEY_DEFAULT_PAGES.md) |
| PATCH /api/admin/settings/defaults-rollout | requireAuth + global admin; rate limit ADMIN 50/min | `{applyToExistingEvents: boolean}` | the stored setting; 400 not a boolean, 403 | upserts `admin_settings` (`defaults-rollout`) |
| GET /api/admin/events/[id]/short-links | requireAuth + assertGlobalAdminOrPartnerEventAccess(viewer) | path Mongo `_id` | `{links[] (slug, placement, kind, active, url, counts), eventShortUrl, linkedToMessmass, lastPush, limits}`; 400 invalid id, 403, 404 | reads `short_links`, `short_link_hits`; after the answer pushes the totals to messmass (forced) |
| POST /api/admin/events/[id]/short-links | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager); rate limit ADMIN 50/min | `{placement, kind: 'qr'\|'link', slug?}` | 201 `{link}`; 400 bad input, 409 slug taken or 20 links reached | inserts into `short_links` (docs/SHORT_LINKS.md) |
| PATCH /api/admin/events/[id]/short-links | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager); rate limit ADMIN 50/min | `{slug, active: boolean}` | `{slug, active}`; 400, 403, 404 | updates `short_links.active` |
| GET /api/admin/events/[id]/short-links/[slug]/qr | requireAuth + assertGlobalAdminOrPartnerEventAccess(viewer); rate limit READ | `?color=%23rrggbb&download=1` | `image/svg+xml` QR of `go.messmass.com/<slug>` (dark modules, transparent background); 400, 403, 404 | none |
| POST /api/admin/frame-backfill | requireAdmin (global admin); rate limit ADMIN 50/min | `{mode: 'dry-run', probe?: boolean}` or `{mode: 'run', limit?: 1..10 (default 3), after?: string, redraw?: boolean (draw again only the images made with an older drawing code, camera#274)}`; 400 for anything else | dry run `{report}` (counts of events with an own frame, with images, to do by linked / native / inactive / with snapshot, native without partner logo, and with `probe` a summary of the messmass answers); run `{batch}` (`processed`, `completed`, `imagesDrawn`, `imagesReused`, `failures[]`, `waiting[]`, `nextAfter`, `remaining`, `done`) | dry run reads events and partners and, with `probe`, one `GET {MESSMASS_BASE_URL}/api/integrations/camera/events/[id]/frame-context` per linked event (read-only, 40 s bound); run takes the snapshot (`events.frameDesign`) and draws and stores the images (Blob `frames/generated/<eventId>/`) for the next events without an own active frame and without images; a linked event messmass does not answer for is not drawn (waits); `maxDuration` 60 s, no new event after 35 s (camera#238) |
| POST /api/admin/events/[id]/gallery-upload | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager); rate limit 60/min | multipart `file` (+`imageWidth`,`imageHeight`) | 201 `{submission}` | inserts `submissions`; uploads via `lib/imgbb/upload.ts` (Vercel Blob primary, imgbb best-effort mirror) |
| GET /api/admin/fix-mojibake-text | requireAdmin | `?apply=1` to write (default dry-run) | `{mode, note, results{scanned, candidateCount, sample, applied?}}` | when `apply=1`: updates `partners.name/description`, `organizations.name`, `events.name/partnerName` |
| POST /api/admin/migrate-frames | requireAdmin | none | `{message, migrated[]}` | updates `frames` (adds missing `frameId`) |
| POST /api/admin/submissions/[submissionId]/archive | requireAdmin | path ObjectId | `{message, submission}` | updates `submissions` (`isArchived:true`, archivedAt/By) |
| POST /api/admin/submissions/[submissionId]/restore | requireAdmin | path ObjectId | `{message, submission}` | updates `submissions` (unarchive) |
| PATCH /api/admin/users/[email]/role | requireAdmin | body `{role: user\|admin}` | `{success, message, email, role}` | external: PATCHes app role via SSO HTTP API (no local write) |
| PATCH /api/admin/users/[email]/status | requireAdmin | body `{isActive: bool, userType: real\|pseudo\|administrator}` | `{success, ..., submissionsUpdated}` | updates `submissions` (`cameraAccountDisabled` mirror or `userInfo.isActive`) |
| POST /api/admin/users/merge | requireAdmin | body `{pseudoEmail, realUserEmail, realUserId?}` | `{success, submissionsMerged, ...}` | updateMany `submissions` (re-attributes pseudo user's rows to real SSO user) |

Note: the first-edition scanner flagged `email-preview`, `fix-mojibake-text`, `migrate-frames`, `archive`, `restore` and `users/*` as `no_auth_marker` because it did not know `requireAdmin`; the vendored `scripts/fleet-audit-inventory.py` (2026-09-08) recognises it and flags no `/api/admin` route. All of them are admin-gated in code as listed.

## /api/auth

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/auth/login | none (public; rate limit LOGIN_INIT) | `?redirectTo&provider&from_logout` | 302 to SSO authorize URL (or dev-login when SSO unset in dev) | sets pending-session/PKCE cookie; clears `post-logout` cookie |
| GET /api/auth/callback | none (public; CSRF via `state` + PKCE/pending cookie verification) | `?code&state` (or `?error`) | 302 to `/admin` or `/capture/[id]` | creates `camera_session` (mints session, may store web-session doc); queries SSO token/userinfo/permission; best-effort pushes SSO session cookies to messmass |
| GET,POST /api/auth/logout | none (acts on caller's own session) | none | 302 to `/` | revokes SSO tokens (best-effort), clears session cookie, sets 2-min `post-logout` cookie |
| GET /api/auth/session | none (public) | none | `{authenticated, appAccess?, user?}` | none |
| GET /api/auth/dev-login | production-guard | `?email&name&role&access&redirectTo&userId` | 302 with mock session | creates mock session cookie (dev/E2E only; 404 in production) |

## /api/e2e (dev-only surface)

`/api/debug/{event-logos,submissions,users}`, `/api/test-db`, `/api/test-frames` and `/api/migrate/submissions` were deleted in 070058e (camera#125); `/api/auth/dev-login` is listed under `/api/auth`.

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| POST /api/e2e/bootstrap | production-guard + localhost-only + assertDisposableE2EDatabase | none | ids of seeded fixtures | inserts `partners`, `events`, `partnerUserAccess`, `submissions`, `slideshows` (E2E DB only) |
| POST /api/e2e/cleanup | production-guard + localhost-only + assertDisposableE2EDatabase | body `{e2eRunId?}` | `{deleted{...}}` | deletes E2E-tagged docs across the same collections |

## /api/events

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/events | requireAuth (global admin sees all; others scoped via listAccessiblePartnerIds) | `?page&limit&search&partnerId&active` | `{events[], pagination}` | none |
| POST /api/events | requireAuth; non-global-admin needs getPartnerScopedAccessForPartner(events, manager) | body `{name, partnerId, description?, eventDate?, location?, isActive?, logoUrl?, showLogo?, shortUrlSlug?, notifications?, visualSettings?, sharePage?}` | 201 `{event}` | inserts `events` (inherits partner defaults) |
| GET /api/events/[eventId] | optionalAuth (public for active events; inactive needs getPartnerScopedAccessForEvent) + rate limit READ | path = Mongo `_id`, event UUID, or slug | `{event}` with populated `frames[].frameDetails` and `generatedFrame` (`{width, height, variants[{index, message, imageUrl, width, height, layers}]}` or null; derived, only while the event has no active frame of its own and an image exists, camera#236); the stored `frameDesign` is not returned | none |
| PATCH /api/events/[eventId] | requireAuth + isGlobalAdminSession or getPartnerScopedAccessForEvent(manager) | partial event body incl. `customPages[]`, slugs (dupe-checked) | `{event}` | updates `events` |
| DELETE /api/events/[eventId] | requireAuth + isGlobalAdminSession or getPartnerScopedAccessForEvent(admin) | path Mongo `_id` | `{message, eventId}` | deletes `events` doc |
| POST /api/events/[eventId]/frames | getSession + getPartnerScopedAccessForEvent(manager) | body `{frameId, isActive?}` | `{message, frameAssignment}` | `$push` events.frames; sets `framesOverridden` |
| DELETE /api/events/[eventId]/frames/[frameId] | getSession + getPartnerScopedAccessForEvent(manager) | path ids | `{message}` | `$pull` events.frames |
| PATCH /api/events/[eventId]/frames/[frameId]/toggle | getSession + getPartnerScopedAccessForEvent(manager) | path ids | `{message, isActive}` | updates events.frames.$.isActive |
| GET /api/events/[eventId]/logos | none for active events (inactive: optionalAuth + getPartnerScopedAccessForEvent(viewer)) | path = Mongo `_id` or event UUID | `{eventId, eventName, logos{scenario:[...]}}` | none |
| POST /api/events/[eventId]/logos | getSession + getPartnerScopedAccessForEvent(manager) | body `{logoId, scenario, order?, isActive?}` | `{message, logoAssignment}` | `$push` events.logos, sets `logosOverridden`; `$inc` logos.usageCount |
| PATCH /api/events/[eventId]/logos/[logoId] | getSession + getPartnerScopedAccessForEvent(manager) | body `{action: toggle\|updateOrder, order?}` | `{message, ...}` | updates events.logos entry |
| DELETE /api/events/[eventId]/logos/[logoId] | getSession + getPartnerScopedAccessForEvent(manager) | path ids | `{message}` | `$pull` events.logos; `$inc` logos.usageCount −1 |
| POST /api/events/[eventId]/reset-style | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager) | body `{styleField: brandColors\|frames\|logos}` | `{event, message}` | updates `events` (re-inherits partner default) |
| DELETE /api/events/[eventId]/submissions/[submissionId] | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager) | path ids | `{message, remainingSubmissions}` | updates `submissions` (`$pull` eventIds / `$unset` eventId, `$addToSet` hiddenFromEvents) |
| POST /api/events/[eventId]/submissions/bulk-remove | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager) | body `{submissionIds[]}` | `{matchedCount, modifiedCount, removedIds}` | updateMany `submissions` (same hide semantics) |

## /api/frames, /api/logos, /api/upload-logo, /api/hashtags, /api/go-short

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/frames | none | `?page&limit&category&active` | `{frames[], pagination}` — full docs incl. imgbb `deleteUrl` | writes `frames` (auto-adds `frameId` to legacy docs during read) — see GAP-1 |
| POST /api/frames | requireAdmin | multipart `file (png/svg), name, description?, category?, isActive` | 201 `{frame}` | inserts `frames`; uploads via `lib/imgbb/upload.ts` (Vercel Blob primary, imgbb best-effort mirror) |
| GET /api/frames/[id] | requireAdmin | path Mongo `_id` | `{frame}` | none |
| PUT /api/frames/[id] | requireAdmin | body `{name?, description?, category?, isActive?}` | `{success}` | updates `frames` |
| DELETE /api/frames/[id] | requireAdmin | path Mongo `_id` | `{success}` | deletes `frames` doc |
| GET /api/logos | none | `?page&limit&active` | `{logos[], pagination}` (full docs) | none — see GAP-2 |
| POST /api/logos | requireAdmin | multipart `file, name, description?, isActive` | 201 `{logo}` | inserts `logos`; uploads via `lib/imgbb/upload.ts` (Vercel Blob primary, imgbb best-effort mirror); sharp reads dimensions |
| GET /api/logos/[id] | none | path Mongo `_id` | `{logo}` | none — see GAP-2 |
| PUT /api/logos/[id] | requireAdmin | body `{name?, description?, isActive?}` | `{logo}` | updates `logos` |
| DELETE /api/logos/[id] | requireAdmin | path Mongo `_id` | 204 | deletes `logos` doc; `$pull`s assignments from `events.logos` |
| POST /api/upload-logo | requireAuth, then rate limit UPLOAD (10/min per IP per path; Upstash when configured), then: `appAccess:false` → 403 `No access to this app`; global admin (appRole admin/superadmin) passes; anyone else needs an active `partner_user_access` row with `appKey:'events'` and role manager/admin, else 403 `Admin or partner Events manager access is required` (v12.3.39; was requireAuth only, i.e. any SSO account incl. guest capture sessions) | body `{imageData (base64 or data URL, max 4 MB decoded), name?}`; 413 `Image must be under 4 MB` when the decoded image exceeds 4 MB or the declared Content-Length exceeds 5,657,942 bytes (checked before parsing); 400 `Image data is required` when `imageData` is missing or not a string | 201 `{imageUrl, thumbnailUrl, deleteUrl, imageId, fileSize, mimeType}`; 429 when rate limited | uploads via `lib/imgbb/upload.ts` (Vercel Blob primary, imgbb best-effort mirror); no DB write; reads `partner_user_access` for sessions that are not global admins. Partner Events managers are admitted on purpose: the callers are the event create/edit forms and the per-event landing-page editor, which they may use, matching the gallery-upload and background-image upload routes |
| GET /api/hashtags | none (rate limit READ) | `?q&limit` | `{hashtags[], count}` | none |
| GET /api/go-short/[slug] | none (rate limit READ) | path slug | 302 to `/capture/[id]` | after the redirect: counts the visit of a tracked link or an event short URL when it was a person (writes `short_link_hits`) and pushes the totals to messmass, throttled (docs/SHORT_LINKS.md) |

## /api/internal (service-to-service)

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| POST /api/internal/email/send | assertInternalMessmassSecret OR assertInternalFanmassSecret; rate limit INTERNAL_WRITE | body `{to, subject, html, text?, fromName?, fromLocalPart?}` (domain always Camera's verified domain) | `{sent, messageId?\|error?}` (200 even on soft failure) | external: sends email via Resend |
| GET /api/internal/fanmass/events | assertInternalFanmassSecret; rate limit INTERNAL_READ | `?all=true` | `{events[{eventId, name, partnerId, partnerName, messmassEventId, isActive, eventDate}]}` | none |
| GET /api/internal/fanmass/events/[eventId]/media | assertInternalFanmassSecret; rate limit INTERNAL_READ | `?since=<ISO>&limit` | `{eventId, media[{captureId, url, createdAt}]}` (originals only) | none |
| POST /api/internal/messmass/events | assertInternalMessmassSecret; rate limit INTERNAL_WRITE | body `{messmassEventId, eventName, eventDate?, messmassPartnerId?\|partnerId?}` | 201/200 `{event}` | idempotently inserts/links `events` (inherits partner defaults); a new event also takes its frame-design snapshot from messmass, best effort, and its frame images are rendered after the response (a failure is logged and never blocks provisioning, camera#234, #235); `maxDuration` 60 s |
| POST /api/internal/messmass/organizations | assertInternalMessmassSecret; rate limit INTERNAL_WRITE | body `{name, messmassOrganizationId?}` | 201/200 `{organization}` | upserts `organizations` |
| GET /api/internal/messmass/partners | assertInternalMessmassSecret; rate limit INTERNAL_READ | `?name&messmassPartnerId` | `{partners[]}` | none |
| POST /api/internal/messmass/partners | assertInternalMessmassSecret; rate limit INTERNAL_WRITE | body `{name, messmassPartnerId?, organizationId?, logoUrl?}` | 201/200 `{partner}` | upserts `partners` (link by messmass id, then name, then create) |
| POST /api/internal/messmass/sso-session | assertInternalMessmassSecret + forwarded access token re-verified against SSO (getUserInfo + getAppPermission); rate limit INTERNAL_WRITE | body `{accessToken, refreshToken?, expiresIn?}` | `{success, appRole}` + session cookie (403 `no_access` without app access; since v12.3.39 403 `sso_token_cannot_read_camera_permission` when SSO answers 401/403 to the permission read, which is every messmass-issued token today, instead of a 500; other SSO failures stay 500) | mints a real `camera_session` for the verified user |
| POST /api/internal/savetheworld/events | assertInternalSavetheworldSecret; rate limit INTERNAL_WRITE | body `{savetheworldEventId, partnerId (camera partnerId), eventName, eventDate?}` | 201/200 `{event{..., created, mongoId, captureUrl}}` (`captureUrl` = `NEXT_PUBLIC_APP_URL/capture/<mongoId>`, null when the URL env is unset) | idempotently inserts `events` keyed on `savetheworldEventId` (inherits partner defaults via `inheritPartnerDefaults`) |
| GET /api/internal/savetheworld/events | assertInternalSavetheworldSecret; rate limit INTERNAL_READ | `?partnerId` filter; `?eventId=<eventId or Mongo _id>` exact lookup (v12.3.33) | `{events[{eventId, name, partnerId, partnerName, eventDate, isActive, mongoId, captureUrl, savetheworldLinked}]}` (`savetheworldLinked` = the event carries `savetheworldEventId`) — unfiltered list capped at 200 rows, newest eventDate first | none |
| POST /api/internal/savetheworld/partners | assertInternalSavetheworldSecret; rate limit INTERNAL_WRITE | body `{name, logoUrl?}` | 201/200 `{partner{..., created}}` | links by case-insensitive name (updating `logoUrl` if given) else inserts `partners` |
| GET /api/internal/savetheworld/partners | assertInternalSavetheworldSecret; rate limit INTERNAL_READ | none | `{partners[{partnerId, name, logoUrl}]}` — active partners (`isActive: true`), sorted by name; `logoUrl` null when unset | none |
| POST /api/internal/savetheworld/events/[eventId]/publish-selfies | assertInternalSavetheworldSecret (403 when unset or mismatched); no rate limit | path `eventId` = camera eventId, Mongo `_id` or `savetheworldEventId` (resolved against `events`) | `{published, total}` — `published` = submissions flipped, `total` = all non-tryon submissions of the event | `updateMany` sets `isShareVisible: true` on the event's non-tryon submissions that have an image URL and an unset (absent/null) share flag — an explicit `false` is never overridden (since this change). Scoped to the one event since v12.3.37 — before that the filter lost its event condition (two `$or` keys in one object) and flipped every such submission across all events |
| GET /api/internal/savetheworld/pledges | assertInternalSavetheworldSecret; rate limit INTERNAL_READ | `?eventId=<Mongo _id or event UUID>&limit (default 12, max 60)` (no eventId → empty list; either id form resolves the event and matches submissions on all of its identifiers since v12.3.34; `&submissionId=<id>` instead returns that one submission of the event, bypassing the wall filters — the capturer's private post-selfie lookup) | `{pledges[{pledgeId, imageUrl, name, createdAt}], total}` — non-tryon submissions with `isShareVisible === true` (strict opt-in; absent or `false` is never listed — before this change absent counted as visible since v12.3.36) and a displayable image — any of `previewImageUrl`/`finalImageUrl`/`imageUrl`, returned in that order of preference as `imageUrl`; never `originalImageUrl` (v12.3.37: v12.3.36 admitted `imageUrl`/`originalImageUrl`-only submissions but returned only `previewImageUrl`/`finalImageUrl`, so 7 would have shown as blank tiles); `total` counts them regardless of `limit` (v12.3.32); never email/userInfo | none |

## /api/landing-pages

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/landing-pages | requireAuth + assertGlobalAdminOrPartnerEventAccess(viewer) | `?eventMongoId` (required) | `{landingPages[]}` | none |
| POST /api/landing-pages | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager) | body `{eventMongoId, slug, targetType: slideshow\|layout, targetId, title?, description?, logoId?, qrCodeImageUrl?, url?, terms/privacy markdown?, customCss*?, cookieConsentEnabled?, isActive?}` | 201 `{landingPage}` | inserts `landingPages`; may upsert `landingPageCssPresets` |
| GET /api/landing-pages/[id] | requireAuth + event access (viewer) | path Mongo `_id` | `{landingPage}` | none |
| PATCH /api/landing-pages/[id] | requireAuth + event access (manager) | partial body (slug dupe-checked; target re-resolved) | `{landingPage}` | updates `landingPages`; may upsert CSS preset |
| DELETE /api/landing-pages/[id] | requireAuth + event access (manager) | path Mongo `_id` | 204 | deletes `landingPages` doc |

## /api/partners

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/partners | requireAuth (global admin sees all; others scoped) | `?page&limit&search&active` | `{partners[], pagination}` | none |
| POST /api/partners | requireAdmin | body `{name, description?, contactEmail?, contactName?, logoUrl?, isActive?}` | 201 `{partner}` | inserts `partners`; best-effort external push to messmass (stores `messmassPartnerId`) |
| GET /api/partners/[partnerId] | requireAuth + assertPartnerMongoWorkspaceAccess(viewer) | path Mongo `_id` | `{partner + eventCount + frameCount}` | none |
| PATCH /api/partners/[partnerId] | requireAdmin | body `{name?, description?, contact*?, logoUrl?, isActive?, defaultBrandColors?, defaultFrames?, defaultLogos?}` | `{partner, cascade?}` | updates `partners`; cascades defaults to child `events`; best-effort push to messmass (camera-native partners only) |
| DELETE /api/partners/[partnerId] | requireAdmin | path Mongo `_id` (409 if partner has events) | `{message}` | deletes `partners` doc |
| PATCH /api/partners/[partnerId]/toggle | requireAdmin | path Mongo `_id` | `{success, partner, isActive}` | flips `partners.isActive` |
| GET /api/partners/[partnerId]/users | requireAdmin | path Mongo `_id` | `{partner, ...access summary}` | none |
| POST /api/partners/[partnerId]/users | requireAdmin | body `{userEmail, appKey:'events', role: viewer\|manager\|admin, userName?, isActive?}` | 201 `{assignment}` | upserts `partnerUserAccess` |
| PATCH /api/partners/[partnerId]/users/[accessId] | requireAdmin | body `{role?, appKey?, isActive?, userName?}` | `{assignment}` | updates `partnerUserAccess` |
| DELETE /api/partners/[partnerId]/users/[accessId] | requireAdmin | path ids | 204 | deletes `partnerUserAccess` doc |
| DELETE /api/partners/[partnerId]/submissions/[submissionId] | requireAuth + (isGlobalAdminSession or assertPartnerWorkspaceAccess(manager)) | path ids | `{message, remainingSubmissions}` | updates `submissions` (`hiddenFromPartner:true`, clears eventIds) |

## /api/slideshows, /api/slideshow-layouts

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/slideshows | getSession (401 anon) + isGlobalAdminSession or getPartnerScopedAccessForEventUuid | `?eventId` (event UUID) | `{slideshows[]}` | none |
| POST /api/slideshows | getSession + isGlobalAdminSession or getPartnerScopedAccessForEvent(manager) | body `{eventId (Mongo _id), name, timing/buffer/playMode/orderMode/background*/viewportScale/stageAspect/submissionSourceMode}` | `{success, slideshow}` | inserts `slideshows` |
| PATCH /api/slideshows | getSession + isGlobalAdminSession or getPartnerScopedAccessForEventUuid(manager) | `?id=` + partial body (validated enums/hex colors) | `{success, slideshow}` | updates `slideshows` |
| DELETE /api/slideshows | getSession + isGlobalAdminSession or getPartnerScopedAccessForEventUuid(manager) | `?id=` | `{success}` | deletes `slideshows` doc |
| POST /api/slideshows/[slideshowId]/background-image | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager) (skipped if slideshow's event doc can't be resolved — still requireAuth); rate limit UPLOAD | multipart `file` | 201 `{imageUrl, thumbnailUrl}` | uploads via `lib/imgbb/upload.ts` (Vercel Blob primary, imgbb best-effort mirror); updates `slideshows.backgroundImageUrl` |
| GET /api/slideshows/[slideshowId]/next-candidate | none (rate limit SLIDESHOW_NEXT) | `?excludeIds=a,b` | `{candidate, totalAvailable}` | none |
| POST /api/slideshows/[slideshowId]/played | none (rate limit SLIDESHOW_PLAYED) | body `{submissionIds[]}` | `{updatedCount}` | updateMany `submissions` (`$inc playCount`, per-slideshow play counters) — unauthenticated mutation, public-by-design (see adjudication) |
| GET /api/slideshows/[slideshowId]/playlist | none (rate limit SLIDESHOW_PLAYLIST) | `?limit&exclude&instanceKey` | `{slideshow, playlist[], diagnostics}` (no-store) | none |
| GET /api/slideshow-layouts | getSession + isGlobalAdminSession or getPartnerScopedAccessForEventUuid | `?eventId` (UUID) | `{layouts[]}` | none |
| POST /api/slideshow-layouts | getSession + isGlobalAdminSession or getPartnerScopedAccessForEvent(manager) | body `{eventId (Mongo _id), name, rows?, cols?, areas?, cellAspect?, background?, align*, safety*Color}` | `{success, layout}` | inserts `slideshowLayouts` |
| PATCH /api/slideshow-layouts | getSession + isGlobalAdminSession or getPartnerScopedAccessForEventUuid(manager) | `?id=` + partial body (areas re-validated against event slideshows) | `{success, layout}` | updates `slideshowLayouts` |
| DELETE /api/slideshow-layouts | getSession + isGlobalAdminSession or getPartnerScopedAccessForEventUuid(manager) | `?id=` | `{success}` | deletes `slideshowLayouts` doc |
| GET /api/slideshow-layouts/[layoutId] | none (rate limit SLIDESHOW_LAYOUT_GET) | path layoutId | `{layout}` (active layouts only) | none |

## /api/submissions

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| POST /api/submissions | optionalAuth (public capture; anonymous allowed) + rate limit UPLOAD | body `{imageData (base64), frameId?, eventId?, eventName?, partnerId?, partnerName?, imageWidth?, imageHeight?, originalImageUrl?/originalImageWidth?/originalImageHeight?/reframe? (the private full-frame original the browser uploaded to Blob and how it was framed, sent together; camera#210), userInfo?, consents[]?, shareOptIn?, publicGalleryConsentVersion? (1: the version of the gallery permission sentence; with `shareOptIn` true it makes a photo of an event that asks eligible for the wall, issue 554), requestTryOn?/leatherSuitId?/tryOnSourceImageData?/setupId?/cameraId?/outfitBottomLeatherSuitId?/frameVariant? ({index, message, imageUrl} of the generated default frame image used, camera#236; kept only when the image is one of this project's `frames/generated/` PNGs, else dropped with a warning)}` | 201 `{submission, tryOn{requested, status, jobId, error}}` | uploads via `lib/imgbb/upload.ts` (Vercel Blob primary, imgbb best-effort mirror) (final + optional try-on source); inserts `submissions` with `isShareVisible: shareOptIn === true` (share checkbox in the capture UI, defaults checked since `d9488b5` (v12.3.36); an omitted `shareOptIn` stores `false`; `POST /api/internal/savetheworld/events/[eventId]/publish-selfies` can backfill `true` in bulk per event — try-on results still get `isShareVisible` from the moderation flow, not this field); may insert/dedupe `tryonJobs` + patch submission try-on state; validates try-on against event policy + `leatherSuits` |
| GET /api/submissions | requireAuth | `?page&limit` | `{submissions[], pagination}` (caller's own only) | none |
| PATCH /api/submissions/[submissionId] | optionalAuth — public FIRST write only; once `userInfo.collectedAt` exists, admin appRole required (camera#119) | body `{action: update_user_info\|finalize, userInfo{name,email}?}` | `{submissionId, action, emailResult}` | updates `submissions.userInfo`; on finalize may dispatch pending submission email (Resend) + metadata patch |
| DELETE /api/submissions/[submissionId] | requireAuth (owner or appRole admin/superadmin) | path ObjectId | `{message, deletedId, files:{deleted, keptShared, imgbbRequested, imgbbFailed}}`; 502 (row kept) when a stored file cannot be deleted; 409 for a stored try-on result (`submissionKind: 'tryon_result'` or a `sourceJobId`): the data of the removed try-on integration is kept as it is | first deletes the submission's files in this project's Blob store (composite, full-frame original, preview, try-on source; a file another submission still references is kept) and requests the imgbb delete link, then permanently deletes the `submissions` doc (camera#211) |

## /api/tryon

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/tryon/suits | none | `?eventId?` (Mongo `_id`) | `{suits[]}` — projected fields only (id, name, description, previewUrl, garmentType, sleeveStyle) | none |

## /api/share, /api/observability

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/share/[id]/download | none | path submission ObjectId + `?variant=` (must match a variant the event's share-page settings expose) | image bytes as attachment | external: fetches the stored image URL (Vercel Blob, or imgbb for older photos); no DB write |
| POST /api/observability/client-error | none | body `{digest?, message?, url?}` (fields clamped to 2KB) | `{ok:true}` | server-side structured log only (never persisted/reflected) |
| POST /api/uploads/original | none (public; the event must exist) + rate limit ORIGINAL_UPLOAD_TOKEN (30/min per IP) | Vercel Blob `blob.generate-client-token` request: `pathname` `originals/<eventId>/<file>.jpg`, `clientPayload` `{eventId}` | a client token for exactly one JPEG of at most 15 MB, valid 10 minutes, with a random path suffix; `400` for an unknown event, a path outside the event's folder or any other request type; `429` when limited | none persisted and nothing uploaded through this route; the browser uploaded directly to Vercel Blob. **No longer called by the capture page since camera#257** (the full-size original is not stored); kept for pages opened before that change |
| POST /api/observability/capture-diagnostic | none | body: one allowlisted, range-clamped capture diagnostic record (`lib/camera/diagnostics.ts`, max 4096 bytes); rate limited 300/min per IP | `204`; `400` invalid, `413` too large, `429` limited | server-side structured log `camera.capture_diagnostic` only (never persisted/reflected); no image, name, email, IP or device id |

## Adjudication of no-auth routes

Public-by-design (with reason):

- **/api/auth/login, /api/auth/callback, /api/auth/session, /api/auth/logout** — the login flow itself; callback is CSRF-protected via state/PKCE, logout only acts on the caller's own cookie.
- **GET /api/events/[eventId]** and **GET /api/events/[eventId]/logos** — public capture/onboarding needs event + logo data for ACTIVE events without login; inactive events require partner-scoped access. Rate-limited.
- **GET /api/go-short/[slug]**, **GET /api/hashtags** — public short-link redirect and public frame-hashtag search; read-only, rate-limited.
- **GET /api/slideshows/[slideshowId]/playlist, .../next-candidate, GET /api/slideshow-layouts/[layoutId]** — the public slideshow/videowall player runs unauthenticated on venue screens; read-only, rate-limited.
- **POST /api/slideshows/[slideshowId]/played** — unauthenticated MUTATION, but by design: the public player must report play counts. Blast radius is limited to `$inc` play counters on submissions; rate-limited. Worst case is counter skew.
- **POST /api/submissions** — unauthenticated MUTATION, by design: the public capture flow submits fan photos anonymously. Rate-limited (UPLOAD); try-on enqueue validates event policy server-side.
- **PATCH /api/submissions/[submissionId]** — unauthenticated first write, by design: public capture finalize (name/email). Tamper-hardened per camera#119 — once finalized, only admins may change it.
- **GET /api/share/[id]/download** — public share page download; requires an unguessable submission ObjectId, and only serves variants the event's share settings expose.
- **GET /api/tryon/suits** — capture UI suit picker; response projected to safe fields.
- **POST /api/observability/client-error** — documented public error beacon; size-bounded, log-only.
- **POST /api/uploads/original** — public because fans are not signed in; it only issues a short-lived token for one JPEG inside `originals/<eventId>/` of an existing event (path, type, size and lifetime are fixed server-side), rate limited. The submission accepts the resulting URL only after the same folder check and a Blob lookup (`lib/submissions/original-image.ts`). camera#210.
- **POST /api/observability/capture-diagnostic** — anonymous capture diagnostics (camera#204); public because fans are not signed in; allowlisted fields only, size-bounded, rate limited, log-only.
- **/api/internal/*** — shared-secret service auth (messmass / fanmass / savetheworld / cron), the designed trust boundary; every `assertInternal*Secret` fails closed when its env var is unset; sso-session additionally re-verifies the token against SSO itself.
- **dev-only surface** (`/api/e2e/*`, `/api/auth/dev-login`) — 404 in production via `blockDangerousApiInProduction()`; e2e additionally requires localhost + a disposable E2E database name. (`/api/debug/*`, `/api/test-db`, `/api/test-frames`, `/api/migrate/submissions` no longer exist — deleted in 070058e.)

### GAPs

- **GAP-1 — GET /api/frames (no auth, and it writes).** Anyone can list every frame document unauthenticated, and the response includes each frame's imgbb **`deleteUrl`** — a capability URL that lets the holder delete the hosted image. The same GET also performs a write on read (auto-migration inserting `frameId` into legacy docs), i.e. an unauthenticated mutating GET. Recommendation: require a session (admin UI is the only consumer of the full list) or project the response to safe fields and move the auto-migration behind `requireAdmin`.
- **GAP-2 — GET /api/logos and GET /api/logos/[id] (no auth).** Read-only, but returns full logo documents (including `createdBy` user ids and internal metadata) with no session required, while every event-scoped public need is already served by GET /api/events/[eventId]/logos. Recommendation: add `requireAuth` (or `requireAdmin`, matching POST/PUT/DELETE on the same paths) or project to safe fields.
- ~~**Borderline (guarded, noted for completeness): GET /api/migrate/submissions** — a destructive collection-wide migration behind a bare GET, protected only by the production-guard env check.~~ CLOSED: route deleted in 070058e (camera#125).

GAP tally: 2 clear GAPs (GAP-1, GAP-2 — covering 3 route paths, both re-verified open on 2026-09-08: `app/api/frames/route.ts:26` and `app/api/logos/route.ts:32` / `app/api/logos/[id]/route.ts:37` still call no guard); the borderline item is closed; every other no-auth route is public-by-design as adjudicated above.

## Deprecation candidates (zero callers)

Method (2026-09-08): for each of the 98 route paths, dynamic segments were
widened to match any `${...}` template expression or path token, then every
`.ts/.tsx/.js/.mjs` file under this repo's `app/`, `components/`, `lib/`
(there is no `hooks/`; the route's own file excluded) and every source/doc
file in the sibling worktrees `messmass-fleet`, `tryon-fleet`, `fanmass-fleet`
was scanned. Candidates were then re-checked by hand for indirect callers —
the `/api/admin/events/${eventId}/export` base + `/emails|/images`
(components/admin/EventExportControls.tsx:18), `encodeURIComponent(...)`
segments (gallery-upload, users/[email]/status) and env-configured URLs
(the internal routes whose URL is configured outside the code) — and those
are NOT listed. `/api/e2e/{bootstrap,cleanup}` have callers only under
`tests/e2e/` and are test fixtures by design, not candidates. Nothing below
has been deleted; each line is the evidence that no code path reaches it.

| Route | Evidence | Note |
|---|---|---|
| POST /api/admin/events/[id]/email-preview | `grep -rn "email-preview" app components lib` → only `app/api/admin/events/[id]/email-preview/route.ts`; 0 hits in messmass/tryon/fanmass | no admin UI calls the preview; template validation happens on the events edit page client-side |
| POST /api/admin/migrate-frames | `grep -rn "migrate-frames" app components lib scripts` → route file + `scripts/migrate-frames-add-frameId.ts:12,15` (the CLI, which does not call the route) | one-off migration also performed lazily by `GET /api/frames` (GAP-1) |
| POST /api/admin/submissions/[submissionId]/archive | `grep -rnF "admin/submissions/${" app components lib` → 0; `grep -rn "archive" app/admin/submissions components/gds/SubmissionsInventoryList.tsx components/admin/RemoveSubmissionButton.tsx` → no fetch | the submissions gallery uses event/partner "remove" (hide) routes instead |
| POST /api/admin/submissions/[submissionId]/restore | same greps as `archive` → 0 (its only caller was the try-on queue table, which targeted another route and is gone) | pairs with the unused `archive` |
| PATCH /api/partners/[partnerId]/toggle | `grep -rnF "/toggle" app components lib` → only `app/admin/events/[id]/frames/page.tsx:140` (frames toggle); 0 hits in siblings | partner activation is edited through `PATCH /api/partners/[partnerId]` `{isActive}` |
| GET /api/slideshows/[slideshowId]/next-candidate | `grep -rn "next-candidate" app components lib` → only the comment at `lib/slideshow/resolve-event.ts:5` | the player (`components/slideshow/SlideshowPlayerCore.tsx`) uses `/playlist` + `/played` |
| POST /api/internal/savetheworld/events | called by savetheworld's admin Sport Events screen (`src/lib/camera/adminList.ts` / provisioning) since savetheworld 2026-09-09; GET `/events`, GET `/partners` and GET `/pledges` are called by savetheworld's event page, home wall and admin (verified 2026-09-12 @ savetheworld 03272b9) | keep — live caller |
| POST /api/internal/savetheworld/partners | same evidence as `savetheworld/events` → 0 | as above |
