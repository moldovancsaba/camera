# Try-on integration: what existed, why it was removed, how to rebuild it as an add-on

**Issue:** [camera #557](https://github.com/moldovancsaba/camera/issues/557) (owner answer 294, 2026-10-10).
**Last commit that still has the integration:** git tag `tryon-integration-final` (commit `db3424b`, camera 12.3.41).

The owner's decision, in his words: "we want to fully rid of try-on from these parts, that should be a simple add-on/plugin not a deeply integrated part of the system, I need you to remove it completely, document it and we will rebuild the connection from scratch."

Try-on (a guest picks a garment on the capture page, an AI worker dresses the guest's photo in it, an approver vets the result, the result reaches the share page and the slideshows) was switched off on every event on 2026-09-30, its worker is stopped and its cron is gone. It is nevertheless woven through 296 tracked files of this app (appendix A). This document is the record that lets the code be deleted and the connection be built again from scratch: it says what the integration was (section 3), what it left in the database (section 5), what looked like try-on but is used by other features and had to be moved, not deleted (section 6), and what a rebuild as an add-on needs from the core (section 7).

**Everything below describes the code at the tag, not the code on `main`.** Where this document says "the route does X", read "the route did X at the tag".

## 1. Rules of the removal

- **Nothing changes for any guest, event or approver.** Try-on is off on every event, so each step is a deletion of unreachable code, with one exception that is called out in section 6 (a few behaviours that depended on try-on being a possibility, for example a share page of a guest who once asked for a try-on).
- **Nothing is deleted from the database.** `tryon_result` submissions, `Submission.tryOnRequest`, `tryOn*` fields and the try-on collections stay where they are, unreferenced and never public (section 5). Deleting them is a separate decision.
- **A stored `tryon_result` submission is never public on any surface after the removal.** The plain-photo rule (`submissionKind` missing or `original`) already excludes it; unit tests keep that for every public surface that was touched.
- **The separate try-on repository and service are not touched.** Camera and that repository shared the `tryon_jobs` collection and a completion webhook (section 3.3); the repository keeps its own contract documents (`docs/TRYON_ATLAS_CONTRACT.md` lives there, camera never had a copy).
- Phases, each one pull request (tracker: issue 557):

| Phase | Scope | Status |
|---|---|---|
| R0 | This inventory, the tag, this document | merged (PR 564) |
| R1 | Admin: pages, menu, settings panels, admin API routes, tests, action vocabulary. The cross-event photo vetting page moves out of `/admin/tryon/vetting` first (section 6): it is `/admin/vetting` now, the old address and the messmass link to it are redirected | merged (PR 568) |
| R2 | Server: `lib/tryon`, internal routes, e-mails, share page and download, visibility rule, wall, slideshow clauses, vetting hold, scripts. **Kept for R3 because `POST /api/submissions` (the guest path) still imports it:** `lib/tryon/{enqueue-for-submission, jobs, suits, setup-resolution, prompts, hash, time}`, the test support `sync.fake-db.ts`, `GET /api/tryon/suits` and the suit selector | merged (PR 574) |
| R3 | Guest path: suit selector, try-on fields of `POST /api/submissions`, journey texts, and with them the last of `lib/tryon` and `GET /api/tryon/suits`. **Not merged until after the match of 2026-10-16** (it changes the page every guest uses); browser evidence in section 3.14 | built, held |
| R4 | Types and indexes of what no code uses any more (the type for stored fields stays), environment variables, remaining docs, board cards. The schema and index parts that the held guest path still needs (`Event.tryOn`, `Submission.tryOnRequest`, the job, setup and garment types, their indexes) go with R3 | merged (PR 575) |

## 2. How to read the old code

```
git fetch origin tag tryon-integration-final
git show tryon-integration-final:lib/tryon/completion.ts      # one file
git ls-tree -r --name-only tryon-integration-final -- lib/tryon app/api/admin | grep -i tryon
git worktree add ../camera-tryon-old tryon-integration-final  # the whole tree, read-only
git diff tryon-integration-final main --stat -- lib/tryon      # what the removal changed
```

Paths in this document are paths at the tag. The file-by-file list of every place that mentioned try-on is in appendix A.

## 3. What existed

### 3.1 The parts and who talked to whom

```
guest (capture page)                         admin (global admin)
   |  suit picker, GET /api/tryon/suits         |  /admin/tryon/*  pages, /api/admin/tryon-* routes
   v                                            v
POST /api/submissions ------------------> camera (Next.js on Vercel) <------ GET/POST /api/tryon/setups[/id/use]
   |  photo saved as submission                 |   lib/tryon/*                (event editor, kiosks)
   |  + tryOnRequest on it                      |
   |  enqueueTryOnForSubmission                 |   MongoDB Atlas  (collections of 3.2)
   v                                            |
tryon_jobs  <---- claimed and written directly by ---- try-on worker (separate repo, Python, on a Mac)
   (queue in the shared database)                          |  renders, uploads result (Vercel Blob / imgbb)
                                                           v
camera  POST /api/internal/tryon/complete  <---- signed callback (x-camera-tryon-secret)
   |  creates the derived submission (submissionKind 'tryon_result'), pending review
   v
admin vetting (approve / reject / service / great) -> share page, slideshows, e-mails, Greatest Hits page
```

- **Camera** owned capture, the source submission, the garment catalog, event policy, the queue documents, the derived result submission, moderation and publication. It ran **no worker process**.
- **The try-on worker** (repository `try-on`, `scripts/tryon_queue_worker.py`, configured by that repository's `.env.tryon-worker.example`) polled Atlas, claimed `tryon_jobs` documents itself (lease, heartbeat in `tryon_worker_heartbeats`), rendered, uploaded the picture and called camera back. A TypeScript worker that used to live in camera was deleted in v12.3.39.
- **image.direct** (separate repository and service) was the planned replacement renderer. Camera got a callback route and some job fields for it; the dispatcher was never built and the callback stayed disabled (section 3.12).
- The two services shared the database. That sharing (the worker writing camera's `tryon_jobs` documents directly) is the main thing the rebuild should not repeat (section 7).

### 3.2 Collections and fields

**Collections** (constants in `lib/db/schemas.ts` `COLLECTIONS`, indexes in `lib/db/ensure-indexes.ts`):

| Collection | Written by | What it holds |
|---|---|---|
| `leather_suits` | admin garment pages, `scripts/seed-tryon-suits.ts` | The garment catalog (`LeatherSuit`): `leatherSuitId`, `name`, `garmentType` (`motorsport_suit`, `jersey`, `top`, `bottom`), `sleeveStyle` (`sleeveless`, `short_sleeve`, `long_sleeve`), `assetKey`, `assetVersion`, `imageUrl`, `thumbnailUrl`, `previewUrl`, `sourceImageUrl`, `active`, `usageCount`. The legacy "leather suit" names are kept in the schema; the admin and guest UI said "Garment" |
| `tryon_jobs` | camera (enqueue), the worker (everything after), admin recovery routes | The queue (`TryOnJob`): `jobId` (`job_<14 digits>_<8 hex>`), `requestHash` (unique, sha256 of submission, garment, pipeline version, setup, outfit bottom, prompt snapshot hash), `status`, `stage`, `pipeline` (`motogp_leather_magic`), `source` (submission id, image URL, camera id, event ids, partner, user), `request` (garment id, `setupId`, `rerunOfJobId`, garment type and sleeve snapshot, `outfitBottomLeatherSuitId`, `promptSnapshot`), `processing` (worker id, claim, lease, attempts, `nextAttemptAt`, `resolvedSetup`), `result` (public URL, delete URL, provider), `error`, and for image.direct `renderer` and `imageDirect` |
| `tryon_setups` | admin setup pages, a seeded legacy fallback `default_motogp` | Processing presets (`TryOnSetup`): `setupId`, `name`, `cameraId`, `active`, `isDefault`, `rank`, free `config` (profile, category, sleeve length, steps, guidance, mask options), `promptConfig` (version, positive, negative prompt), `defaultForGarmentTypes` |
| `camera_setup_preferences` | `POST /api/tryon/setups/{id}/use` | Which setup a physical camera (`cameraId`) uses (`TryOnSetupPreference`), with who set it |
| `tryon_moderation_events` | every moderation and rerun route | Immutable audit of each decision (`TryOnModerationEvent`): action (`approve`, `reject`, `service`, `great`, `remove_great`, `rerun`, `reframe`, `restore`, `remove`), before and after snapshot, actor e-mail, result, source and job ids, notes |
| `tryon_worker_heartbeats` | the worker only; camera only read it | `workerId`, `lastHeartbeatAt`, `currentJobId`, `enabled`; feeds the "Worker online / stale / offline / idle" status |

**Fields on `submissions`** (`Submission` in `lib/db/schemas.ts`):

- On the **source** (the guest's own photo): `tryOnRequest` (`SubmissionTryOnRequestState`: `requested`, `status` among `not_requested`, `awaiting_approval`, `requested`, `source_uploaded`, `queued`, `claimed`, `processing`, `uploading_result`, `notifying_camera`, `retry_wait`, `done`, `failed`, `deduplicated`, `enqueue_failed`, `cancelled`; garment id; job id; source and result URLs; review, share and slideshow flags; last error), `tryOnJobs` (`SubmissionTryOnLink[]`, the jobs and result submissions linked back), `photoReview.tryOn` (the request held while the photo waits for approval, section 3.8).
  **Every submission saved by `POST /api/submissions` carried a `tryOnRequest` object and an empty `tryOnJobs` array**, also when no try-on was asked for (`requested: false`, `status: 'not_requested'`). Old documents therefore have these fields everywhere.
- On the **derived result**: `submissionKind: 'tryon_result'` (plain photos carry `'original'`, or nothing on old ones), `sourceSubmissionId`, `sourceJobId`, `tryOnLeatherSuitId`, `tryOnPipeline`, `tryOnPipelineVersion`, `reviewStatus`, `isShareVisible`, `isSlideshowEligible`, `tryOnModerationArchive` (`archived`, `bucket` of `approved`, `rejected`, `service`, reason `approved`, `manual_reject`, `service_photo`, `quality_rerun_superseded`, archive and superseded stamps), and `metadata.tryOnGreat`, `metadata.tryOnService` (with `At` and `By`), `metadata.tryOnRawResultUrl` (the worker's unframed picture, kept when camera composed the event frame onto it), `metadata.tryOnSupersededByRerun` (with job id, time, reason), `metadata.tryOnIdentityClassification`, `metadata.emailSentAfterTryOnResubmissionApproved`, `metadata.compositionEngine` values `motogp_leather_magic` and `motogp_leather_magic_framed`.
  The derived document copied event, partner, consents and identity from the source and got `submissionId` `<source submissionId>__<jobId>`.

**Fields on `events`** (`Event` in `lib/db/schemas.ts`; section 3.9 says what each did): `tryOn` {`enabled`, `setupId`, `allowedLeatherSuitIds`, `outfitEnabled`, `applyFrameToReturnedResults`, `vettingEnabled`, `localAiQualityGateEnabled`, `includeApprovedResultsInSlideshows`, `resultSlideshowMode`}, `sharePage` {`includeTryOnResult`, `includeFramedTryOnResult`, `includeCheckedInTryOnResult`, `pendingTryOnMessage`}, `notifications` {`submissionResultEmailSendAfterTryOnResubmissionApproved`, `...SubjectAfterTryOnResubmissionApproved`, `...BodyAfterTryOnResubmissionApproved`, and the related-photos trio, section 3.8}, `greatestHitsSlug`.
There was **no partner-level try-on setting** (`lib/partners`, the partner API and the partner pages do not mention try-on); the settings were on the event only.

**Other documents:** `slideshows` {`submissionSourceMode` (`originals_only`, `approved_tryon_only`, `originals_and_approved_tryon`), `manualSubmissionIds` (hand-pinned results; the only writer was the pin route)}; `admin_settings` document `card-display` (`AdminCardDisplaySettings`: which elements the Vetting moderation card shows: garment name, great badge, service, rerun controls, pin to slideshow, and so on); `events.photoVetting` is photo vetting, not try-on, and stays.

### 3.3 The contract between camera and the worker

- **Queue:** the worker read and updated `tryon_jobs` directly in Atlas. Camera created a document with status `queued`, stage `queued`, `processing.attemptCount: 0`, `processing.nextAttemptAt: now`.
- **Statuses:** `queued`, `claimed`, `processing`, `uploading_result`, `notifying_camera`, `retry_wait`, `done`, `failed`, `cancelled`. **Stages:** `queued`, `claimed`, `downloading_input`, `resolving_suit`, `running_tryon`, `uploading_result`, `uploaded_result`, `notifying_camera`, `done`, `failed`, `cancelled`.
- **Active queue** (what the dashboard counted, `lib/tryon/queue-status.ts`): `queued`, `claimed`, `processing`, `uploading_result`, `notifying_camera`, `retry_wait`; `done` and `failed` were history (the older prose in `TRYON_OPERATIONS.md` leaves `notifying_camera` out; the code includes it). Worker-owned: `claimed`, `processing`, `uploading_result`, `notifying_camera`.
- **Lease and retry** (helpers in `lib/tryon/jobs.ts`, written for the in-repo worker and kept as the reference for the external one): a claim set `processing.workerId`, `claimedAt`, `leaseExpiresAt`; `recoverStaleTryOnJobs` moved expired leases to `retry_wait`; retry delay 5 minutes after the first attempt, 30 minutes after the second, none after; a second `provider_timeout` was terminal.
- **Failure codes** (`classifyTryOnFailure`): retryable `provider_rate_limited`, `provider_timeout`, `result_upload_failed`, `transient_network_error`; terminal `invalid_suit`, `invalid_source_image`, `processing_failed`.
- **Completion webhook:** `POST /api/internal/tryon/complete`, header `x-camera-tryon-secret: <CAMERA_TRYON_INTERNAL_SECRET>` (or `Authorization: Bearer`, constant-time compare, fail closed, bare 403), body `{ jobId, publicResultUrl, deleteUrl?, workerId?, processorMeta?: { pipelineVersion? } }`. `publicResultUrl` had to be a direct image URL on `*.ibb.co` or `*.public.blob.vercel-storage.com` (`normalizeImgbbDirectUrl`). Answer 201 for a new result, 200 for an update.
- **What completion did** (`applyTryOnCompletion`, `lib/tryon/completion.ts`):
  1. Load the job and its source submission and the source event's `tryOn` policy.
  2. Decide the review state. Normal case: `pending_review`, not share-visible, not slideshow-eligible. If the event had `tryOn.vettingEnabled === false` the result was approved and share-visible at once (`approvedBy: 'system:auto-vetting-disabled'`) and slideshow-eligible when the event's slideshow mode was not `disabled`. **A rerun job (`request.rerunOfJobId` or a `::rerun:` request hash) always went to pending review**, as did every image.direct callback (`forcePendingReview`).
  3. Compose the asset: when `tryOn.applyFrameToReturnedResults` was on and the source photo had a `frameId` (or a generated frame variant, `frameVariant`), camera downloaded the worker's picture and the frame image and composed them (`lib/tryon/frame-composition.ts`, `sharp`), uploaded the result with a preview (`composition engine motogp_leather_magic_framed`) and kept the raw URL in `metadata.tryOnRawResultUrl`. On any failure it published the raw picture, or kept the current framed one when the same raw output was re-applied.
  4. Mark the job `done`/`done`, store the result URL, clear the error.
  5. Insert or update the derived `tryon_result` submission, keyed by `sourceJobId`; update the source's `tryOnRequest` and `tryOnJobs` link (`upsertSubmissionTryOnPublicationLink`).
  6. Call `dispatchPendingRelatedEmailForSubmission` (the "related photos are ready" e-mail, section 3.8).
- **Backstop:** `GET|POST /api/internal/tryon/sync?status=done|retry_wait|failed&limit=N` re-applied completions the webhook missed. The derived `tryon_result` document is the "applied" marker (`lib/tryon/sync.ts`). A Vercel cron called it every 5 minutes with `Authorization: Bearer <CRON_SECRET>`; the cron entry was removed from `vercel.json` in v12.3.40 and is gone. Manual call: service secret header.
- **Camera never wrote the render itself.** Everything between "queued" and "result URL" was the worker's.

### 3.4 Setup resolution and prompts

- At submit time `enqueueTryOnForSubmission` chose the setup: the request's own `setupId`, else the setup whose `defaultForGarmentTypes` contained the garment's type, else `event.tryOn.setupId` (only when the request had no `cameraId`).
- The worker side resolution (`resolveTryOnSetupForJob`, `lib/tryon/setup-resolution.ts`; after the in-repo worker was deleted only its unit tests call it, it stays the reference for the external worker): job-assigned setup, then the camera's preference (`camera_setup_preferences`), then the active global default (`isDefault`, no `cameraId`), then the seeded legacy setup `default_motogp`. The winner was recorded as `processing.resolvedSetup.setupSource` (`job.assigned`, `camera.last`, `global.default`, `legacy`).
- **Prompt snapshots:** a setup's `promptConfig` (positive up to 6000 characters, negative up to 4000, a version number) was copied into the job as an immutable `request.promptSnapshot` with a sha256 over `{setupId, version, positive, negative}`; an operator could override it for one rerun (`source: 'operator_rerun_override'`). Guests could not send prompts.
- **Outfits:** an event with `tryOn.outfitEnabled` let a guest pick a `top` and a `bottom`; `request.outfitBottomLeatherSuitId` made the job a two-piece job (two sequential renders). The server checked the types (top first, bottom second) and that both were in the event's allowlist.

### 3.5 Moderation of results

Admin only (global admin), routes under `/api/admin/tryon-results/{submissionId}/...`. Every action wrote a `tryon_moderation_events` entry first.

| Action | Effect |
|---|---|
| `approve` | `reviewStatus: approved`, `isShareVisible: true`, `isSlideshowEligible` per the event's slideshow mode, archive bucket `approved`; could send the "update" e-mail for an approved rerun result |
| `reject` | `rejected`, hidden, bucket `rejected` |
| `service` | `rejected`, bucket `service` (a picture kept for operations, never public) |
| `great` / `remove-great` | `metadata.tryOnGreat`, approved bucket; "Greatest Hits" = approved + great |
| `pin-to-slideshow` | add or remove the result id in `slideshows.manualSubmissionIds` (same-event guard) |
| `reframe` | recompose the event frame onto the raw picture |
| `remove` / `restore` | remove a result (its stored files, the source's link) and bring a superseded one back; a result could not be deleted through `DELETE /api/submissions/{id}` (409), only through `remove` |
| `audit` | GET the audit events of one result |
| job `retry`, `rerun`, `cancel`, `reapply-result` | recovery: requeue a failed job, clone a job (optionally with another setup or an override prompt; the previous result was superseded as `quality_rerun_superseded`), cancel, re-apply a done job's result |

Archive buckets for the lists: `approved`, `rejected`, `service`, `greatest`, `superseded`. A result in the active queue was `tryOnModerationArchive.archived !== true` and `reviewStatus: pending_review`.

### 3.6 Admin routes and pages (all global admin unless noted)

| Route | Methods | Caller |
|---|---|---|
| `/api/admin/tryon-results` | GET | vetting page (filters `reviewStatus`, `archive`, `eventId`, `partnerId`, `suitId`, paging max 100) |
| `/api/admin/tryon-results/{id}/approve, reject, service, great, remove-great, pin-to-slideshow, reframe, remove, restore, audit` | POST (audit GET) | vetting cards (`TryOnResultModerationTable`, `OldestVettingResultCard`) |
| `/api/admin/tryon-jobs`, `.../{jobId}/retry, rerun, cancel, reapply-result` | GET / POST | queue and vetting pages |
| `/api/admin/tryon-suits`, `/{leatherSuitId}` | GET POST / GET PUT DELETE | garment pages (admin, not only global) |
| `/api/admin/tryon-setups`, `/{setupId}`, `/{setupId}/duplicate` | GET POST / GET PUT / POST | setup pages |
| `/api/admin/tryon-analytics`, `/export` | GET (csv or json) | analytics page |
| `/api/admin/tryon-identities`, `/{submissionId}` | GET / PATCH | identity clean-up page |
| `/api/admin/tryon-maintenance/audit`, `/reconcile` | GET / POST | maintenance page |
| `/api/admin/tryon-worker-health` | GET | dashboard, hub |
| `/api/admin/settings/card-display` | GET PUT | "card display" settings page (the Vetting card's elements) |

Pages: `/admin/tryon` (hub "Operations"), `/admin/tryon/queue`, `/admin/tryon/vetting`, `/admin/tryon/analytics`, `/admin/tryon/identity`, `/admin/tryon/maintenance`, `/admin/tryon/suits` (+ `new`, `[id]/edit`), `/admin/tryon/setups` (+ `new`, `[id]/edit`); the legacy aliases `/admin/tryon-results` and `/admin/tryon-suits` (redirects); event tabs `/admin/events/{id}/vetting` (photo vetting on top, try-on results below for global admins), `/queue` and `/analytics` (thin wrappers around the pages above); the settings panel in the event editor (`/admin/events/{id}/edit`, `/admin/events/new`); the "Try-on e-mails" section of `/admin/events/{id}/emails`; the slideshow editor's source-mode radio; the card display settings page; dashboard cards (queue, worker health, vetting count) in `AdminDashboardView`; the events list "Vetting" count (`pendingTryOnVettingCount`); the event overview's "AI Try-ons" counts and "Greatest Hits Public Page" block. Menu entries in `lib/adminNavigation.ts` (Operations: "Operations", "Maintenance"; Libraries: "Garments", "AI Setups"; event menu: "Queue", "Analytics", the "Vetting" description) and the tour step `admin-nav-tryon`. Action vocabulary packs in `lib/gds/camera-admin-vocabulary.ts`: `tryon`, `tryon-moderation`, `garments`, `tryon-setups`, `tryon-maintenance`.

### 3.7 Public and internal routes

| Route | Methods | Auth | Caller |
|---|---|---|---|
| `/api/tryon/suits` | GET | none (public) | the capture page's `TryOnSuitSelector`; the event editors (`?eventId=` limited the list to the event's allowlist) |
| `/api/tryon/setups` | GET | admin | event create and edit pages (setup dropdown) |
| `/api/tryon/setups/{setupId}/use` | POST | admin session, or header `x-camera-setup-secret` = `TRYON_SETUP_SELECTION_SECRET` | event editors; automation switching which setup a physical camera uses |
| `/api/internal/tryon/complete` | POST | `CAMERA_TRYON_INTERNAL_SECRET` | the try-on worker |
| `/api/internal/tryon/sync` | GET POST | `CRON_SECRET` Bearer (cron) or `CAMERA_TRYON_INTERNAL_SECRET` | the removed cron; manual |
| `/api/internal/image-direct/complete` | POST | `CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN` (+ `_PREVIOUS` for rotation) and `CAMERA_IMAGE_DIRECT_CALLBACK_ENABLED=true` | image.direct worker; never enabled |
| `/greatest-hits/{slug}` | page | none | public grid of an event's approved, great try-on results (`events.greatestHitsSlug`, a short slug the event API checked against other events and tracked short links) |

### 3.8 How other features treated try-on results

- **Photo vetting (the hold).** A guest's photo on an event with photo vetting waits `pending_review`. If the guest had chosen a garment, `POST /api/submissions` stored the request on the pending submission (`photoReview.tryOn`, `tryOnRequest.status: 'awaiting_approval'`) and answered with `tryOn.status: 'awaiting_approval'`; the waiting screen added a sentence ("Your try-on picture will be made after that", text key `approval.tryOn`). On approval `approvePhoto` (`lib/photo-vetting/review.ts`) called `enqueueTryOnForSubmission` with the held request and the photo bytes; on rejection the request was marked `cancelled`. The vetting queue showed "Try-on: after approval" (`tryOnRequested`).
- **The one visibility rule** (`lib/submissions/visibility.ts`): a plain photo is public unless `pending_review` or `rejected`; a `tryon_result` was public only when `reviewStatus === 'approved'` and `isShareVisible !== false`. `publiclyVisibleClauses` (the MongoDB form used by the slideshow routes) had the same two branches. Surfaces that read it: share page and its link preview, share download, slideshow candidates, user pages, feeds, the welcome-screen photo picker.
- **Slideshows.** `submissionSourceMode` on the slideshow and `event.tryOn.resultSlideshowMode` (`disabled`, `mixed_with_originals`, `approved_results_only`) decided whether approved results entered the playlist: `resolveSubmissionSourceModeForSlideshow` let the **event's policy win** (an event with try-on disabled always gave `originals_only`, whatever the slideshow said); playlist clauses added `tryon_result` + `approved` + `isSlideshowEligible`; `manualSubmissionIds` added pinned results (still checked for review state). `next-candidate` had the same clause.
- **Walls and feeds that excluded try-on.** `lib/savetheworld/wall.ts`, `publishSelfies.ts`, the pledge wall route, `lib/fanmass/media-feed.ts` and the welcome-photo picker filtered `submissionKind: { $ne: 'tryon_result' }` so a generated picture never reached a fan wall or an external feed; the photo vetting rollout report (`lib/photo-vetting/rollout.ts`) and `scripts/send-today-submission-emails.ts` leave them out of their counts and sends the same way.
- **Share page and download** (`app/share/[id]/page.tsx`, `app/api/share/[id]/download/route.ts`, `lib/tryon/share-page-variants.ts`, `listApprovedShareVariants`): the page could show several "variants": camera result, original capture, the approved try-on result, the framed try-on result, the "checked-in" try-on result (the first approved one, shown first). **If the source submission had `tryOnRequest.requested`, the page forced `includeOriginalCapture` and `includeCameraResult` off and showed only the checked-in try-on result, or the event's `pendingTryOnMessage` ("We are processing your image. Come back later.") while none was approved.** Share-page settings: `includeTryOnResult` (default true), `includeFramedTryOnResult` (default true), `includeCheckedInTryOnResult` (default false), `pendingTryOnMessage`.
- **E-mails** (`lib/email/*`). Three modes: `after_save` (the approved e-mail, stays), `after_related` ("related photos are ready") and `after_tryon_resubmission_approved` (an update after an approved rerun). `evaluateSubmissionShareReadiness` decided "ready" from the share-page settings: with the defaults it required an approved try-on result to exist. `after_related` was sent from the completion route and from the approve and great routes, and also tried after save when the event had it on (default off). The event emails page had a "Try-on e-mails" section for the two older modes (shown only for events with `tryOn.enabled`). The five e-mail types of epic 463 (`welcome`, `arrived`, `approved`, `declined`, `followUp`) have no try-on part.
- **Export.** The event image export (CSV and ZIP) listed originals, finals and derived try-on results.
- **Delete.** `lib/submissions/delete-files.ts` also removed the try-on source file (`tryOnRequest.sourceImageUrl`, `sourceDeleteUrl`); `DELETE /api/submissions/{id}` refused a `tryon_result`.
- **Messmass, fanmass, savetheworld.** New events provisioned by messmass and savetheworld were created with `tryOn: { enabled: false, ... }`. The fanmass media feed and the savetheworld wall excluded try-on results as above.
- **Activity log.** `/api/tryon` was one of the management path prefixes the activity log recorded (`lib/activity/log.ts`).

### 3.9 Settings of an event (what each did)

| Field | Meaning |
|---|---|
| `tryOn.enabled` | Master switch: the capture page showed the garment picker, the server accepted a request, the slideshow mode could be non-`disabled`. Off on every event since 2026-09-30 |
| `tryOn.setupId` | Default setup for the event (ignored when the request had a `cameraId`) |
| `tryOn.allowedLeatherSuitIds` | Allowlist for the picker and the server check; empty meant all active garments |
| `tryOn.outfitEnabled` | Top plus bottom pairing; also the no-deploy kill switch of that feature |
| `tryOn.applyFrameToReturnedResults` | Compose the event frame onto returned results |
| `tryOn.vettingEnabled` | Results need a human decision (default true); false auto-approved them |
| `tryOn.localAiQualityGateEnabled` | A planned local AI pre-screen. Stored, edited in the event editor and shown in the event overview; no camera code acted on it |
| `tryOn.includeApprovedResultsInSlideshows`, `tryOn.resultSlideshowMode` | Whether approved results joined the slideshows (the mode is the current field, the boolean the legacy mirror) |
| `sharePage.*TryOn*`, `pendingTryOnMessage` | Share page content, section 3.8 |
| `notifications.*AfterTryOnResubmissionApproved*` and the related-photos fields | The two older e-mails |
| `greatestHitsSlug` | The public Greatest Hits page address |

### 3.10 Guest-facing pieces

- **Capture page** (`app/capture/[eventId]/page.tsx`): when `event.tryOn.enabled`, a `TryOnSuitSelector` (garment drop-down with preview from `/api/tryon/suits`, and a second drop-down for a bottom when `outfitEnabled` and a top was chosen) sat between the photo and the save buttons (pinned layout so a tall selector never pushed the buttons off screen, issue 222). On save the page added `requestTryOn: true`, `leatherSuitId`, `outfitBottomLeatherSuitId` and, for an unvetted photo, `tryOnSourceImageData` (the unframed photo as a data URL) to the body of `POST /api/submissions`; a vetted photo sent no source, the server kept it. The response's `tryOn` object (`requested`, `status`, `jobId`, `error`) fed the `ShareOverlay` notice ("Try-on queued", job id, or "was not queued"). The older, event-less page `app/capture/page.tsx` showed the selector always (it is a legacy page).
- **Server** (`app/api/submissions/route.ts`): `normalizeTryOnRequest` accepted `leatherSuitId` / `leather_suit_id`, `requestTryOn` / `request_try_on`, `tryOnSourceImageData` / `try_on_source_image_data`, `setupId`, `cameraId`, `outfitBottomLeatherSuitId`; wrote the `tryOnRequest` block on every submission; either held the request (vetted photo) or called `enqueueTryOnForSubmission` after the answer was built. `enqueueTryOnForSubmission` never threw: it checked the event policy (`try_on_not_enabled_for_event`, `leather_suit_not_allowed_for_event`, `outfit_not_enabled_for_event`, `outfit_top_type_required`, `outfit_bottom_type_mismatch`), uploaded the source photo to image storage, built the prompt snapshot, inserted or found the job by `requestHash` (deduplication) and linked it to the submission; on failure it recorded `enqueue_failed` on the submission.
- **Texts:** i18n keys `share.tryOn.*`, `approval.tryOn`, `tryon.*` (garment labels, selector texts, hints), `sharePage.pendingTryOn`, `sharePage.tryOn*` in `lib/i18n/messages.en.ts` and `messages.hu.ts`; catalog group `tryon` in `lib/i18n/catalog.ts`.

### 3.11 Environment variables, scripts, crons, tests

**Environment variables (names only):**

| Name | Use |
|---|---|
| `CAMERA_TRYON_INTERNAL_SECRET` | Worker to camera: completion and sync |
| `TRYON_SETUP_SELECTION_SECRET` | Optional service secret for `.../setups/{id}/use` |
| `CRON_SECRET` | Vercel cron auth. **Still used by the two remaining crons** (`/api/internal/activity-export`, `/api/internal/pictures-scan`); it must stay |
| `IMAGE_DIRECT_INTEGRATION_URL`, `IMAGE_DIRECT_INTEGRATION_TOKEN` | Planned camera to image.direct dispatch; no code read them |
| `CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN`, `CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN_PREVIOUS`, `CAMERA_IMAGE_DIRECT_CALLBACK_ENABLED`, `IMAGE_DIRECT_RESULT_ALLOWED_HOSTS` | image.direct completion callback |
| `TRYON_SUIT_SEED_FILE` | Garment seed file for `npm run tryon:seed-suits` (default `config/leather-suits.example.json`) |

**Owner step, after R4 is live:** delete these variables from the Vercel project if they are set there: `CAMERA_TRYON_INTERNAL_SECRET`, `TRYON_SETUP_SELECTION_SECRET`, `IMAGE_DIRECT_INTEGRATION_URL`, `IMAGE_DIRECT_INTEGRATION_TOKEN`, `CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN`, `CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN_PREVIOUS`, `CAMERA_IMAGE_DIRECT_CALLBACK_ENABLED`, `IMAGE_DIRECT_RESULT_ALLOWED_HOSTS`. Keep `CRON_SECRET`. The separate try-on repository keeps its own copy of the shared secret; nothing there is touched. No code in camera reads any of the eight any more (they are gone from `.env.example` and from `docs/_audit/env.json`); Playwright and `scripts/run-e2e-safe.ts` no longer set `CAMERA_TRYON_INTERNAL_SECRET` either (R2).

**Scripts** (`package.json` entries `tryon:*` and the files in `scripts/`): `seed-tryon-suits`, `verify-tryon-prereqs`, `reframe-tryon-results`, `reconcile-tryon-done-jobs`, `backfill-tryon-result-identity`, `report-unrecoverable-tryon-identities`, `apply-tryon-identity-corrections`, `audit-tryon-data-integrity`, `backfill-tryon-superseded-archive-reason`, `enable-tryon-frame-composition`, `verify-tryon-hash-regression`. Three scripts that are not try-on scripts touch it: `backfill-preview-image-urls.ts` imports helpers from `lib/tryon`, `send-today-submission-emails.ts` has an `--include-tryon` flag and a `submissionKind` filter, and `migrate-event-email-body-defaults.ts`, a one-off that overwrote the legacy e-mail body of every event with the default body (a "MotoGP Leather Magic" text for MotoGP events); it was deleted in R4 together with its two `db:migrate-email-body-defaults` entries.

**Crons:** none left. The `*/5 * * * *` sync cron was removed in v12.3.40 (`vercel.json` now holds only the weekly activity export and the daily picture scan).

**Tests** (deleted with the code they cover): unit tests under `lib/tryon/*.test.ts`, `components/admin/TryOnResultModerationTable.test.tsx`, the route tests for `admin/tryon-jobs/cancel`, `admin/tryon-results/remove` and `pin-to-slideshow`, `internal/tryon/sync`, `internal/image-direct/complete`, `tryon/setups` and `tryon/setups/{id}/use`; try-on cases inside the e-mail, share-page-settings, visibility, share-lookup, photo-vetting, slideshow, submissions and delete-files tests; the e2e specs `tests/e2e/tryon-analytics-smoke`, `tryon-policy`, `tryon-rerun-lifecycle`, `tryon-unpin-from-slideshow` and parts of `admin-smoke` and `event-exports`; the e2e bootstrap route seeded a try-on job, setup and result.

### 3.12 image.direct (planned replacement, never live)

Built on the camera side: the callback route (`/api/internal/image-direct/complete`, `lib/tryon/image-direct-callback.ts`), the `renderer` and `imageDirect` job fields, immutable prompt snapshots, the setup-owned prompts. Not built: the dispatch and outbox, a per-event renderer switch, per-job consent and input hashes, reconciliation. The callback was default-off and `CAMERA_IMAGE_DIRECT_CALLBACK_ENABLED` was never set to true. The contract (payloads, state mapping, consent, SSRF rules, rollback) is `docs/IMAGE_DIRECT_INTEGRATION.md`, kept as the design record. The image.direct service itself lives in its own repository.

### 3.13 What R2 changed in behaviour (the places other features used)

- **The one visibility rule** (`lib/submissions/visibility.ts`) has no try-on branch: a plain photo (`submissionKind` missing or `original`) is public unless pending or rejected, anything else never is. `plainPhotoClause` is the same rule for queries, and the slideshow candidates, the playlist, the welcome-screen picker and the admin gallery use it; the feeds (fanmass, walls, publish selfies) keep their `$ne: 'tryon_result'` guards. Unit tests keep a stored `tryon_result` off the share page and its link preview, the share download, the playlist, the next-candidate query, the welcome picker, the gallery and the feeds.
- **The share page** shows the photo and its download (`<id>:camera-result`) and the "Create your own" button; the switches that chose between the photo, the original capture and the try-on pictures, the pending try-on message and the "related photos" heading are gone (`includeCameraResult` is no longer a choice: a photo page without its photo made no sense once there were no try-on pictures to show instead). A guest who once asked for a try-on gets the same page as everyone else.
- **E-mails:** the result e-mail has one mode, after the photo is saved; `after_related`, `after_tryon_resubmission_approved`, the share-readiness check and their settings fields are gone. The e-mail is on when the approved e-mail is (before, a stored switch of one of the two older e-mails also kept it "on").
- **Events and slideshows:** the event API no longer reads or writes `tryOn` or `greatestHitsSlug` (stored values stay; a save through the editors writes `sharePage` and `notifications` without the removed try-on keys), new events are created without a `tryOn` object (also those provisioned by messmass and savetheworld), the slideshow API ignores `submissionSourceMode`, `/greatest-hits/{slug}` and the go-short redirect to it are gone.
- **Photo vetting:** approval no longer queues a held try-on request and rejection no longer cancels one; the response of the review route has no `tryOn`.
- **Tests and fixtures:** the dev-only e2e bootstrap seeds an "export" event with two plain photos instead of a try-on job and result.

### 3.14 What R3 changed in behaviour (the guest path; held until after 2026-10-16)

- **Capture page** (`app/capture/[eventId]/page.tsx`): no suit selector, no state for it, no `GET /api/tryon/suits` request, and the save sends none of `requestTryOn`, `leatherSuitId`, `outfitBottomLeatherSuitId`, `tryOnSourceImageData`, `setupId`, `cameraId`. An old event that still stores `tryOn.enabled = true` shows exactly the page of an event without try-on. The "photo is waiting for the related pictures" notice and the try-on status on the share overlay are gone.
- **Legacy `/capture` page** (`app/capture/page.tsx`, no event): it always showed an "Optional try-on" card with the suit selector, whatever the event settings said (there was no event to ask), and the server then queued a job without the event-policy check. The card is gone, so this path can no longer queue anything.
- **`POST /api/submissions`:** no `normalizeTryOnRequest`, no `tryOnRequest` or `tryOnJobs` on the stored submission, no `photoReview.tryOn`, no `tryOn` in the answer, no events lookup for the try-on policy. An open page from before the release may still send the old fields: they are ignored (unit test), and the answer carries no try-on state.
- **Texts:** the `tryon.*`, `share.tryOn.*`, `approval.tryOn` and `flow.email.waitingRelated` keys and the catalog group `tryon` are gone; the waiting message of a vetted event is the owner's text or the default, with no sentence added. `/api/tryon` is no longer a prefix of the admin activity log.
- **Deleted with it:** `components/tryon/TryOnSuitSelector.tsx`, `app/api/tryon/suits/route.ts`, the rest of `lib/tryon` (`enqueue-for-submission`, `jobs`, `suits`, `setup-resolution`, `prompts`, `hash`, `time`, `sync.fake-db.ts` and their tests) and `config/leather-suits.example.json`. `lib/tryon` no longer exists.
- **Schema tail (types that only the guest path needed):** `Event.tryOn`, the `tryOnRequest` state and status, `photoReview.tryOn`, `tryOnJobs` and the whole try-on collections section (garment, job, setup, prompt, setup preference and job link types) are gone from `lib/db/schemas.ts`, with the collection names `leather_suits`, `tryon_jobs`, `tryon_setups`, `camera_setup_preferences` and the creation of their indexes (`ensure-indexes.ts`). `Submission.tryOnRequest` stays as a small tolerant type with the two URLs, because deleting a submission still removes the files an old request stored (`lib/submissions/delete-files.ts`). The `.gitleaks.toml` allowlist entry for garment asset keys went with `config/leather-suits.example.json`. The existing indexes and collections stay in the database.
- **Evidence (before and after, the whole capture page in a browser, API faked in the page, fake camera; phone 390 x 844 with touch and desktop 1280 x 800):** for an event without try-on, a vetted event, an event that still stores `tryOn.enabled`, an event that asks the gallery permission and the Hungarian page, the camera step, the reframe step and the saved step have the same elements at the same places and the same words (80 of 80 checks), the Continue button and the page fit the screen with no sideways scroll, the save sends the same fields without the try-on ones, and the selector is on the old page for the old event and not on the new one.

## 4. Documents that described the integration

At the time of the removal these described the integration and now carry a banner pointing here and to the tag: `docs/TRYON_ARCHITECTURE.md`, `docs/TRYON_LOW_LEVEL_DESIGN.md`, `docs/TRYON_OPERATIONS.md`, `docs/TRYON_ANALYTICS.md`, `docs/IMAGE_DIRECT_INTEGRATION.md`. `docs/TRYON_ADMIN_GUIDE.md` and `docs/TRYON_RECOVERY_RUNBOOK.md` described screens and recovery steps for a worker that no longer runs and were deleted in R0 (read them at the tag). Mentions of try-on in other documents are removed in the phase that removes the thing they describe, and in R4 for what is left (appendix A lists them).

## 5. What the removal leaves in the database

Nothing is dropped. After the removal these exist and are read by nothing (except that the plain-photo rule keeps them off every public surface):

- Collections: `leather_suits`, `tryon_jobs`, `tryon_setups`, `camera_setup_preferences`, `tryon_moderation_events`, `tryon_worker_heartbeats`. Camera stops creating the indexes of `tryon_moderation_events` and of the try-on fields of `submissions` in R4 (`tryon_moderation_events_eventId_unique`, `..._result_createdAt`, `..._action_createdAt`, `submissions_sourceSubmission_review_createdAt`, `submissions_tryonModerationArchive_createdAt`, `submissions_sourceJobId_unique`), and those of `tryon_jobs`, `leather_suits`, `tryon_setups` and `camera_setup_preferences` in R3. The existing indexes stay in the database; dropping them is part of the separate cleanup decision below.
- Submissions: documents with `submissionKind: 'tryon_result'` (the derived pictures; their image files on imgbb or Vercel Blob are named `tryon-source-<ms>`, `tryon-framed-<ms>` and the worker's own result names, and stay too) and the `tryOn*`, `sourceJobId`, `sourceSubmissionId`, `tryOnModerationArchive`, `tryOnJobs`, `tryOnRequest`, `photoReview.tryOn` fields on all submissions, `metadata.tryOn*`.
- Events: `tryOn`, `sharePage.*TryOn*`, `notifications.*TryOn*`, `greatestHitsSlug`. Slideshows: `submissionSourceMode`, `manualSubmissionIds`. `admin_settings`: the `card-display` document.
- TypeScript types: R4 removed the types of what no code reads or writes (`TryOnModerationEvent` and its action and snapshot types, `TryOnWorkerHeartbeat`, `ImageDirectTryOnExecution`, the archive and identity types, `Submission.tryOnModerationArchive` and the other `tryOn*` result fields, the stored e-mail and share-page keys, `Slideshow.submissionSourceMode` and `manualSubmissionIds`, the two collection names). `submissionKind: 'tryon_result'`, `sourceSubmissionId`, `sourceJobId` stay typed because the visibility rule, the delete guard and the tests name them. The types the held guest path still compiled against (`Event.tryOn`, `Submission.tryOnRequest`, `tryOnJobs`, `photoReview.tryOn`, the job, setup and garment types) went with R3 (section 3.14), `tryOnRequest` stays as a small tolerant type. A stored field with no type is simply ignored by the code and kept by the database.
- **A stored `tryon_result` is never public afterwards.** The rule in `lib/submissions/visibility.ts` and `publiclyVisibleClauses` becomes "a photo whose `submissionKind` is missing or `original`"; the unit tests assert that an approved, share-visible `tryon_result` is not visible on any public surface, and that the feeds (fanmass, walls) still exclude it.
- **Not decided here:** deleting those documents, their image files and the collections (a separate owner decision with a dry run first), and removing the Vercel variables.

## 6. Things that looked like try-on but other features use

These are moved or rewritten, not deleted. Each is a place where "remove try-on" would have broken something else.

1. **`/admin/tryon/vetting` is also the cross-event photo vetting page.** Its header holds the event picker and the "photos waiting" card for global admins, the dashboard's "Vetting" card and the events list "Vetting" link point at it, and the vetting tab of every event embeds the same page component. Photo vetting itself (`EventPhotoVetting`, `WaitingPhotosCard`, `PhotoReviewQueue`, `/api/admin/submissions/{id}/review`) is not try-on. R1 first gives the cross-event page a new home and re-points the links; the old address keeps working as a redirect.
2. **`lib/tryon/frame-composition.ts` `fetchImageBuffer`** is used by the gallery frame and gallery upload routes, photo vetting approval and the screen-picture generator; `uploadPreviewVariant` by `scripts/backfill-preview-image-urls.ts`. They move to a neutral module.
3. **`lib/tryon/time.ts` `nowIso`** is used by the card-display and defaults-rollout settings routes and a script.
4. **`lib/tryon/dashboard-metrics.ts` `collectActiveEventRows` and `ActiveEventRow`** feed the admin dashboard's "Active events" strip; `pendingVettingCount` on the dashboard added try-on results to photos waiting.
5. **`lib/tryon/analytics.ts` `collectEventSpecificStats`** feeds the event overview (total submissions, unique e-mails, "clean customer e-mails") together with the "AI Try-ons" count; only the try-on count goes.
6. **`lib/tryon/slideshow-policy.ts`** is read by the playlist route and by the event API; its output for an event with try-on off is always `originals_only`.
7. **`lib/events/page-texts.ts` `approvalTexts(settings, tryOnChosen, ...)`** takes a "try-on chosen" flag; the waiting-message sentence disappears with it (R3, because the capture page passes it; done: `approvalTexts(settings, language, uiTexts)`).
8. **`app/admin/events/page.tsx`** counted pending try-on results per event for the events list.
9. **`lib/frame`, `lib/theme/css.ts`, `lib/security/safeEqual.ts`, `lib/fanmass/internal.ts`, `lib/messmass/internal.ts`, `components/camera/ReframeStep.tsx`**: comments only; reworded.
10. **Behaviours that depended on try-on being possible (a small, deliberate change for old data):**
    - A guest who once asked for a try-on has `tryOnRequest.requested: true`. Their share page showed only the try-on result or the "processing" message and hid the plain photo. After R2 their share page behaves like everyone else's (their plain photo, if approved).
    - The "related photos are ready" e-mail needed an approved try-on result in the default settings, so for an event that had it switched on and left the share settings at the defaults it could never be sent. It is removed with try-on (R2); it will not start sending.
    - The event editor's share-page switches for try-on pictures and the "Try-on e-mails" section disappear (R1).
    - Pinned and approved `tryon_result` documents (if any exist in production) leave the playlists and the Greatest Hits page; the page `/greatest-hits/{slug}` and the event field `greatestHitsSlug` are removed in R1/R2 (the slug stays in the data but nothing reads it).

## 7. What a rebuild as an add-on needs from the core (the seams)

The core should know nothing about garments, jobs, prompts or renderers. An add-on talks to it through a small set of seams that do not exist today:

1. **An add-on registry with per-event settings.** `event.addons.<id> = { enabled, ...settings }`, default off, one admin place to switch it on. (Today `event.tryOn` and four more fields in other settings objects.)
2. **A capture-journey extension point.** A step or a choice between the photo and the save, supplied by the add-on, whose answer travels as an opaque `addons.<id>` payload on the submission. (Today the garment picker is hard-wired into the capture page and `POST /api/submissions`.)
3. **Outbound events instead of a shared database.** The core sends "submission created", "submission approved" (with the picture URL, event, consent facts) to the add-on's registered URL, from a durable outbox, signed, idempotent. The add-on never reads or writes the core's collections. (Today the worker polled and wrote Atlas directly.)
4. **An inbound API for derived media.** `POST /api/addons/<id>/results` (signed, idempotent per source and add-on) creates a **derived item** linked to a source submission. The core stores it as a kind that no public surface shows by default; the core's own review/publish API is the only way to make it public (so the one visibility rule has one extra branch, defined once). (Today: completion creating a `tryon_result` submission that every surface special-cased.)
5. **Slots for extra pictures.** The share page, the e-mails and the slideshow playlist ask the registry for extra items of a submission instead of knowing try-on variants; the add-on decides what it offers, the core decides whether it may show it (approved, not archived, event setting). (Today: share-page variants and e-mail readiness written around try-on.)
6. **One review queue.** If derived items need a human decision, they appear in the existing vetting queue as a kind of item with approve and reject, instead of a second moderation system with its own archive buckets and audit collection. Or the add-on hosts its own moderation and only calls the core's publish API.
7. **Frame composition as a core service.** Applying the event's frame to an external picture (`applyFrameToTryOnResult`, `sharp`) as a function the core exposes, so the add-on does not copy the frame logic.
8. **Add-on credentials.** One service credential per add-on with rotation (current and previous), scoped to `/api/internal/addons/...`, constant-time compare, fail closed (the pattern of `checkSharedSecret` and the image.direct callback token).
9. **Admin and analytics contributions.** Either the add-on ships its own admin (preferred; no code in this app) or the core offers a menu entry and a statistics hook; counts such as "AI try-ons" come from the add-on.
10. **Consent and retention rules in the contract** (from the image.direct design): per-job consent to process and publish, allowed result hosts, what is kept and for how long, how withdrawal blocks new work.

Starting points to read at the tag: `docs/TRYON_ARCHITECTURE.md` and `docs/TRYON_LOW_LEVEL_DESIGN.md` (lifecycle and moderation), `docs/IMAGE_DIRECT_INTEGRATION.md` (a worked service-to-service contract with idempotency, consent and SSRF rules), `lib/tryon/completion.ts` (what a result must carry to enter the system), `lib/tryon/share-page-variants.ts` and `lib/email/submission-result-email.ts` (what the share page and e-mails needed from a result).

## Appendix A. Inventory: every tracked file that mentioned try-on (at the tag)

Found with a case-insensitive search for `try-on`, `try_on`, `tryon`, `tryOn`, `TryOn`, `leatherSuit` (and the file names). "delete" means the file is try-on only and goes whole; "edit" means the file stays and a try-on part goes; "text" means a comment or a sentence only. The generated listing follows. Phase letters are the phase that removes the item (section 1); R4 also sweeps the leftovers of R1 to R3.

### R1: admin (pages, menu, panels, admin API routes, components, action vocabulary, e2e tests) (89 files)

| File | Action |
|---|---|
| `app/admin/events/[id]/analytics/page.tsx` | delete |
| `app/admin/events/[id]/edit/page.tsx` | edit |
| `app/admin/events/[id]/emails/page.tsx` | edit |
| `app/admin/events/[id]/page.tsx` | edit |
| `app/admin/events/[id]/queue/page.tsx` | delete |
| `app/admin/events/[id]/vetting/page.tsx` | edit |
| `app/admin/events/new/page.tsx` | edit |
| `app/admin/events/page.tsx` | edit |
| `app/admin/page.tsx` | edit |
| `app/admin/settings/card-display/page.tsx` | edit |
| `app/admin/submissions/page.tsx` | edit |
| `app/admin/tryon-results/page.tsx` | delete |
| `app/admin/tryon-suits/page.tsx` | delete |
| `app/admin/tryon/analytics/page.tsx` | delete |
| `app/admin/tryon/identity/page.tsx` | delete |
| `app/admin/tryon/maintenance/page.tsx` | delete |
| `app/admin/tryon/page.tsx` | delete |
| `app/admin/tryon/queue/page.tsx` | delete |
| `app/admin/tryon/setups/[id]/edit/page.tsx` | delete |
| `app/admin/tryon/setups/new/page.tsx` | delete |
| `app/admin/tryon/setups/page.tsx` | delete |
| `app/admin/tryon/suits/[id]/edit/page.tsx` | delete |
| `app/admin/tryon/suits/new/page.tsx` | delete |
| `app/admin/tryon/suits/page.tsx` | delete |
| `app/admin/tryon/vetting/page.tsx` | delete |
| `app/api/admin/settings/card-display/route.ts` | edit |
| `app/api/admin/tryon-analytics/export/route.ts` | delete |
| `app/api/admin/tryon-analytics/route.ts` | delete |
| `app/api/admin/tryon-identities/[submissionId]/route.ts` | delete |
| `app/api/admin/tryon-identities/route.ts` | delete |
| `app/api/admin/tryon-jobs/[jobId]/cancel/route.test.ts` | delete |
| `app/api/admin/tryon-jobs/[jobId]/cancel/route.ts` | delete |
| `app/api/admin/tryon-jobs/[jobId]/reapply-result/route.ts` | delete |
| `app/api/admin/tryon-jobs/[jobId]/rerun/route.ts` | delete |
| `app/api/admin/tryon-jobs/[jobId]/retry/route.ts` | delete |
| `app/api/admin/tryon-jobs/route.ts` | delete |
| `app/api/admin/tryon-maintenance/audit/route.ts` | delete |
| `app/api/admin/tryon-maintenance/reconcile/route.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/approve/route.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/audit/route.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/great/route.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/pin-to-slideshow/route.test.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/pin-to-slideshow/route.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/reframe/route.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/reject/route.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/remove-great/route.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/remove/route.test.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/remove/route.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/restore/route.ts` | delete |
| `app/api/admin/tryon-results/[submissionId]/service/route.ts` | delete |
| `app/api/admin/tryon-results/route.ts` | delete |
| `app/api/admin/tryon-setups/[setupId]/duplicate/route.ts` | delete |
| `app/api/admin/tryon-setups/[setupId]/route.ts` | delete |
| `app/api/admin/tryon-setups/route.ts` | delete |
| `app/api/admin/tryon-suits/[leatherSuitId]/route.ts` | delete |
| `app/api/admin/tryon-suits/route.ts` | delete |
| `app/api/admin/tryon-worker-health/route.ts` | delete |
| `components/admin/EventExportControls.tsx` | text |
| `components/admin/EventPhotoVetting.tsx` | text |
| `components/admin/HourlyOutcomeChart.tsx` | delete |
| `components/admin/OldestVettingResultCard.tsx` | delete |
| `components/admin/PhotoReviewQueue.tsx` | edit |
| `components/admin/SlideshowEditor.tsx` | edit |
| `components/admin/TryOnAnalyticsExportControls.tsx` | delete |
| `components/admin/TryOnAnalyticsFilterForm.tsx` | delete |
| `components/admin/TryOnAnalyticsTables.tsx` | delete |
| `components/admin/TryOnFunnelChart.tsx` | delete |
| `components/admin/TryOnIdentityReviewTable.tsx` | delete |
| `components/admin/TryOnMaintenanceConsole.tsx` | delete |
| `components/admin/TryOnQueueTable.tsx` | delete |
| `components/admin/TryOnRerunPromptModal.tsx` | delete |
| `components/admin/TryOnResultModerationTable.test.tsx` | delete |
| `components/admin/TryOnResultModerationTable.tsx` | delete |
| `components/admin/TryOnSetupsInventoryList.tsx` | delete |
| `components/gds/AdminDashboardView.tsx` | edit |
| `components/gds/EventsInventoryList.tsx` | edit |
| `components/gds/SubmissionsInventoryList.tsx` | edit |
| `components/gds/TryOnSuitsInventoryList.tsx` | delete |
| `lib/admin/build-slideshow-editor-props.ts` | edit |
| `lib/adminNavigation.test.ts` | edit |
| `lib/adminNavigation.ts` | edit |
| `lib/gds/camera-admin-vocabulary.ts` | edit |
| `lib/tour/config/adminTourSteps.tsx` | edit |
| `tests/e2e/admin-smoke.spec.ts` | edit |
| `tests/e2e/event-exports.spec.ts` | edit |
| `tests/e2e/tryon-analytics-smoke.spec.ts` | delete |
| `tests/e2e/tryon-policy.spec.ts` | delete |
| `tests/e2e/tryon-rerun-lifecycle.spec.ts` | delete |
| `tests/e2e/tryon-unpin-from-slideshow.spec.ts` | delete |

### R2: server (lib/tryon, internal routes, e-mails, share page, visibility, slideshows, wall, vetting hold, scripts, unit tests) (128 files)

| File | Action |
|---|---|
| `app/api/admin/events/[id]/email-preview/route.ts` | edit |
| `app/api/admin/events/[id]/emails/route.test.ts` | edit |
| `app/api/admin/events/[id]/emails/route.ts` | edit |
| `app/api/admin/events/[id]/export/images/route.ts` | text |
| `app/api/admin/events/[id]/gallery-frame/route.test.ts` | edit |
| `app/api/admin/events/[id]/gallery-frame/route.ts` | edit |
| `app/api/admin/events/[id]/gallery-upload/route.test.ts` | edit |
| `app/api/admin/events/[id]/gallery-upload/route.ts` | edit |
| `app/api/admin/settings/defaults-rollout/route.ts` | edit |
| `app/api/admin/submissions/[submissionId]/review/route.test.ts` | edit |
| `app/api/admin/submissions/[submissionId]/review/route.ts` | edit |
| `app/api/e2e/bootstrap/route.ts` | edit |
| `app/api/e2e/cleanup/route.ts` | edit |
| `app/api/events/[eventId]/route.ts` | edit |
| `app/api/events/route.ts` | edit |
| `app/api/internal/email/send/route.test.ts` | edit |
| `app/api/internal/fanmass/events/[eventId]/media/route.ts` | text |
| `app/api/internal/image-direct/complete/route.test.ts` | delete |
| `app/api/internal/image-direct/complete/route.ts` | delete |
| `app/api/internal/savetheworld/events/[eventId]/publish-selfies/route.ts` | text |
| `app/api/internal/savetheworld/pledges/route.ts` | text |
| `app/api/internal/tryon/complete/route.ts` | delete |
| `app/api/internal/tryon/sync/route.test.ts` | delete |
| `app/api/internal/tryon/sync/route.ts` | delete |
| `app/api/share/[id]/download/route.ts` | edit |
| `app/api/slideshows/[slideshowId]/next-candidate/route.test.ts` | edit |
| `app/api/slideshows/[slideshowId]/next-candidate/route.ts` | edit |
| `app/api/slideshows/[slideshowId]/playlist/route.test.ts` | edit |
| `app/api/slideshows/[slideshowId]/playlist/route.ts` | edit |
| `app/api/slideshows/route.ts` | edit |
| `app/api/submissions/[submissionId]/route.test.ts` | text |
| `app/api/submissions/[submissionId]/route.ts` | edit |
| `app/api/tryon/setups/[setupId]/use/route.test.ts` | delete |
| `app/api/tryon/setups/[setupId]/use/route.ts` | delete |
| `app/api/tryon/setups/route.test.ts` | delete |
| `app/api/tryon/setups/route.ts` | delete |
| `app/greatest-hits/[slug]/page.tsx` | delete |
| `app/share/[id]/page.tsx` | edit |
| `app/users/[name]/page.tsx` | edit |
| `lib/activity/log.ts` | edit |
| `lib/email/event-emails.ts` | edit |
| `lib/email/notification-settings.ts` | edit |
| `lib/email/submission-result-email.test.ts` | edit |
| `lib/email/submission-result-email.ts` | edit |
| `lib/email/submission-template-defaults.test.ts` | edit |
| `lib/email/submission-template-defaults.ts` | edit |
| `lib/email/submission-template-preview.ts` | edit |
| `lib/email/triggers.test.ts` | edit |
| `lib/email/types.test.ts` | edit |
| `lib/email/types.ts` | edit |
| `lib/events/event-export.ts` | edit |
| `lib/events/share-page-settings.test.ts` | edit |
| `lib/events/share-page-settings.ts` | edit |
| `lib/fanmass/internal.ts` | text |
| `lib/fanmass/media-feed.test.ts` | edit |
| `lib/fanmass/media-feed.ts` | edit |
| `lib/frame/capture.ts` | text |
| `lib/frame/variants.ts` | text |
| `lib/messmass/internal.ts` | text |
| `lib/messmass/provision.ts` | edit |
| `lib/photo-vetting/queue.test.ts` | edit |
| `lib/photo-vetting/queue.ts` | edit |
| `lib/photo-vetting/review.test.ts` | edit |
| `lib/photo-vetting/review.ts` | edit |
| `lib/photo-vetting/rollout.ts` | edit |
| `lib/savetheworld/provision.test.ts` | edit |
| `lib/savetheworld/provision.ts` | edit |
| `lib/savetheworld/publishSelfies.ts` | edit |
| `lib/savetheworld/wall.ts` | edit |
| `lib/screen/welcome-photo.test.ts` | edit |
| `lib/screen/welcome-photo.ts` | edit |
| `lib/security/safeEqual.ts` | text |
| `lib/submissions/delete-files.test.ts` | edit |
| `lib/submissions/delete-files.ts` | edit |
| `lib/submissions/original-exposure.test.ts` | edit |
| `lib/submissions/original-image.test.ts` | text |
| `lib/submissions/screen-picture.ts` | edit |
| `lib/submissions/share-lookup.test.ts` | edit |
| `lib/submissions/share-lookup.ts` | edit |
| `lib/submissions/visibility.test.ts` | edit |
| `lib/submissions/visibility.ts` | edit |
| `lib/theme/css.ts` | text |
| `lib/tryon/analytics.ts` | delete |
| `lib/tryon/completion.test.ts` | delete |
| `lib/tryon/completion.ts` | delete |
| `lib/tryon/dashboard-metrics.ts` | delete |
| `lib/tryon/enqueue-for-submission.test.ts` | delete |
| `lib/tryon/enqueue-for-submission.ts` | delete |
| `lib/tryon/event-names.ts` | delete |
| `lib/tryon/frame-composition.ts` | delete |
| `lib/tryon/hash.ts` | delete |
| `lib/tryon/identity.ts` | delete |
| `lib/tryon/image-direct-callback.test.ts` | delete |
| `lib/tryon/image-direct-callback.ts` | delete |
| `lib/tryon/jobs.ts` | delete |
| `lib/tryon/moderation-audit.ts` | delete |
| `lib/tryon/prompts.test.ts` | delete |
| `lib/tryon/prompts.ts` | delete |
| `lib/tryon/publication.test.ts` | delete |
| `lib/tryon/publication.ts` | delete |
| `lib/tryon/queue-status.ts` | delete |
| `lib/tryon/setup-resolution.test.ts` | delete |
| `lib/tryon/setup-resolution.ts` | delete |
| `lib/tryon/share-page-variants.test.ts` | delete |
| `lib/tryon/share-page-variants.ts` | delete |
| `lib/tryon/slideshow-policy.ts` | delete |
| `lib/tryon/suits.ts` | delete |
| `lib/tryon/sync.fake-db.ts` | delete |
| `lib/tryon/sync.test.ts` | delete |
| `lib/tryon/sync.ts` | delete |
| `lib/tryon/time.ts` | delete |
| `lib/tryon/worker-health.ts` | delete |
| `scripts/apply-tryon-identity-corrections.ts` | delete |
| `scripts/audit-tryon-data-integrity.ts` | delete |
| `scripts/backfill-preview-image-urls.ts` | edit |
| `scripts/backfill-tryon-result-identity.ts` | delete |
| `scripts/backfill-tryon-superseded-archive-reason.ts` | delete |
| `scripts/enable-tryon-frame-composition.ts` | delete |
| `scripts/fleet-audit-inventory.py` | edit |
| `scripts/migrate-event-email-body-defaults.ts` | edit |
| `scripts/reconcile-tryon-done-jobs.ts` | delete |
| `scripts/reframe-tryon-results.ts` | delete |
| `scripts/report-unrecoverable-tryon-identities.ts` | delete |
| `scripts/run-e2e-safe.ts` | edit |
| `scripts/seed-tryon-suits.ts` | delete |
| `scripts/send-today-submission-emails.ts` | edit |
| `scripts/verify-tryon-hash-regression.ts` | delete |
| `scripts/verify-tryon-prereqs.ts` | delete |

### R3: guest path (capture page, suit selector, submissions route, texts) (13 files)

| File | Action |
|---|---|
| `app/api/submissions/route.test.ts` | edit |
| `app/api/submissions/route.ts` | edit |
| `app/api/tryon/suits/route.ts` | delete |
| `app/capture/[eventId]/page.tsx` | edit |
| `app/capture/page.tsx` | edit |
| `components/camera/ReframeStep.tsx` | text |
| `components/capture/ShareOverlay.tsx` | edit |
| `components/tryon/TryOnSuitSelector.tsx` | delete |
| `lib/events/page-texts.test.ts` | edit |
| `lib/events/page-texts.ts` | edit |
| `lib/i18n/catalog.ts` | edit |
| `lib/i18n/messages.en.ts` | edit |
| `lib/i18n/messages.hu.ts` | edit |

### R4: schemas, indexes, environment, configuration (11 files)

| File | Action |
|---|---|
| `.env.example` | edit |
| `.github/workflows/ci.yml` | text |
| `.gitleaks.toml` | text |
| `config/leather-suits.example.json` | delete |
| `gds-adoption.json` | edit |
| `lib/db/ensure-indexes.ts` | edit |
| `lib/db/schemas.ts` | edit |
| `next.config.test.ts` | text |
| `next.config.ts` | text |
| `package.json` | edit |
| `playwright.config.ts` | edit |

### Documents (R0 for the try-on documents, README, RUNBOOK, TECH_STACK and ROADMAP; the rest in the phase that removes the thing, and R4) (55 files)

| File | Action |
|---|---|
| `ARCHITECTURE.md` | edit |
| `HANDOVER.md` | edit |
| `LEARNINGS.md` | edit |
| `README.md` | edit |
| `RELEASE_NOTES.md` | edit |
| `ROADMAP.md` | edit |
| `RUNBOOK.md` | edit |
| `TECH_STACK.md` | edit |
| `docs/ANALYTICS_AUDIT.md` | edit |
| `docs/AUTHORIZATION.md` | edit |
| `docs/BUILDING_BRICKS.md` | edit |
| `docs/CAMERA_MODULE_PLAN.md` | edit |
| `docs/CAPTURE_MESSAGES.md` | edit |
| `docs/DEFAULT_FRAME_PLAN.md` | edit |
| `docs/DOCUMENTATION.md` | edit |
| `docs/ELEMENT_INVENTORY.md` | edit |
| `docs/EMAIL_FORMAT_PLAN.md` | edit |
| `docs/EMAIL_TEMPLATES.md` | edit |
| `docs/EVENT_EXPORTS.md` | edit |
| `docs/FRAME_LAYOUT_SELECTION_PLAN.md` | edit |
| `docs/GDS_CAMERA_ADOPTION.md` | edit |
| `docs/IMAGE_DIRECT_INTEGRATION.md` | banner (R0) |
| `docs/JOURNEY_DEFAULT_PAGES.md` | edit |
| `docs/LIBRARY_AUDIT.md` | edit |
| `docs/LOGO_STORAGE.md` | edit |
| `docs/MESSMASS_FANMASS_INTEGRATION.md` | edit |
| `docs/MONGODB_CONVENTIONS.md` | edit |
| `docs/PHOTO_VETTING_PLAN.md` | edit |
| `docs/SCREEN_DESIGN.md` | edit |
| `docs/SLIDESHOW_LOGIC.md` | edit |
| `docs/STORAGE_ARCHITECTURE.md` | edit |
| `docs/TEXT_LEVELS.md` | edit |
| `docs/TRYON_ADMIN_GUIDE.md` | delete (R0) |
| `docs/TRYON_ANALYTICS.md` | banner (R0) |
| `docs/TRYON_ARCHITECTURE.md` | banner (R0) |
| `docs/TRYON_LOW_LEVEL_DESIGN.md` | banner (R0) |
| `docs/TRYON_OPERATIONS.md` | banner (R0) |
| `docs/TRYON_RECOVERY_RUNBOOK.md` | delete (R0) |
| `docs/UI_LANGUAGE.md` | edit |
| `docs/WELCOME_AND_DEFAULTS_PLAN.md` | edit |
| `docs/_audit/api-reference.md` | edit |
| `docs/_audit/camera-in-the-fleet.md` | edit |
| `docs/_audit/contract-first-rule.md` | edit |
| `docs/_audit/docs.json` | edit |
| `docs/_audit/drift-register.md` | edit |
| `docs/_audit/endpoints.json` | edit |
| `docs/_audit/env.json` | edit |
| `docs/_research/SLIDESHOW_FREEZE_RESEARCH.md` | edit |
| `docs/_research/element-inventory/editors.json` | edit |
| `docs/_research/element-inventory/flow.json` | edit |
| `docs/_research/element-inventory/gds.json` | edit |
| `docs/_research/element-inventory/graphics.json` | edit |
| `docs/_research/element-inventory/model.json` | edit |
| `docs/_research/element-inventory/texts.json` | edit |
| `gds_fix_handover.md` | edit |

