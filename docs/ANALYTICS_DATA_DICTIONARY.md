# Analytics data inventory and metric definitions

Reviewed 2026-10-14 against the code in this repository. This is a code audit: it describes the fields and retention configured here, not a live database inspection or a legal assessment. It supersedes the “what is recorded today” snapshot dated 2026-10-09 in [ANALYTICS_AUDIT.md](ANALYTICS_AUDIT.md).

## Where the figures come from

The report figures are read-only. `lib/analytics/load.ts` loads a bounded projection of event data; `lib/analytics/facts.ts` normalises it; `lib/analytics/report.ts` computes report figures. The Journey tab uses `lib/journey/store.ts` and `lib/analytics/journey.ts`. The CSV export is produced by `lib/analytics/export.ts` from the same report objects. The separate Messmass panel can change the global outbound-counter switch.

| Data | What is stored or counted | Collection / retention |
|---|---|---|
| Guest photo submission | Image references, event and frame/message/layout choices, submission time, review state/history, name/e-mail or account reference when provided, consent records, framing metadata and delivery status | `submissions`; retained under the submission and media lifecycle, not the Journey 30-day TTL |
| Review decision | Current approved/rejected/pending state and decision history: action, reviewer, time, structured rejection keys and optional reviewer note | `submissions.reviewStatus`, `reviewHistory`, `rejectReasons`; attached to the photo record |
| Registration | Event, name/e-mail, first/last seen, welcome-mail status | `email_registrations`; retained as registration data |
| Journey interactions | Event ID, random per-visit ID, fixed event name/key, elapsed milliseconds, received time; device class only on the start record | `journey_events`, TTL 30 days |
| Journey totals | Counts by event, UTC day, fixed event name and key; no visit ID | `journey_daily`; retained indefinitely as aggregates |
| Tracked-link visits | Link identifier, UTC day, coarse device class and count | `short_link_hits`; aggregated link records |
| Screen plays | Running play counts per photo/slideshow and last-play time | submission play counters; no individual play history |
| Delivery/operations | Mail send outcomes and structured application activity / outbound-call logs | Submission metadata and operational log/DB lifecycle; not a user-level web analytics feed |

The Analytics database read is narrower than the full submission record. `PHOTO_PROJECTION` in `lib/analytics/facts.ts` reads: `eventId`, `eventIds`, `submissionKind`, `isArchived`, `mediaHealth.broken`, `createdAt`, `method`, `userId`, `userEmail`, `userInfo.email`, `reviewStatus`, `reviewHistory`, `rejectReasons`, `photoReview.submittedAt`, `photoReview.shareOptIn`, `isShareVisible`, `publicGalleryConsent`, `consents`, `frameId`, `frameName`, `frameVariant.message`, `frameVariant.imageUrl`, `reframe.mirrored`, `reframe.mode`, `playCount`, `lastPlayedAt`, `slideshowPlays`, `people`, `peopleReview`, and the listed `metadata.*` mail/device fields. It does not load the image bytes. E-mail/account values are used in memory to group photo submitters; the report/export contains aggregates, not guest e-mail addresses. Reviewer e-mails are used in the Vetting report because it displays decision/annotation attribution to authorised admins.

The Journey writer stores raw rows as `{ eventId, session, name, key, ms, at }` and aggregates as `{ eventId, day, name, key, count }`. A random visit ID exists only in those 30-day raw rows; the rollup has no visit or person ID. Analytics also reads registrations as `{ email, createdAt, welcomeSentAt }`, tracked-link hit rows as `{ slug, day, device, count }`, and slideshow names/IDs. The source details and the full set of analytics calculations are in [ANALYTICS.md](ANALYTICS.md) and [JOURNEY_RECORDING.md](JOURNEY_RECORDING.md).

Operational logs are separate from Analytics collections and are not a substitute for Journey events. The capture-diagnostic log contains a random session ID, camera mode, timings/outcome/retries, brightness/sizes/method/viewport/test label, plus a user-agent string cut at 200 characters. Client-error logs contain the error digest/message, page URL and user agent. Sign-in and outbound-call logging have their own fields and configured log-service retention. These logs are described in [PRIVACY_DATA.md](PRIVACY_DATA.md); this audit does not assert a provider retention duration or inspect live log contents. Journey itself stores no raw user-agent, URL, IP address, name, e-mail or free-text value.

The Journey recorder does not send an IP address, user agent, name, e-mail, photo, page URL, or free-text value. The server reads the user agent only to classify the start device into a fixed device key; it does not retain that raw value in Journey rows. This statement applies to the Journey collections, not to every application route or infrastructure log. See [PRIVACY_DATA.md](PRIVACY_DATA.md) and [JOURNEY_RECORDING.md](JOURNEY_RECORDING.md) for their respective scopes.

The Journey recording has a global switch in Admin Analytics. If disabled, the recorder sends no Journey events. The browser batches small fixed-vocabulary records and sends them without waiting for the capture flow. The route validates the vocabulary and responds before writing. A failed beacon can be lost; it never blocks photo capture. Raw rows expire after 30 days, while daily totals are kept for longitudinal reporting.

## How Camera and Messmass fit together

Messmass **KYC** (`/admin/kyc`, `variables_metadata`) is its catalog of report variables. It is not identity verification for a guest. Camera owns the source records and the event Analytics report; Messmass is the cross-event reporting destination for a limited set of event totals.

The receiving endpoint, `POST /api/integrations/camera/events/{messmassEventId}/photo-stats`, was merged in Messmass [PR #481](https://github.com/moldovancsaba/messmass/pull/481). It accepts totals under the reserved `camera_` namespace, writes them to `projects.stats.camera_*`, and registers missing catalog entries in `variables_metadata` without replacing entries an operator has edited. The values are event-level aggregates: no photo, name, e-mail, reviewer, person-level annotation or Journey visit ID is sent. Existing Messmass variables such as `approvedImages`, `female` or `jersey` remain separate; reports can compare those with Camera’s measurements without Camera overwriting them.

Camera has the matching payload builder, sender and trigger. The global switch is **off by default**. When enabled, a vetting decision or a saved people-marking schedules a whole-event snapshot; a 15-second coalescing window limits pushes during a burst. A new photo, Journey event, link hit, screen play or deletion does not independently trigger a push, so these totals can lag until the next review/marking. There is no scheduled catch-up or manual “Send now” action. A failed send is retried by a later trigger. Link/QR totals use their separate integration route.

The requested photo counts and rejection reasons already have matching counter families. CTA click rate, login-method shares and identifiable new/returning-user shares are currently available in Camera Analytics and its CSV, but are not sent to Messmass. To report them there, send additive numerator and denominator totals (for example CTA clicks and CTA-page visits) under new `camera_` names, then define the percentage in a Messmass report formula. Never send e-mail/account identifiers to build those rates.

Average selfie time needs different treatment: a per-event average cannot be safely added across events. If this measure is added to Messmass, send a duration total and its matching completed-journey count, then divide the totals in the report. The current exact duration sample is limited to raw Journey rows retained for 30 days; a durable cross-event average would first need an anonymous daily duration-sum/count rollup and a trigger/catch-up path. Until then, use Camera’s Journey tab for its documented recent average.

If “KYC” means proving a guest’s identity, that is a separate product decision from Messmass’s variable catalog. The current metrics need no identity-document images, face matching or biometric template. Prefer the existing SSO/account identity only where necessary, and keep analytics anonymous or event-aggregated. Add document or biometric verification only for a clearly defined legal or operational need, with a separate data-flow, access and deletion review before implementation.

## Requested measures and exact meaning

| Requested figure | Current Analytics location | Calculation and important limit |
|---|---|---|
| Number approved | Event Analytics → Overview and Vetting and people | Count of current user-photo records whose review status is approved; a photo is counted once even if it was reviewed more than once. Historical decisions are separately listed in the decision history figures. |
| Number rejected | Event Analytics → Overview and Vetting and people | Count of current user-photo records whose review status is rejected. A photo later approved is no longer counted as currently rejected. |
| Rejection reason percentages | Vetting and people → Why photos were declined | For each selected structured reason, `photos currently rejected with that reason / photos currently rejected`. Multi-reason photos appear under each reason, so percentages can total above 100%. Free-text notes are separately counted and are not a stable category system. |
| Average selfie flow duration | Journey | Average elapsed time from the capture page opening to the first photo successfully saved, calculated from raw completion rows retained for 30 days. The selected date range filters by the UTC day the completion row was received. This is “to first saved photo,” not time through any later thank-you/share pages. A journey resumed after SSO starts a new in-memory timer, so time before an onboarding login is not included. |
| CTA click rate | Journey | Visits that pressed an action on a CTA page at least once / visits that reached a CTA page. The recorder counts one CTA click per visit, even if more than one control is used. No CTA reached means “n/a”, not 0%. |
| Google/Facebook/Pseudo shares | Journey → Sign-in and identity choices | Share of recorded method choices. Google/Facebook mean the guest clicked the SSO provider entry point; Pseudo means the guest submitted a valid name-and-e-mail form. These measure the selected route, not a successful Google/Facebook authentication. |
| Returning vs new users | Photos and users | Among identifiable users with photos in the selected reporting period, “returning” means two or more photos in that period; “new” means one photo in that period. The identity key is the normalised e-mail or account ID used by the report. Photos with neither cannot be classified and are shown separately. This does not mean a returning website visit. |

Counts in the photo and vetting tabs cover the report's photo scope and selected date range. The Journey tab is per event; its daily totals are UTC and the date range is applied to those UTC days. The time-to-first-save average/median require raw completion rows and are therefore available only within the configured 30-day raw retention window.

## What is not collected or cannot be inferred

- Journey records do not contain a stable person ID, account ID or e-mail and cannot identify an individual across events.
- Journey visits are anonymous visit counts, not unique people. A return from SSO is a resume record rather than another open.
- A `login.method` record is a provider click or successful pseudo-form submission. The Journey stream does not receive the authentication callback result, so it cannot say whether SSO succeeded or why it failed.
- The currently selected report's returning/new split is photo-based. Someone who returns to browse without submitting another photo cannot be identified from it.
- The share/consent record in Journey is an interaction count, not a consent receipt. The legally operative consent record is attached to the submission.
- Screen play counters do not say which physical screen showed a photo or how long it remained visible.
- There is no general recording of every click, keystroke, page URL, browser fingerprint, exact location, or email open. Do not infer these from operational logs.
- Click/visit attribution from a QR placement to a saved photo is unavailable when the redirect does not preserve the source. The Sources tab still reports tracked-link hits independently.

## Recommended next analytics

These are product measurement recommendations, not a request to identify guests more aggressively:

1. **Step-to-step conversion and drop-off.** Show each step's reaches and the percentage of prior-step visits that continue. This helps distinguish a confusing selector, consent abandonment, a login exit, and a camera issue.
2. **Upload reliability and duration.** Break upload start/success/failure down by coarse device class and capture method; track upload duration buckets without saving the image or exact network address in analytics.
3. **Authentication completion.** If provider success rates are needed, add a bounded callback result event with only provider + success/failure category. Do not include the person's e-mail or SSO tokens in Journey events.
4. **CTA outcomes.** Distinguish external-link clicks from internal Continue clicks and add a later, aggregate return-to-capture signal if the user journey needs to know whether a visitor came back.
5. **Photo review service levels.** Report pending age, time-to-first-decision, approvals/rejections by event and reviewer, and structured rejection reason shares. These are already largely available; continue to distinguish current photo status from historical decision count.
6. **Source attribution.** Preserve a short, allow-listed QR/link placement code through the redirect and submission. Keep it separate from identity and do not accept arbitrary query text as an analytics key.
7. **Returning-user cohorts.** If operators need cross-event repeat rates, first define a purpose, access policy and retention for a pseudonymous identity key. Today the report uses e-mail/account data already associated with submissions; Journey itself remains unlinked.

I recommend prioritising step drop-off, upload reliability and authentication completion before collecting location, device fingerprints, biometric templates or identity-document images. For an event-photo product, those more intrusive data types do not improve the six requested operational measures. GDPR principles require purpose limitation, data minimisation and storage limitation; any expansion into person-level identity profiling needs a documented purpose, lawful basis, notice, access/retention rules and the controller's review before implementation. See [GDPR Article 5 on EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj#d1e1885-1-1).
