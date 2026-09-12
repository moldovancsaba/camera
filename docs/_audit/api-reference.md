# Camera API Reference

Generated for the fleet audit (camera#124), measured against `docs/_audit/endpoints.json` (rebuilt 2026-09-08 @ head 35a5a84); every handler was read in full.

Coverage: 98 of 98 routes in endpoints.json documented below. (First edition: 90 of 90 @ 97c1f67. Since then 070058e deleted the six dev-only `debug/*`, `test-db`, `test-frames`, `migrate/submissions` routes, and 14 routes were added — `admin/settings/card-display`, `admin/tryon-jobs/[jobId]/cancel`, `admin/tryon-maintenance/{audit,reconcile}`, `admin/tryon-results/[submissionId]/{pin-to-slideshow,reframe,remove,restore}`, `admin/tryon-setups`, `admin/tryon-setups/[setupId]`, `admin/tryon-setups/[setupId]/duplicate`, `internal/savetheworld/{events,partners,pledges}` — all documented in this edition.)

Auth-layer legend (the exact guard called in the handler):

- `requireAuth` — any authenticated Camera session (`lib/api/middleware.ts`; 401 otherwise)
- `requireAdmin` — session with `appRole` admin/superadmin (401/403)
- `optionalAuth` / `getSession` — session read; handler decides what anonymous callers may do
- `isGlobalAdminSession` — post-`requireAuth`/`getSession` check for global admin (403 otherwise)
- `assertPartnerEventAccess` / `assertGlobalAdminOrPartnerEventAccess` / `getPartnerScopedAccessForEvent(Uuid)` / `assertPartnerWorkspaceAccess` / `assertPartnerMongoWorkspaceAccess` — partner-scoped RBAC (viewer/manager/admin) from `lib/partners/authorization.ts`
- `assertInternalTryOnSecret` / `assertInternalMessmassSecret` / `assertInternalFanmassSecret` / `assertInternalSavetheworldSecret` — shared-secret service auth (`x-camera-tryon-secret`, `x-messmass-secret`, `x-fanmass-secret`, `x-savetheworld-secret` / Bearer); each fails closed (403) when its env secret is unset
- `TRYON_SETUP_SELECTION_SECRET` — `x-camera-setup-secret` header service auth
- production-guard — `blockDangerousApiInProduction()`: 404 under `NODE_ENV=production` unless `ALLOW_DANGEROUS_DEV_ROUTES=true`
- none — no guard at all

## /api/admin

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| POST /api/admin/events/[id]/email-preview | requireAdmin | body `{templateType?, sampleSubmissionId?}` | `{eventId, eventMongoId, context, validations[]}` | none (reads events, submissions) |
| GET /api/admin/events/[id]/export/emails | requireAuth + assertPartnerEventAccess(manager) | path id = event Mongo `_id` | CSV attachment (email, name, source, counts, dates) | none |
| GET /api/admin/events/[id]/export/images | requireAuth + assertPartnerEventAccess(manager) | `?format=csv\|zip` | CSV of image URLs, or streamed ZIP (max `MAX_ZIP_IMAGES`) | external: fetches each imgbb image for ZIP |
| POST /api/admin/events/[id]/gallery-upload | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager); rate limit 60/min | multipart `file` (+`imageWidth`,`imageHeight`) | 201 `{submission}` | inserts `submissions`; uploads to imgbb |
| GET /api/admin/fix-mojibake-text | requireAdmin | `?apply=1` to write (default dry-run) | `{mode, note, results{scanned, candidateCount, sample, applied?}}` | when `apply=1`: updates `partners.name/description`, `organizations.name`, `events.name/partnerName` |
| POST /api/admin/migrate-frames | requireAdmin | none | `{message, migrated[]}` | updates `frames` (adds missing `frameId`) |
| GET /api/admin/settings/card-display | requireAuth + isGlobalAdminSession | none | card-display settings `{settingId:'card-display', metadata{}, status{}, actions{}, updatedAt?, updatedBy?}` (defaults merged) | none |
| PATCH /api/admin/settings/card-display | requireAuth + isGlobalAdminSession | body `{metadata?, status?, actions?}` (each must be an object; unknown keys pass through the merge) | the merged settings doc | upserts the single `admin_settings` doc (`settingId:'card-display'`, `updatedBy` = caller email) |
| POST /api/admin/submissions/[submissionId]/archive | requireAdmin | path ObjectId | `{message, submission}` | updates `submissions` (`isArchived:true`, archivedAt/By) |
| POST /api/admin/submissions/[submissionId]/restore | requireAdmin | path ObjectId | `{message, submission}` | updates `submissions` (unarchive) |
| GET /api/admin/tryon-analytics | requireAuth + isGlobalAdminSession | `?bucket&eventId&from&to` | analytics object (funnel, hourly, byPreset/Garment/Event) | none |
| GET /api/admin/tryon-analytics/export | requireAuth + isGlobalAdminSession | `?format=csv\|json&section&bucket&eventId&from&to` | CSV/JSON attachment | none |
| GET /api/admin/tryon-identities | requireAuth + isGlobalAdminSession | `?status=actionable\|reviewed\|all` | `{results[], total}` | none |
| PATCH /api/admin/tryon-identities/[submissionId] | requireAuth + isGlobalAdminSession | body `{action: mark_reviewed_unrecoverable\|correct_identity, userName?, userEmail?, reason?}` | `{submissionId, action}` | updates `submissions` (identity fields + classification metadata) |
| GET /api/admin/tryon-jobs | requireAuth + isGlobalAdminSession | `?status&search&offset&limit` | `{jobs[], pagination}` | none |
| POST /api/admin/tryon-jobs/[jobId]/cancel | requireAuth + isGlobalAdminSession | path jobId (status must be `queued` or `retry_wait`) | `{jobId, status:'cancelled', stage, recoveryAction:'cancel', cancelledBy, message}` (400 if the worker claimed it first — the `updateOne` filter is the race guard) | updates `tryonJobs` (status/stage `cancelled`, `error.code:'cancelled_by_admin'`, lease cleared); patches source `submissions` try-on state + `tryOnJobs.$.status` |
| POST /api/admin/tryon-jobs/[jobId]/reapply-result | requireAuth + isGlobalAdminSession | path jobId (job must be `done` with result) | `{jobId, resultSubmissionId, publicationStatus, ...}` | re-applies completion: writes `submissions` (result + source links) |
| POST /api/admin/tryon-jobs/[jobId]/rerun | requireAuth + isGlobalAdminSession | body `{setupId?}` (must be an active setup) | `{jobId(new), sourceJobId, oldResultArchived, ...}` | inserts `tryonJobs`; archives prior result submission as superseded; appends `tryonModerationEvents`; patches source submission try-on state |
| POST /api/admin/tryon-jobs/[jobId]/retry | requireAuth + isGlobalAdminSession | path jobId (status failed/retry_wait) | `{jobId, status:'queued', ...}` | resets `tryonJobs` doc to queued; patches source `submissions` try-on state |
| GET /api/admin/tryon-maintenance/audit | requireAuth + isGlobalAdminSession | none | `{garmentCatalogCount, unknownGarments{resultSubmissions[], jobs[]}, identity{placeholderTotal, sourceRecoverable, unrecoverable, reviewedUnrecoverable, unreviewedActionable}, moderationArchive{supersededMissingReason}, publicationLinks{doneJobsMissingResultSubmission, samples[]}, moderation{inconsistentCount}}` | none (read-only mirror of scripts/audit-tryon-data-integrity.ts; loads every `tryon_result` submission into memory) |
| POST /api/admin/tryon-maintenance/reconcile | requireAuth + isGlobalAdminSession | body `{dryRun?: bool (default true), limit?: 1..50 (default 10)}` | dry run: `{dryRun:true, scanned, jobs[{jobId, sourceSubmissionId, updatedAt}]}`; live: `{dryRun:false, scanned, created, updated, unchanged, failed, jobs[]}` | live run only: `applyCompletionFromJobResult` per `done` job with a result URL — writes `submissions` (result docs + source links), same path as the cron sync |
| GET /api/admin/tryon-results | requireAuth + isGlobalAdminSession | `?reviewStatus&archive&eventId&partnerId&suitId&offset&limit` | `{results[], pagination}` (joins source subs, jobs, suits, recent audit) | none |
| POST /api/admin/tryon-results/[submissionId]/approve | requireAuth + isGlobalAdminSession | body `{notes?}` | `{submissionId, reviewStatus:'approved', ...}` | updates `submissions` (approve/archive/publication link); appends `tryonModerationEvents`; may send user email (Resend) |
| GET /api/admin/tryon-results/[submissionId]/audit | requireAuth + isGlobalAdminSession | path ObjectId | `{submissionId, events[]}` (last 30) | none |
| POST /api/admin/tryon-results/[submissionId]/great | requireAuth + isGlobalAdminSession | body `{notes?, great?}` | `{..., isGreat}` | approve + `metadata.tryOnGreat`; same writes/email as approve |
| POST /api/admin/tryon-results/[submissionId]/pin-to-slideshow | requireAuth + isGlobalAdminSession | body `{slideshowId, pin?: bool (default true)}`; result and slideshow must share an event (a result with no event reference is rejected, fail-closed) | `{submissionId, slideshowId, pinned}` | `$addToSet`/`$pull` `slideshows.manualSubmissionIds` (+ `updatedAt`) |
| POST /api/admin/tryon-results/[submissionId]/reframe | requireAuth + isGlobalAdminSession | body `{frameId}` (must be an active frame) | `{submissionId, imageUrl, frameId, frameName, message}` | composites the raw result (`metadata.tryOnRawResultUrl` or current image) with the frame and uploads it (Blob/imgbb); updates result `submissions` (`imageUrl`, `finalImageUrl`, `deleteUrl`, `metadata.compositionEngine`, `metadata.tryOnRawResultUrl`); appends `tryonModerationEvents` (`reframe`); refreshes the source submission's publication link + try-on state |
| POST /api/admin/tryon-results/[submissionId]/reject | requireAuth + isGlobalAdminSession | body `{notes?}` | `{..., reviewStatus:'rejected'}` | updates `submissions` (reject/archive); `tryonModerationEvents` |
| POST /api/admin/tryon-results/[submissionId]/remove | requireAuth + isGlobalAdminSession | path ObjectId (must be a `tryon_result`) | `{submissionId, removed:true}` (500 if `deletedCount` is 0, in which case no audit event is written) | permanently `deleteOne`s the result `submissions` doc; appends `tryonModerationEvents` (`remove`); patches the source submission try-on state (`reviewStatus:'rejected'`, result cleared). Hosted image is not deleted |
| POST /api/admin/tryon-results/[submissionId]/remove-great | requireAuth + isGlobalAdminSession | path ObjectId | `{submissionId, isGreat:false}` | updates `submissions` metadata; `tryonModerationEvents` |
| POST /api/admin/tryon-results/[submissionId]/restore | requireAuth + isGlobalAdminSession | path ObjectId; only results whose `tryOnModerationArchive.reason` is `quality_rerun_superseded` (400 otherwise — a manual reject is never restored here) | `{submissionId, reviewStatus:'pending_review', archived:false}` | updates result `submissions` (back to `pending_review`, review/approval fields cleared, `$unset` archive + superseded metadata); appends `tryonModerationEvents` (`restore`); re-links + patches the source submission try-on state |
| POST /api/admin/tryon-results/[submissionId]/service | requireAuth + isGlobalAdminSession | body `{notes?}` | `{..., archiveBucket:'service', isService:true}` | updates `submissions` (service bucket); `tryonModerationEvents` |
| GET /api/admin/tryon-setups | requireAdmin | `?search&active=true\|false` | `{setups[]}` (active AND archived — unlike `listActiveTryOnSetups`) | none |
| POST /api/admin/tryon-setups | requireAdmin | body `{name (required), setupId?, description?, cameraId?, active?, isDefault?, rank?, defaultForGarmentTypes?, processingProfile?/processing_profile?, category?, sleeveLength?, pantLength?, resolution?, steps?, guidance?, showMask?, maskSharpness?, maskPadding?, detailBoost?}` (400 on duplicate setupId) | 201 `{setup}` | inserts `tryonSetups` |
| GET /api/admin/tryon-setups/[setupId] | requireAdmin | path = Mongo `_id` or `setupId` | `{setup}` | none |
| PUT /api/admin/tryon-setups/[setupId] | requireAdmin | partial body (same fields as POST; `config` is merged over the existing config, unknown config keys preserved) | `{setup}` | updates `tryonSetups` |
| POST /api/admin/tryon-setups/[setupId]/duplicate | requireAdmin | path = Mongo `_id` or `setupId` | 201 `{setup}` (`name` + " (copy)", fresh unique `setupId`, `isDefault:false`, `rank:0`) | inserts `tryonSetups` |
| GET /api/admin/tryon-suits | requireAdmin | `?page&limit&active&search` | `{suits[], pagination}` | none |
| POST /api/admin/tryon-suits | requireAdmin | multipart `file,name,...` or legacy JSON | 201 `{suit}` | inserts/upserts `leatherSuits`; multipart uploads to imgbb |
| GET /api/admin/tryon-suits/[leatherSuitId] | requireAdmin | path = Mongo `_id` or `leatherSuitId` | `{suit}` | none |
| PUT /api/admin/tryon-suits/[leatherSuitId] | requireAdmin | body `{name?, description?, assetVersion?, active?, garmentType?, sleeveStyle?}` | `{suit}` | updates `leatherSuits` |
| DELETE /api/admin/tryon-suits/[leatherSuitId] | requireAdmin | path id | 204 | deletes `leatherSuits` doc; `$pull`s id from `events.tryOn.allowedLeatherSuitIds` |
| GET /api/admin/tryon-worker-health | requireAuth + isGlobalAdminSession | none | `{worker, latestHeartbeat, runningJobs[]}` | none |
| PATCH /api/admin/users/[email]/role | requireAdmin | body `{role: user\|admin}` | `{success, message, email, role}` | external: PATCHes app role via SSO HTTP API (no local write) |
| PATCH /api/admin/users/[email]/status | requireAdmin | body `{isActive: bool, userType: real\|pseudo\|administrator}` | `{success, ..., submissionsUpdated}` | updates `submissions` (`cameraAccountDisabled` mirror or `userInfo.isActive`) |
| POST /api/admin/users/merge | requireAdmin | body `{pseudoEmail, realUserEmail, realUserId?}` | `{success, submissionsMerged, ...}` | updateMany `submissions` (re-attributes pseudo user's rows to real SSO user) |

Note: the first-edition scanner flagged `email-preview`, `fix-mojibake-text`, `migrate-frames`, `archive`, `restore`, `tryon-suits*` and `users/*` as `no_auth_marker` because it did not know `requireAdmin`; the vendored `scripts/fleet-audit-inventory.py` (2026-09-08) recognises it and flags no `/api/admin` route. All of them are admin-gated in code as listed.

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
| POST /api/e2e/bootstrap | production-guard + localhost-only + assertDisposableE2EDatabase | none | ids of seeded fixtures | inserts `partners`, `events`, `partnerUserAccess`, `submissions`, `slideshows`, `tryonJobs`, `tryonSetups` (E2E DB only) |
| POST /api/e2e/cleanup | production-guard + localhost-only + assertDisposableE2EDatabase | body `{e2eRunId?}` | `{deleted{...}}` | deletes E2E-tagged docs across the same collections |

## /api/events

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/events | requireAuth (global admin sees all; others scoped via listAccessiblePartnerIds) | `?page&limit&search&partnerId&active` | `{events[], pagination}` | none |
| POST /api/events | requireAuth; non-global-admin needs getPartnerScopedAccessForPartner(events, manager) | body `{name, partnerId, description?, eventDate?, location?, isActive?, logoUrl?, showLogo?, shortUrlSlug?, greatestHitsSlug?, tryOn?, notifications?, visualSettings?, sharePage?}` | 201 `{event}` | inserts `events` (inherits partner defaults) |
| GET /api/events/[eventId] | optionalAuth (public for active events; inactive needs getPartnerScopedAccessForEvent) + rate limit READ | path = Mongo `_id`, event UUID, or slug | `{event}` with populated `frames[].frameDetails` | none |
| PATCH /api/events/[eventId] | requireAuth + isGlobalAdminSession or getPartnerScopedAccessForEvent(manager) | partial event body incl. `customPages[]`, `tryOn`, slugs (dupe-checked) | `{event}` | updates `events` |
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
| POST /api/frames | requireAdmin | multipart `file (png/svg), name, description?, category?, isActive` | 201 `{frame}` | inserts `frames`; uploads to imgbb |
| GET /api/frames/[id] | requireAdmin | path Mongo `_id` | `{frame}` | none |
| PUT /api/frames/[id] | requireAdmin | body `{name?, description?, category?, isActive?}` | `{success}` | updates `frames` |
| DELETE /api/frames/[id] | requireAdmin | path Mongo `_id` | `{success}` | deletes `frames` doc |
| GET /api/logos | none | `?page&limit&active` | `{logos[], pagination}` (full docs) | none — see GAP-2 |
| POST /api/logos | requireAdmin | multipart `file, name, description?, isActive` | 201 `{logo}` | inserts `logos`; uploads to imgbb; sharp reads dimensions |
| GET /api/logos/[id] | none | path Mongo `_id` | `{logo}` | none — see GAP-2 |
| PUT /api/logos/[id] | requireAdmin | body `{name?, description?, isActive?}` | `{logo}` | updates `logos` |
| DELETE /api/logos/[id] | requireAdmin | path Mongo `_id` | 204 | deletes `logos` doc; `$pull`s assignments from `events.logos` |
| POST /api/upload-logo | requireAuth | body `{imageData (base64), name?}` | 201 `{imageUrl, thumbnailUrl, deleteUrl, imageId, fileSize, mimeType}` | uploads to imgbb (no DB write) |
| GET /api/hashtags | none (rate limit READ) | `?q&limit` | `{hashtags[], count}` | none |
| GET /api/go-short/[slug] | none (rate limit READ) | path slug | 302 to `/capture/[id]` or `/greatest-hits/[slug]` | none |

## /api/internal (service-to-service)

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| POST /api/internal/email/send | assertInternalMessmassSecret OR assertInternalFanmassSecret; rate limit INTERNAL_WRITE | body `{to, subject, html, text?, fromName?, fromLocalPart?}` (domain always Camera's verified domain) | `{sent, messageId?\|error?}` (200 even on soft failure) | external: sends email via Resend |
| GET /api/internal/fanmass/events | assertInternalFanmassSecret; rate limit INTERNAL_READ | `?all=true` | `{events[{eventId, name, partnerId, partnerName, messmassEventId, isActive, eventDate}]}` | none |
| GET /api/internal/fanmass/events/[eventId]/media | assertInternalFanmassSecret; rate limit INTERNAL_READ | `?since=<ISO>&limit` | `{eventId, media[{captureId, url, createdAt}]}` (originals only) | none |
| POST /api/internal/messmass/events | assertInternalMessmassSecret; rate limit INTERNAL_WRITE | body `{messmassEventId, eventName, eventDate?, messmassPartnerId?\|partnerId?}` | 201/200 `{event}` | idempotently inserts/links `events` (inherits partner defaults) |
| POST /api/internal/messmass/organizations | assertInternalMessmassSecret; rate limit INTERNAL_WRITE | body `{name, messmassOrganizationId?}` | 201/200 `{organization}` | upserts `organizations` |
| GET /api/internal/messmass/partners | assertInternalMessmassSecret; rate limit INTERNAL_READ | `?name&messmassPartnerId` | `{partners[]}` | none |
| POST /api/internal/messmass/partners | assertInternalMessmassSecret; rate limit INTERNAL_WRITE | body `{name, messmassPartnerId?, organizationId?, logoUrl?}` | 201/200 `{partner}` | upserts `partners` (link by messmass id, then name, then create) |
| POST /api/internal/messmass/sso-session | assertInternalMessmassSecret + forwarded access token re-verified against SSO (getUserInfo + getAppPermission); rate limit INTERNAL_WRITE | body `{accessToken, refreshToken?, expiresIn?}` | `{success, appRole}` + session cookie (403 `no_access` without app access) | mints a real `camera_session` for the verified user |
| POST /api/internal/savetheworld/events | assertInternalSavetheworldSecret; rate limit INTERNAL_WRITE | body `{savetheworldEventId, partnerId (camera partnerId), eventName, eventDate?}` | 201/200 `{event{..., created, mongoId, captureUrl}}` (`captureUrl` = `NEXT_PUBLIC_APP_URL/capture/<mongoId>`, null when the URL env is unset) | idempotently inserts `events` keyed on `savetheworldEventId` (inherits partner defaults via `inheritPartnerDefaults`) |
| POST /api/internal/savetheworld/partners | assertInternalSavetheworldSecret; rate limit INTERNAL_WRITE | body `{name, logoUrl?}` | 201/200 `{partner{..., created}}` | links by case-insensitive name (updating `logoUrl` if given) else inserts `partners` |
| GET /api/internal/savetheworld/pledges | assertInternalSavetheworldSecret; rate limit INTERNAL_READ | `?eventId=<Mongo _id or event UUID>&limit (default 12, max 60)` (no eventId → empty list) | `{pledges[{pledgeId, imageUrl, name, createdAt}], total}` — only `isShareVisible` originals with a `finalImageUrl`; `total` counts them regardless of `limit` (v12.3.33); never email/userInfo | none |
| POST /api/internal/tryon/complete | assertInternalTryOnSecret | body `{jobId, publicResultUrl, deleteUrl?, workerId?, processorMeta?}` | 201/200 `{jobId, sourceSubmissionId, resultSubmissionId, publicationStatus}` | applies completion: writes `tryonJobs` + `submissions` (result submission, source links) |
| GET /api/internal/tryon/complete | none needed (always 400 "requires POST") | — | 400 | none |
| POST /api/internal/tryon/sync | assertInternalTryOnSecret | body/query `{limit?, jobId?, status? (done\|retry_wait\|failed)}` | `{status, outcomes{scanned, created, updated, ...}}` | re-applies completions from stored job results (writes `submissions`) |
| GET /api/internal/tryon/sync | assertInternalTryOnSecret OR Vercel cron `Authorization: Bearer CRON_SECRET` (fails closed if unset) | query `{limit?, jobId?, status?}` | same as POST | same as POST |

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
| POST /api/slideshows/[slideshowId]/background-image | requireAuth + assertGlobalAdminOrPartnerEventAccess(manager) (skipped if slideshow's event doc can't be resolved — still requireAuth); rate limit UPLOAD | multipart `file` | 201 `{imageUrl, thumbnailUrl}` | uploads to imgbb; updates `slideshows.backgroundImageUrl` |
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
| POST /api/submissions | optionalAuth (public capture; anonymous allowed) + rate limit UPLOAD | body `{imageData (base64), frameId?, eventId?, eventName?, partnerId?, partnerName?, imageWidth?, imageHeight?, userInfo?, consents[]?, shareOptIn?, requestTryOn?/leatherSuitId?/tryOnSourceImageData?/setupId?/cameraId?/outfitBottomLeatherSuitId?}` | 201 `{submission, tryOn{requested, status, jobId, error}}` | uploads to imgbb (final + optional try-on source); inserts `submissions` with `isShareVisible: shareOptIn === true` (explicit opt-in checkbox in the capture UI, defaults unchecked; never inferred, never backfilled — try-on results still get `isShareVisible` from the moderation flow, not this field); may insert/dedupe `tryonJobs` + patch submission try-on state; validates try-on against event policy + `leatherSuits` |
| GET /api/submissions | requireAuth | `?page&limit` | `{submissions[], pagination}` (caller's own only) | none |
| PATCH /api/submissions/[submissionId] | optionalAuth — public FIRST write only; once `userInfo.collectedAt` exists, admin appRole required (camera#119) | body `{action: update_user_info\|finalize, userInfo{name,email}?}` | `{submissionId, action, emailResult}` | updates `submissions.userInfo`; on finalize may dispatch pending submission email (Resend) + metadata patch |
| DELETE /api/submissions/[submissionId] | requireAuth (owner or appRole admin/superadmin) | path ObjectId | `{message, deletedId}` | permanently deletes `submissions` doc (imgbb image not deleted) |

## /api/tryon

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/tryon/setups | requireAuth | `?cameraId?` | `{setups[], cameraPreference}` | none |
| POST /api/tryon/setups/[setupId]/use | TRYON_SETUP_SELECTION_SECRET (`x-camera-setup-secret`) OR requireAuth | body `{cameraId, updatedBy?, updatedByEvent?}` | `{cameraId, setupId, updatedAt}` | upserts per-camera setup preference |
| GET /api/tryon/suits | none | `?eventId?` (Mongo `_id`) | `{suits[]}` — projected fields only (id, name, description, previewUrl, garmentType, sleeveStyle) | none |

## /api/share, /api/observability

| Endpoint | Auth | Request | Response | Side effects |
|---|---|---|---|---|
| GET /api/share/[id]/download | none | path submission ObjectId + `?variant=` (must match a variant the event's share-page settings expose) | image bytes as attachment | external: fetches image from imgbb; no DB write |
| POST /api/observability/client-error | none | body `{digest?, message?, url?}` (fields clamped to 2KB) | `{ok:true}` | server-side structured log only (never persisted/reflected) |

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
- **/api/internal/*** — shared-secret service auth (messmass / fanmass / savetheworld / try-on worker / cron), the designed trust boundary; every `assertInternal*Secret` fails closed when its env var is unset; sso-session additionally re-verifies the token against SSO itself.
- **POST /api/tryon/setups/[setupId]/use** — dual-auth by design (service secret for kiosk automation, or a real session).
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
the `/api/admin/tryon-results/${id}/${action}` template (approve/reject/great/remove-great,
components/admin/TryOnResultModerationTable.tsx:89,101 and OldestVettingResultCard.tsx:31,43),
the `/api/admin/events/${eventId}/export` base + `/emails|/images`
(components/admin/EventExportControls.tsx:18), `encodeURIComponent(...)`
segments (gallery-upload, users/[email]/status) and env-configured URLs
(`/api/internal/tryon/complete` via scripts/verify-tryon-prereqs.ts:85 and
.env.example; `/api/internal/tryon/sync` via vercel.json cron) — and those
are NOT listed. `/api/e2e/{bootstrap,cleanup}` have callers only under
`tests/e2e/` and are test fixtures by design, not candidates. Nothing below
has been deleted; each line is the evidence that no code path reaches it.

| Route | Evidence | Note |
|---|---|---|
| POST /api/admin/events/[id]/email-preview | `grep -rn "email-preview" app components lib` → only `app/api/admin/events/[id]/email-preview/route.ts`; 0 hits in messmass/tryon/fanmass | no admin UI calls the preview; template validation happens on the events edit page client-side |
| POST /api/admin/migrate-frames | `grep -rn "migrate-frames" app components lib scripts` → route file + `scripts/migrate-frames-add-frameId.ts:12,15` (the CLI, which does not call the route) | one-off migration also performed lazily by `GET /api/frames` (GAP-1) |
| POST /api/admin/submissions/[submissionId]/archive | `grep -rnF "admin/submissions/${" app components lib` → 0; `grep -rn "archive" app/admin/submissions components/gds/SubmissionsInventoryList.tsx components/admin/RemoveSubmissionButton.tsx` → no fetch | the submissions gallery uses event/partner "remove" (hide) routes instead |
| POST /api/admin/submissions/[submissionId]/restore | same greps as `archive` → 0 (the only `/restore` caller is `components/admin/TryOnQueueTable.tsx:144`, which targets `tryon-results/[id]/restore`) | pairs with the unused `archive` |
| GET /api/admin/tryon-analytics | `grep -rn "tryon-analytics" app components lib` → only `components/admin/TryOnAnalyticsExportControls.tsx:25` (the `/export` sibling); `tests/e2e/tryon-analytics-smoke.spec.ts:18` is the sole caller | the analytics page renders server-side from `lib/tryon/analytics` directly |
| GET /api/admin/tryon-identities | `grep -rn "tryon-identities" app components lib` → only `components/admin/TryOnIdentityReviewTable.tsx:21` (the PATCH `[submissionId]` sibling) | the identity page renders server-side; only the PATCH is used |
| GET /api/admin/tryon-results/[submissionId]/audit | `grep -rnF "/audit" app components lib` → only `tryon-maintenance/audit` (`components/admin/TryOnMaintenanceConsole.tsx:94`) | the moderation table reads `recentAudit` joined into `GET /api/admin/tryon-results` instead |
| PATCH /api/partners/[partnerId]/toggle | `grep -rnF "/toggle" app components lib` → only `app/admin/events/[id]/frames/page.tsx:140` (frames toggle); 0 hits in siblings | partner activation is edited through `PATCH /api/partners/[partnerId]` `{isActive}` |
| GET /api/slideshows/[slideshowId]/next-candidate | `grep -rn "next-candidate" app components lib` → only the comment at `lib/slideshow/resolve-event.ts:5` | the player (`components/slideshow/SlideshowPlayerCore.tsx`) uses `/playlist` + `/played` |
| POST /api/internal/savetheworld/events | 0 hits in app/components/lib and in messmass/tryon/fanmass; the savetheworld repo (`/Users/Shared/Projects/savetheworld` @ 2239855) references only `/api/internal/savetheworld/pledges` (`src/lib/pledges/camera.ts:26`) | provisioning was presumably done once by hand; keep only if a future campaign will call it |
| POST /api/internal/savetheworld/partners | same evidence as `savetheworld/events` → 0 | as above |
