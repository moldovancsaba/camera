# What camera stores about a user, and for how long

Written for owner decision 243 (2026-10-10, issue 521 phase 2): **stop storing the IP address of every photo, and review the full device string.** It is the one place that lists what is kept about the people who use the capture pages, where, and for how long, so the privacy notice and the answers to a request can be checked against it. The plan and the other decisions are in [ANALYTICS_AUDIT.md](ANALYTICS_AUDIT.md); the anonymous journey recording has its own page, [JOURNEY_RECORDING.md](JOURNEY_RECORDING.md). Current code review: 2026-10-22. It does not verify production data or retention-job execution.

## The decision and what changed

| | Before | Now |
|---|---|---|
| IP address of a photo | stored with every photo (`metadata.ipAddress`), read by nothing | **not stored** |
| IP address of an editor's gallery upload | stored (`metadata.ip`) | **not stored** |
| Device of a photo | the full user agent (`metadata.deviceInfo`: model, system version, build, close to a fingerprint) | **only a device class** (`metadata.deviceClass`: `ios`, `android`, `desktop`, `unknown`), **a browser family** (`metadata.browserFamily`: safari, chrome, firefox, edge, samsung, opera, in-app, other; never a version) and the legacy `metadata.deviceType` made from the class; the user agent is read once from the request and **not kept** |
| Device of an editor's gallery upload | the editor's user agent (`metadata.device`) | **not stored** (the photo was not taken by a user) |

`lib/device/coarse.ts` makes the class and the family; `app/api/submissions/route.ts` stores them. The Analytics Devices figure keeps working for old and new photos: it reads `deviceClass`, and for a photo taken before the change it classifies the stored user agent when it reads it (`lib/analytics/facts.ts`).

**Nothing stored was deleted or rewritten.** The photos taken before this change still hold the IP address and the user agent they were saved with. They are read by nothing but the Devices figure (the user agent). What to do with them is the owner's decision: `npx tsx scripts/count-stored-photo-addresses.ts` counts them by event and prints the update that would remove them. It is **read only** (it has no apply). Removing the user agents should wait until `metadata.deviceClass` has been written from them, or the Devices figure turns those photos into "not recorded".

## What is kept about a user

| What | Where | Holds | Kept |
|---|---|---|---|
| The photo | `submissions` | the picture, the event, the frame and message chosen, how it was taken, the framing, sizes, the times, the review decisions; account identity when signed in, or the explicit `NO USER` marker when not registered; the name and e-mail **if the user gave them** (the Who-are-you page or a sign-in); the device class and browser family (new photos) | until the photo is removed |
| Full-frame original | Vercel Blob, private EU Cloudflare R2, and ImgBB; `camera_original_assets` tracks capture state and `submissions.imageCopies` records verified provider copies | The source camera JPEG before crop/frame. Camera does not acknowledge the event submission until Blob, R2, and ImgBB each read back the expected bytes. R2 is private; Blob is addressed by an unguessable public URL; ImgBB is a public third-party host. Provider delete keys and links are not returned to browsers. | An unattached original is retained for up to 24 hours for retry, then cleanup removes all three copies. An attached original is retained with its submission and removed by submission deletion or privacy erasure. |
| The unframed photo (the crop the user saved, before the frame) | a private Vercel Blob object while the review crop is retained, plus a verified ImgBB copy when mirroring succeeds; both locations are tracked on the submission in `imageCopies` | Current image-safety jobs copy missing images between Blob and ImgBB and verify the copied bytes. **They do not delete either source copy.** ImgBB is a public third-party host: anyone with the address may open its file, and the host may remove it. The dual-copy check improves availability but is not a private, independent offsite backup. Deleting a submission requests removal of all recorded copies; a failed remote deletion must be retried. The promised 90-day post-event retention/deletion is not implemented as an automatic job. |
| The framed picture | `submissions` (`imageUrl`), in the Blob store and, when the mirror worked, on ImgBB (its address and delete link are now recorded in `imageCopies`); the Image safety card also makes a second copy of a picture that existed in one place only (an extra file in our store under `rescue/`, or an ImgBB upload) | the picture the public sees (the frame is on it) | until the photo is removed (every recorded copy is deleted with it) |
| Fanmass analysis and human correction | Fanmass-owned per-photo result and boxes in the pipeline database; human correction/confirmation audit in `submissions.fanmassAnalysisReview` | Fanmass analyzes one eligible photo at a time and stores the per-photo result, structured properties and image-relative boxes. Authorized event reviewers see and correct/confirm that same result in Camera's Photo analysis page. Corrections are tied to source revision and analysis generation; Camera does not maintain a parallel manual annotation dataset. No face identity matching is part of the Camera result contract. See [FANMASS_RESULTS_IN_CAMERA.md](FANMASS_RESULTS_IN_CAMERA.md). | until the source photo and corresponding pipeline record are removed under retention |
| Rejection reason | `submissions.rejectReasons` and `reviewHistory` | structured reason keys and optional reviewer note for publication moderation. These describe why the photo was rejected, not who appears in it. | with the submission |
| Consents | on the photo, `consents[]` | the page, exact checkbox text and link, the sentence read, whether it was accepted (including an optional checkbox left unticked), and the time | with the photo while consent remains valid |
| Registration | `email_registrations` | the event, e-mail, name, first and last seen, whether the welcome e-mail went (only for events that send it) | until removed |
| The anonymous journey | `journey_daily`, `journey_events` | fixed event/key counts, anonymous step transitions, upload outcome/duration bands and coarse device/method categories; no IP address, retained user agent, account identity or photo | raw rows 30 days; daily counts and completed-duration sum/sample aggregates indefinitely |
| SSO completion analytics | `journey_daily`, `journey_events` | provider and bounded callback outcome category only; no account, token, raw error or provider response | raw rows 30 days; aggregate counts indefinitely |
| Source-to-photo attribution | `submissions.metadata.sourceLinkSlug` | tracked-link slug validated against the event's link record; no arbitrary query string | with the photo submission |
| Visits to a tracked link | `short_link_hits` | a count per link, day and kind of phone (`android`, `iphone`, `other`); bots and previews are not counted | for good |
| Camera diagnostics | log lines only (`camera.capture_diagnostic`) | a random id of the page visit, the camera mode, timings, sizes, **the user agent cut at 200 characters**; no IP address, name, e-mail, image or cookie. Not stored in the database | the log service's retention |
| Screen diagnostics | log lines only (`camera.slideshow_diagnostic`) | the same kind of record from the giant screens | the log service's retention |
| A crash of a page | log line (`/api/observability/client-error`) | the error, the address of the page, the user agent | the log service's retention |
| People who manage the service | `activity_log` | who did what and when, the outcome; **no IP address, no request body** | until the weekly export after the one that sent it |
| A signed-in session | `web_sessions` | the session payload of a signed-in person | until it expires |
| SSO elapsed-flow continuity | browser `sessionStorage` | event-scoped capture start timestamp only, used to span the SSO page reload; no visit ID or identity | until the final configured page, six-hour expiry/reset, or the tab is closed |

The Analytics all-events repeat cohort groups existing photo submitter account/e-mail values in memory for a report and returns only counts to global admins. It does not create a stored cross-event identity map or join identities to anonymous Journey rows. The source slug is a narrow attribution field on the submission and should be included in the photo's normal deletion lifecycle.

## Camera → Fanmass image analysis

Camera remains the authority for consent, identity, retention, and human
vetting. It does not create a Fanmass queue record, call Fanmass, transfer image
bytes through a Camera API, or store Fanmass's machine-analysis result. Fanmass
independently reads eligible Camera Atlas records with a least-privilege
read-only source role, then owns its queue, local image copy, analysis, boxes,
retry state, and privacy cleanup in its own pipeline database.

Only eligible, consented submissions with a usable image can be discovered.
If the event requires vetting, the submission must be approved first. A
submission awaiting required identity is marked for 24-hour erasure and is
excluded from vetting, publication, and Fanmass analysis. Consent withdrawal,
source deletion, retention expiry, or later ineligibility must be reconciled by
Fanmass and remove its per-photo result and derived/local copies. That cleanup
is implemented in Fanmass, but production operation still requires the
least-privilege Atlas configuration and a verified end-to-end deletion run;
the Camera Atlas/Fanmass processing path must not be treated as live until that
operational gate is complete. See [the integration contract](MESSMASS_FANMASS_INTEGRATION.md)
and the Fanmass `docs/CAMERA_ATLAS_QUEUE_CONTRACT.md` for the exact source
projection, queue, privacy, and recovery contract.

Camera treats a missing or unverifiable consent audit as **no consent**. A
status-less legacy submission is reconciled to `received` only when it has a
complete, timestamped consent record that satisfies the event's required
checkboxes. A submission marked `received` with a missing or malformed audit is
treated the same way. Otherwise it stays out of vetting, publication, analytics
processing, and Fanmass; the next cleanup pass erases it without a 24-hour
wait. A new submission with no saved consent audit is immediately due for that
cleanup. The separate 24-hour deadline applies only when the submission has an
explicit pending-consent state. Cleanup deletes the image copies and removes
contact, consent, review, and analysis data. The database keeps a minimal
`expired` tombstone to count the automatic deletion; it does not keep the user's
identity. Failed file deletion remains private and is retried by the cleanup
job.

Verified subject requests use the separate case-bound resolver described in
[ERASURE_SUBJECT_RESOLVER.md](privacy/ERASURE_SUBJECT_RESOLVER.md). That endpoint
returns exact Camera references only; it is not a deletion receipt and does not
prove removal from media providers, product projections, logs, or backups.

The follow-on erasure intake and worker are documented in
[CAMERA_RECORD_ERASURE.md](privacy/CAMERA_RECORD_ERASURE.md). Once a verified
case hands Camera exact photo references, Camera first fences each submission
from reads and new writes, then replaces its identifying source row with a
minimal tombstone. A successful source-row scrub is only the Camera database
stage; provider copies, Fanmass results, Messmass projections, and retained
backups require their own confirmed deletion stages before the overall case can
be marked complete. The restricted deletion receipt keeps only authenticated-
encrypted image locations and provider delete handles for the separate media
worker; it does not copy participant contact, consent, review or analysis data.
An isolated Camera-database replay procedure is in
[RESTORE_REPLAY_RUNBOOK.md](privacy/RESTORE_REPLAY_RUNBOOK.md); passing it does
not certify Fanmass, Messmass, a whole-cluster restore, or authorize traffic release.

## The IP address, everywhere it still appears

- **The rate limiter** (`lib/api/rateLimiter.ts`) uses the IP address to count requests. It keeps it **in the memory of the server instance** (a bucket per path and address, cleared after an hour) or, when Upstash is configured, **as a SHA-256 hash** (`lib/api/upstash-rate-limit.ts`). It is not written to the database.
- **The hosting platform** (Vercel) sees every request and keeps its own request logs with addresses. That is the platform's, not camera's, and not something the application can switch off.
- **Old photos** hold what they were saved with (above).
- Nothing else in `lib` or `app` reads or writes an IP address (checked by a search of the sources for `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip` and `ipAddress` on 2026-10-11).

## Still to decide (the owner)

1. What to do with the IP addresses and user agents of the photos taken before this change: leave them, or remove them (after the classes are written, for the user agents).
2. The wording of the privacy notice (the audit's step F): this page is the list it must match.
3. The erase flow covering the journey records (they hold no person, so it has nothing to erase for one user; the photo's own erase flow is unchanged).
