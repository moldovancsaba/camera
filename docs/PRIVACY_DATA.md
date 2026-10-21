# What camera stores about a user, and for how long

Written for owner decision 243 (2026-10-10, issue 521 phase 2): **stop storing the IP address of every photo, and review the full device string.** It is the one place that lists what is kept about the people who use the capture pages, where, and for how long, so the privacy notice and the answers to a request can be checked against it. The plan and the other decisions are in [ANALYTICS_AUDIT.md](ANALYTICS_AUDIT.md); the anonymous journey recording has its own page, [JOURNEY_RECORDING.md](JOURNEY_RECORDING.md). State of 2026-10-14.

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
| Full camera image during capture | Browser memory | the uncropped camera image is held while the guest frames the photo; it is not uploaded or retained. TOVÁBB sends the finished composition through the established submission upload | discarded after a successful submission or retake; if upload fails it remains in the current browser session for retry |
| The unframed photo (the crop the user saved, before the frame) | a private file in the Blob store (`pending/<event>/…`, an unlisted address, never returned by a public route) until its copy on ImgBB is verified, then **only on ImgBB** (a public third-party image host: the file has an address that anybody who knows it can open, and ImgBB's terms let it remove files without notice; owner decisions 295 and "variant B"). Both are named on the photo in `imageCopies`; the Blob entry stays as a `deleted` row | **since issue 509 the Blob file is kept after the photo is approved until ImgBB holds a verified copy, then deleted** (it used to be deleted at approval); a copy that cannot be verified leaves the Blob file in place. A waiting or rejected photo keeps its Blob file. Owner answer 226: ImgBB's copy is kept **90 days after the event, then deleted on request**. **That deletion is not built: nothing deletes it automatically yet**, so today it is kept until the photo is removed. Deleting a photo deletes the Blob file (if it is still there) and requests the deletion of the ImgBB file through its stored link (best effort: a failed request is logged with the file's address, and the file is then removed by hand). The admin Image safety card can make the ImgBB copy and delete the Blob file for approved photos where the approval could not (waiting and rejected photos are never copied) |
| The framed picture | `submissions` (`imageUrl`), in the Blob store and, when the mirror worked, on ImgBB (its address and delete link are now recorded in `imageCopies`); the Image safety card also makes a second copy of a picture that existed in one place only (an extra file in our store under `rescue/`, or an ImgBB upload) | the picture the public sees (the frame is on it) | until the photo is removed (every recorded copy is deleted with it) |
| What the vetting person marked in the photo (issue 628) | on the photo: `people`, `peopleReview`, `rejectReasons` | for each person in the picture a rectangle and the words chosen from the list of the event (gender and age as the person looks in the photo, how they look, what they wear or hold), who marked it (the reviewer's e-mail) and when, the version of the list used; for a rejected photo the reasons from a fixed list and the optional note. **These are a reviewer's reading of the picture, not facts about the person, and are kept with the photo; no name, e-mail or identity of the people in the picture is added.** Counted per event for the Analytics (and, once the owner switches it on, as `camera_` totals for messmass: counts only, never a person). **Rejected photos are marked too** and stay private (never shown to anyone but the vetting person). Not exported and not used to train anything; whether the terms the user accepted cover that is a question for legal ([AI_TRAINING_PURPOSE_AND_CONSENT_DRAFT.md](AI_TRAINING_PURPOSE_AND_CONSENT_DRAFT.md)) | with the photo |
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

Only identified, consented submissions with a usable image can be discovered.
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
checkboxes. Otherwise it stays out of vetting, publication, analytics
processing, and Fanmass for the 24-hour hold, then the scheduled cleanup deletes
its stored image copies and removes its contact, consent, review, and analysis
data. The database keeps a minimal `expired` tombstone to count the automatic
deletion; it does not keep the user's identity. Failed file deletion remains
private and is retried by the cleanup job.

## The IP address, everywhere it still appears

- **The rate limiter** (`lib/api/rateLimiter.ts`) uses the IP address to count requests. It keeps it **in the memory of the server instance** (a bucket per path and address, cleared after an hour) or, when Upstash is configured, **as a SHA-256 hash** (`lib/api/upstash-rate-limit.ts`). It is not written to the database.
- **The hosting platform** (Vercel) sees every request and keeps its own request logs with addresses. That is the platform's, not camera's, and not something the application can switch off.
- **Old photos** hold what they were saved with (above).
- Nothing else in `lib` or `app` reads or writes an IP address (checked by a search of the sources for `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip` and `ipAddress` on 2026-10-11).

## Still to decide (the owner)

1. What to do with the IP addresses and user agents of the photos taken before this change: leave them, or remove them (after the classes are written, for the user agents).
2. The wording of the privacy notice (the audit's step F): this page is the list it must match.
3. The erase flow covering the journey records (they hold no person, so it has nothing to erase for one user; the photo's own erase flow is unchanged).
