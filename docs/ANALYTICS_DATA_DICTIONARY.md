# Analytics data inventory and metric definitions

Reviewed 2026-10-14 against the code in this repository. This is a code audit: it describes the fields and retention configured here, not a live database inspection or a legal assessment. It supersedes the “what is recorded today” snapshot dated 2026-10-09 in [ANALYTICS_AUDIT.md](ANALYTICS_AUDIT.md). The expanded measures listed below are implemented in this change; historic rows are not backfilled.

## Where the figures come from

The report figures are read-only. `lib/analytics/load.ts` loads a bounded projection of event data; `lib/analytics/facts.ts` normalises it; `lib/analytics/report.ts` computes report figures. The Journey tab uses `lib/journey/store.ts` and `lib/analytics/journey.ts`. The CSV export is produced by `lib/analytics/export.ts` from the same report objects. The separate Messmass panel can change the global outbound-counter switch.

| Data | What is stored or counted | Collection / retention |
|---|---|---|
| Guest photo submission | Image references, event and frame/message/layout choices, submission time, review state/history, name/e-mail or account reference when provided, consent records, framing metadata and delivery status | `submissions`; retained under the submission and media lifecycle, not the Journey 30-day TTL |
| Review decision | Current approved/rejected/pending state and decision history: action, reviewer, time, structured rejection keys and optional reviewer note | `submissions.reviewStatus`, `reviewHistory`, `rejectReasons`; attached to the photo record |
| Registration | Event, name/e-mail, first/last seen, welcome-mail status | `email_registrations`; retained as registration data |
| Journey interactions | Event ID, random per-visit ID, fixed event name/key, elapsed milliseconds, received time; device class only on the start record | `journey_events`, TTL 30 days |
| Journey totals | Counts by event, UTC day, fixed event name and key; plus duration sum/sample count for completed journeys; no visit ID | `journey_daily`; retained indefinitely as aggregates |
| Validated source attribution | Allow-listed short-link slug on a submission, only when it matches a link for that event | `submissions.metadata.sourceLinkSlug`; retained with the submission |
| Tracked-link visits | Link identifier, UTC day, coarse device class and count | `short_link_hits`; aggregated link records |
| Screen plays | Running play counts per photo/slideshow and last-play time | submission play counters; no individual play history |
| Delivery/operations | Mail send outcomes and structured application activity / outbound-call logs | Submission metadata and operational log/DB lifecycle; not a user-level web analytics feed |

The Analytics database read is narrower than the full submission record. `PHOTO_PROJECTION` in `lib/analytics/facts.ts` reads: `eventId`, `eventIds`, `submissionKind`, `isArchived`, `mediaHealth.broken`, `createdAt`, `method`, `userId`, `userEmail`, `userInfo.email`, `reviewStatus`, `reviewHistory`, `rejectReasons`, `photoReview.submittedAt`, `photoReview.shareOptIn`, `isShareVisible`, `publicGalleryConsent`, `consents`, `frameId`, `frameName`, `frameVariant.message`, `frameVariant.imageUrl`, `reframe.mirrored`, `reframe.mode`, `playCount`, `lastPlayedAt`, `slideshowPlays`, `people`, `peopleReview`, and the listed `metadata.*` mail/device fields. It does not load the image bytes. E-mail/account values are used in memory to group photo submitters; the report/export contains aggregates, not guest e-mail addresses. Reviewer e-mails are used in the Vetting report because it displays decision/annotation attribution to authorised admins.

The Journey writer stores raw rows as `{ eventId, session, name, key, ms, at }` and aggregates as `{ eventId, day, name, key, count }`. Completed journey daily rows also hold `durationTotalMs` and `durationSamples`. A random visit ID exists only in those 30-day raw rows; the rollup has no visit or person ID. Analytics also reads registrations as `{ email, createdAt, welcomeSentAt }`, tracked-link hit rows as `{ slug, day, device, count }`, and slideshow names/IDs. The source details and the full set of analytics calculations are in [ANALYTICS.md](ANALYTICS.md) and [JOURNEY_RECORDING.md](JOURNEY_RECORDING.md).

Operational logs are separate from Analytics collections and are not a substitute for Journey events. The capture-diagnostic log contains a random session ID, camera mode, timings/outcome/retries, brightness/sizes/method/viewport/test label, plus a user-agent string cut at 200 characters. Client-error logs contain the error digest/message, page URL and user agent. Sign-in and outbound-call logging have their own fields and configured log-service retention. These logs are described in [PRIVACY_DATA.md](PRIVACY_DATA.md); this audit does not assert a provider retention duration or inspect live log contents. Journey itself stores no raw user-agent, URL, IP address, name, e-mail or free-text value.

The Journey recorder does not send an IP address, user agent, name, e-mail, photo, page URL, or free-text value. The server reads the user agent only to classify the start device into a fixed device key; it does not retain that raw value in Journey rows. This statement applies to the Journey collections, not to every application route or infrastructure log. See [PRIVACY_DATA.md](PRIVACY_DATA.md) and [JOURNEY_RECORDING.md](JOURNEY_RECORDING.md) for their respective scopes.

The Journey recording has a global switch in Admin Analytics. If disabled, the recorder sends no Journey events. The browser batches small fixed-vocabulary records and sends them without waiting for the capture flow. The route validates the vocabulary and responds before writing. A failed beacon can be lost; it never blocks photo capture. Raw rows expire after 30 days, while daily totals are kept for longitudinal reporting.

## How Camera and Messmass fit together

Messmass **KYC** (`/admin/kyc`, `variables_metadata`) is its catalog of report variables. It is not identity verification for a guest. Camera owns the source records and the event Analytics report; Messmass is the cross-event reporting destination for a limited set of event totals.

The receiving endpoint, `POST /api/integrations/camera/events/{messmassEventId}/photo-stats`, was merged in Messmass [PR #481](https://github.com/moldovancsaba/messmass/pull/481). It accepts totals under the reserved `camera_` namespace, writes them to `projects.stats.camera_*`, and registers missing catalog entries in `variables_metadata` without replacing entries an operator has edited. The values are event-level aggregates: no photo, name, e-mail, reviewer, person-level annotation or Journey visit ID is sent. Existing Messmass variables such as `approvedImages`, `female` or `jersey` remain separate; reports can compare those with Camera’s measurements without Camera overwriting them.

Camera has the matching payload builder, sender and triggers. The global switch is **off by default**. When enabled, a vetting decision, saved people-marking, new photo, Journey batch, or tracked-link hit schedules a whole-event snapshot; a 15-second coalescing window limits pushes during a burst. The payload includes the already-supported approval/rejection/structured-reason totals and additive `camera_` totals for journey durations, step reach/transitions, CTA actions/returns, SSO outcome categories, upload outcomes/duration bands, source-attributed submissions, review-queue ages, and within-event repeat submitters. Duration is sent as a sum plus sample count, so Messmass can calculate a weighted average. No row-level identity or visit ID is sent. A failed send is retried by a later trigger. Link/QR totals use their existing integration route.

Rates in Messmass should be calculated from additive numerator/denominator counters, not by averaging event percentages. For cross-event repeat users, Camera sends only per-event counts of identified photo submitters and those with multiple photos in that event; it does not send identity keys or attempt person-level cross-event matching.

If “KYC” means proving a guest’s identity, that is a separate product decision from Messmass’s variable catalog. The current metrics need no identity-document images, face matching or biometric template. Prefer the existing SSO/account identity only where necessary, and keep analytics anonymous or event-aggregated. Add document or biometric verification only for a clearly defined legal or operational need, with a separate data-flow, access and deletion review before implementation.

## Requested measures and exact meaning

| Requested figure | Current Analytics location | Calculation and important limit |
|---|---|---|
| Number approved | Event Analytics → Overview and Vetting and people | Count of current user-photo records whose review status is approved; a photo is counted once even if it was reviewed more than once. Historical decisions are separately listed in the decision history figures. |
| Number rejected | Event Analytics → Overview and Vetting and people | Count of current user-photo records whose review status is rejected. A photo later approved is no longer counted as currently rejected. |
| Rejection reason percentages | Vetting and people → Why photos were declined | For each selected structured reason, `photos currently rejected with that reason / photos currently rejected`. Multi-reason photos appear under each reason, so percentages can total above 100%. Free-text notes are separately counted and are not a stable category system. |
| Average selfie flow duration | Journey | Average elapsed time from first capture-page open through the final configured journey page after the photo is saved. An SSO page reload/return is included when resumed within six hours. Calculated from retained `journey.flow.complete` daily duration sum/sample count, so average remains available after raw rows age out. Median and duration distribution use those raw rows retained for 30 days. Selected dates filter by the UTC day the final page was reached. Visits that do not reach the end are not completed samples. This full-flow measurement starts with this release and is not backfilled; the existing `journey.complete` rows continue to count saved-photo visits. |
| CTA click rate | Journey | Visits that pressed an action on a CTA page at least once / visits that reached a CTA page. The recorder counts one CTA click per visit, even if more than one control is used. No CTA reached means “n/a”, not 0%. |
| Google/Facebook/Pseudo shares | Journey → Sign-in and identity choices | Route-choice shares show provider/form selection. A separate SSO outcome distribution reports fixed success/failure categories by provider; it never includes identity or provider error text. |
| Returning vs new users | Photos and users; all-events Analytics | Event-period split: identified submitters with 2+ photos vs exactly 1, with unidentifiable submitters separate. The all-events cohort compares existing normalized e-mail/account identifiers in memory across event photo records and returns only aggregate counts to global admins. It does not persist or export a cross-event identity map. This is photo activity, not a returning website visit. |

Counts in the photo and vetting tabs cover the report's photo scope and selected date range. The Journey tab is per event; its daily totals are UTC and the date range is applied to those UTC days. Average completion duration uses durable daily sum/count totals; median, buckets, and selected raw event details are limited to the configured 30-day raw retention window.

## What is not collected or cannot be inferred

- Journey records do not contain a stable person ID, account ID or e-mail and cannot identify an individual across events. The all-events repeat cohort is an in-memory aggregate over photo records accessible to global admins; it does not attach identity to Journey records or store cross-event profiles.
- Journey visits are anonymous visit counts, not unique people. A return from SSO is a resume record rather than another open.
- A `login.method` record is a provider click or successful pseudo-form submission. Separate `auth.result` records hold provider plus one of a bounded outcome vocabulary; callback errors, e-mail, tokens and raw error text are not recorded.
- The currently selected report's returning/new split is photo-based. Someone who returns to browse without submitting another photo cannot be identified from it.
- The share/consent record in Journey is an interaction count, not a consent receipt. The legally operative consent record is attached to the submission.
- Screen play counters do not say which physical screen showed a photo or how long it remained visible.
- There is no general recording of every click, keystroke, page URL, browser fingerprint, exact location, or email open. Do not infer these from operational logs.
- Source-to-submission attribution is available only when the redirect's slug resolves to a tracked link belonging to the same event. The allow-listed slug is stored with the photo record; arbitrary query text is discarded. Historic submissions are not backfilled.

## Recommendations and KYC scope

These are product measurement recommendations, not a request to identify guests more aggressively:

The requested extensions are now implemented: step transitions/drop-off, upload reliability and duration bands, bounded SSO outcomes, CTA action and return signals, pending-review age buckets, validated tracked-link attribution, cross-event returning-photo cohorts, and additive Messmass aggregate counters. As follow-up, consider alert thresholds for upload failure/review backlog and validate event-specific definitions of “returning”; do not introduce person-level event tracking to answer these operational questions.

For KYC, Messmass's `/admin/kyc` is a variable catalog, not guest identity verification. The current event-photo workflow has no clear need for document scans, face matching or biometric templates. Keep SSO limited to account/contact needs. If a regulator, contract, or fraud pattern later requires identity proofing, first document the purpose and lawful basis, choose a specialist provider with deletion and regional-processing controls, and perform a separate data-protection and security review. Do not store identity documents or biometric templates in Camera or Messmass analytics. GDPR principles require purpose limitation, data minimisation and storage limitation; see [GDPR Article 5 on EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj#d1e1885-1-1).
