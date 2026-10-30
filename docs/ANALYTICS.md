# Analytics (issue 521)

The Analytics view of an event, and of all events together. The **Journey** tab uses anonymous, event-scoped interaction counts ([JOURNEY_RECORDING.md](JOURNEY_RECORDING.md)); other tabs report submissions, vetting, users, screens, links, e-mails and consents from their existing records. Journey also shows step transitions, upload reliability, bounded SSO outcomes, CTA action/return signals and tracked-source conversion. All-events Analytics adds aggregate repeat-submitter cohorts. The current field-by-field collection and retention audit is [ANALYTICS_DATA_DICTIONARY.md](ANALYTICS_DATA_DICTIONARY.md). The assessment and measurement recommendations are in [ANALYTICS_AUDIT.md](ANALYTICS_AUDIT.md).

## Where it is

| Where | Who | What |
|---|---|---|
| Event menu **Analytics** (`/admin/events/<id>/analytics`) | the event's managers and global admins (the same rule as the Vetting tab next to it) | the numbers of the event, in tabs |
| Operations **Analytics** (`/admin/analytics`; the old address `/admin/tryon/analytics` is redirected) | global admins | the same numbers over every event, and one row per event (the name opens that event's tab) |
| `GET /api/admin/events/<id>/export/analytics` | like the tab | the figures of every tab as one CSV (`section,item,value`), with the same days and clock |

Tabs are links (`?view=`), and the days and the clock are in the address too, so a report can be shared as a link. The tabs: **Overview** (the key figures, photos per day and per hour, what is not measured), **Journey** (one event: visits, steps reached and transitions, completed flows and average/median time from first page to final configured page, CTA actions and return signals, sign-in choices and bounded SSO outcomes, upload outcomes/duration bands, camera permission, retakes, consent left, shares/downloads, and recording switch; Journey days are UTC), **Photos and users** (including returning/new shares among identifiable photo submitters), **Vetting** (approval/rejection counts, reason shares and current queue age), **Screens**, **Sources** (one event, tracked link visits and attributable photo submissions), **E-mails and consent**, **Messmass** (global admins: a preview of aggregate counters; nothing is sent from opening the preview). All-events Analytics also includes an aggregate repeat-submitter cohort. A decline can carry multiple reasons; each reason's share uses rejected photos as its denominator, and shares can sum above 100%. Per-photo Fanmass results and human corrections belong on the Camera **Photo analysis** page; they are not Camera Analytics counters. There is no Try-on tab any more (it went with the try-on integration, issue 557; an old `?view=tryon` address shows the Overview).

## What is counted

The photos filed under the event (its UUID in `eventId` or `eventIds`) that are originals (a missing `submissionKind` is an original: 343 older photos have none), not removed from the event by an admin (`isArchived`) and whose picture is not gone (`mediaHealth.broken`). The last two are named in the line above the tabs, not counted. Try-on results are not photos of this report. A photo an editor added in the gallery (`metadata.adminGalleryUpload`) is counted apart ("added by editors"): nobody took it, though the screens show it.

`lib/analytics/facts.ts` reads a database document once into a small record (`PhotoFacts`); `lib/analytics/report.ts` turns the records into the report; `lib/analytics/load.ts` is the only part that touches the database (read only, a narrow projection, **no row cap**: the old try-on report silently cut its queries at 5,000 rows). Every aggregation is a pure function with unit tests.

Duration maxima are calculated with a linear pass rather than spreading a full event's durations into function arguments. This avoids a JavaScript argument-count failure on large histories while preserving the complete, uncapped counts. The report still holds its narrow photo-fact records in memory for cross-photo user and event aggregation; future capacity growth should be measured before replacing that shared report model with streaming or persisted rollups.

## The figures: what each one is and where it comes from

| Figure | Definition | Source field |
|---|---|---|
| Photos taken | counted photos taken or uploaded by users | `submissions` |
| Approved, declined, waiting | `reviewStatus` is `approved`, `rejected`, `pending_review` | `reviewStatus` |
| Not vetted | counted photos with none of the three (before vetting existed, or an event without it); the four add up to photos taken | |
| Approval rate | approved over approved plus declined; `n/a` before the first decision | |
| Time to first decision | from `photoReview.submittedAt` (else `createdAt`) to the first entry of `reviewHistory`; a later decision does not count again; a clock slip (earlier time) is dropped; average, median, longest, and buckets (under 1 min, 1 to 5, 5 to 15, 15 to 60, 1 to 6 h, over 6 h) | `photoReview.submittedAt`, `reviewHistory[]` |
| Who decided | per person: approvals, declines (every entry of `reviewHistory.by`), photos they decided first and the time of those | `reviewHistory[].by` |
| Waiting now, the oldest | waiting photos, and the age of the one that has waited longest | |
| Approved without a record | `approved` with an empty history (set when vetting was switched on for the event): counted as approved, named, no time | |
| Decline reasons chosen from the list | by key, over the photos that are **declined now** (a photo with several reasons is in each; a photo declined and approved again is not counted), in the words of the event's vocabulary; declined photos with no reason from the list (declined before the list existed) are counted apart. Shown next to the words below, and in the CSV | `rejectReasons` |
| Decline reasons written | the free text of each decline, counted without regard to case or spacing; declines with and without a reason | `reviewHistory[].reason` |
| Different users | distinct lower-case e-mail (account e-mail, else the typed one; `anonymous@event` and `admin@upload` are no e-mail), else the account id; a photo with neither cannot be told apart and is in the photo counts only | `userId`, `userEmail`, `userInfo.email` |
| Signed in, gave an e-mail | users with at least one photo taken while signed in (`userId` is not `anonymous`); the rest | |
| Took more than one photo | users with two or more photos | |
| Registered | distinct e-mails in `email_registrations` for the event (the Who-are-you step), and how many of them took a photo | `email_registrations` |
| Photos per day and hour | the day and hour of `createdAt` **on the clock chosen on the page** (Budapest for a Hungarian event, else UTC; UTC or Budapest on the page), quiet days shown as zero; users per day and hour, new users on their first day | `createdAt` |
| Devices | iPhone or iPad, Android, desktop, not recorded. A new photo stores the class itself (`metadata.deviceClass`, with the browser family; no user agent, decision 243); a photo taken before stores the user agent and the class is made from it when the report reads it (an iPad that asks for the desktop site looks like a Mac). Nothing stored is rewritten. A photo an editor added in the gallery stores no device and is not in this figure | `metadata.deviceClass`, else `metadata.deviceInfo` |
| How the photo was provided, framing | `method` (camera, uploaded, not recorded), the `reframe` mode (fills, fits, moved or zoomed) and the front-camera share | `method`, `reframe` |
| Frames, messages, layouts chosen | the event's own frame by name; the generated frame by its message and by its layout image (labelled by the start of the file name, because that is all that names it) | `frameName`, `frameVariant.message`, `frameVariant.imageUrl` |
| Plays | the sum of the running play count of the counted photos, photos shown at least once, the share of the photos the screens may show (not waiting, not declined), the most played, by slideshow with its name, the time of the last play | `playCount`, `slideshowPlays`, `lastPlayedAt` |
| Link and QR visits (one event) | the counted visits of the tracked links and of the event's own short address, by link, phone kind and UTC day | `short_links`, `short_link_hits` |
| E-mails | welcome (registrations, sent), arrived, the photo link (sent, failed, skipped with the reason, by kind), declined (sent, not sent), follow up (not sent yet) | `metadata.*`, `email_registrations` |
| Consents | photos with and without a consent record, the records by the exact words the user read (the Who-are-you sentence when there was one, else the checkbox text), first and last time, the separate public gallery permission, the public wall choice | `consents[]`, `publicGalleryConsent`, `photoReview.shareOptIn` |

Days can be limited (`from`, `to`; **both included**, on the chosen clock): they limit the photos by the day they were taken, and the decisions and plays of those photos follow them. The link visits are limited by their own UTC day.

## Counters for messmass (prepared, switched off by default)

The current expanded feed supersedes the older limited-counter notes further down this document: Journey batches, new submissions and tracked-link hits also schedule the coalesced event snapshot. The additive `camera_` families include full-flow duration sum/sample count, separate saved-photo and final-page journey counts, step reach/transitions, CTA action/return, bounded SSO outcomes, upload outcome and duration bands, validated source attribution, review-queue age bands, and event-level repeat submitter counts. No individual account, e-mail, photo, raw query or Journey session is sent. Percentage rates in Messmass must be calculated from the relevant numerator and denominator totals; do not average per-event percentages. The sender remains disabled until a global admin enables it.

The numbers sent by Camera's optional counter feed are **aggregate operational counters only, never a person**. Camera's sender is wired to vetting decisions, new submissions and Journey batches; its global switch is off by default. This counter feed does not contain gender, age, emotion, merchandise, or other per-photo image-analysis values. Fanmass sends each photo's structured result and boxes to Messmass through the separate one-photo result contract, and Messmass aggregates those rows. Human corrections in Camera are applied to the same Fanmass result before its per-photo delivery is refreshed. See [FANMASS_RESULTS_IN_CAMERA.md](FANMASS_RESULTS_IN_CAMERA.md).

**Every name in this optional Camera counter feed starts with `camera_`** (lower case snake case, `^camera_[a-z0-9_]{1,80}$`, `COUNTER_NAME_PATTERN`). A counter sent to Messmass is a whole running total for the event, not a day's change. Image-analysis datapoints are excluded from this feed and delivered by Fanmass per photo.

| Counter | Kind | What it counts |
|---|---|---|
| `camera_images_taken` | total | photos taken or uploaded by users (the counted photos above, editors' uploads not included) |
| `camera_images_approved`, `camera_images_rejected` | total | of those, approved and declined now |
| `camera_images_shown_on_slideshow` | total | plays: the sum of the running play count of the event's counted photos, all slideshows |
| `camera_images_decided`, `camera_vetting_seconds_total` | total | photos with a first decision, and the seconds from each photo being handed in to its first decision, added up; the average time is the second divided by the first, in messmass; **left out until a photo was decided** |
| `camera_consents_accepted` | total | photos whose user accepted at least one consent |
| `camera_journey_opens`, `camera_journeys_completed`, `camera_journeys_finished`, `camera_permission_denied`, `camera_retakes`, `camera_consents_abandoned`, `camera_shares`, `camera_downloads` | total | from Journey: visits, visits that saved a photo, visits that reached the final configured page, times the live camera of a desktop was refused, retakes, consent shown and not accepted, share buttons pressed, downloads of the photo. **Since the recording started; not sent at all for an event that has no journey record** |
| `camera_journey_completed_duration_ms_total`, `camera_journey_completed_duration_samples` | total | full-flow elapsed milliseconds and sample count, from first capture-page open through the final configured page after saving; divide totals for a correctly weighted average across events |
| `camera_rejected_<key>` | total | declined photos that carry that reason (`camera_rejected_nudity`); a photo with several reasons is in each |
| `camera_images_rejected_no_reason` | total | declined photos that carry no reason from the list (declined before the list existed) |

**Which keys get a counter.** Structured rejection reasons use the event's inherited rejection-reason vocabulary. Every offered reason is sent (0 when none of the current rejected photos carry it), as is any historical reason key still present on a rejected photo. The standard vocabulary has 12 reasons.

Counters that cannot be counted are **never sent as zero**: an event with no journey record sends no journey counter; an event with no declined photo sends no reason counter. Link visits also reach Messmass through their existing channel (`docs/SHORT_LINKS.md`); the expanded `camera_` photo-conversion snapshot is a separate feed.

**The contract with the Messmass counter route** (`lib/analytics/counters-contract.ts`): the body contains aggregate totals/averages and labels. Names are checked and invalid values are dropped and logged. These counters cover Camera operations and consent/vetting outcomes; they are not a substitute for Fanmass's structured per-photo analysis contract.

**The pieces** (all in `lib/analytics/`; see the current GitHub Verify run for this change):

- `counters.ts`: the list (`COMPUTABLE_COUNTERS`, `COUNTER_FAMILIES`, `WAITING_COUNTERS`, which is empty) and `buildCounters(report, journey, vocabulary, sources)`, pure, returning `{ totals, averages, labels }`. `counterRows` gives the preview rows.
- `counters-contract.ts`: the rules above, `cleanCounterPayload`.
- `counters-setting.ts`: the one switch, `admin_settings` document `messmass-counters`, **off unless a stored `true`**. A global admin changes it with the button on the Messmass tab (`components/admin/analytics/CountersSwitch.tsx`: **Switch sending on** asks first, **Switch sending off** is at once), which calls `PATCH /api/admin/settings/messmass-counters` (`GET` reads it); the tab shows who changed it and when. The switch pushes nothing itself.
- `counters-sync.ts`: `syncEventCounters(db, event, { force? })`. It reads the setting first and returns `disabled` having read and written nothing else; then checks the event is linked to messmass (`messmassEventId`); claims a throttle slot (one push per event per 30 seconds, one atomic update of `event.counterSync.pushedAt`, which also reads the event's `partnerId` and `annotationVocabulary`); computes the counters over the whole event with its vocabulary; skips a set equal to the last good push (`event.counterSync.counters`, labels included, so a relabelled option is pushed again); pushes. It never throws, so a hook needs no guard. Results: `pushed`, `unchanged`, `throttled`, `failed`, `disabled`, `not_linked`, `nothing_to_send`.
- `counters-trigger.ts`: `requestCounterSync(db, event)`, what a live path calls after a submission, vetting decision or Journey batch. **Fire-and-forget:** it never throws and the caller never waits (the promise it returns always resolves; do not await it in a request). It reads the setting first, and when it is off nothing else is touched; when it is on, it coalesces rapid requests and schedules a trailing whole-event refresh so the final totals are not dropped.
- `lib/messmassClient.ts` `pushPhotoStatsToMessmass`: `POST {MESSMASS_BASE_URL}/api/integrations/camera/events/<messmassEventId>/photo-stats` with `{ "totals": { ... }, "averages": { ... }, "labels": { ... } }`, the same secret as the link stats, a 5 second deadline through `fetchBounded`, and one `messmass.photo_stats_push` log line per attempt (outcome, status, time, how many counters; no numbers, no secret; issue 178); false on any refusal, never throws.
- The **Messmass tab** of the event's Analytics (global admins): a preview of the numbers as they are now with the name and the label of each, the setting, the link, the last push, and the counters that wait (none). It reads and sends nothing.

**Not done, on purpose, and what it needs:**

1. **The global switch is off by default.** The event Analytics → Messmass panel shows the preview and lets a global admin switch sending on. Switching it on does not immediately send a snapshot; a later enabled trigger schedules the first push. There is no manual “Send now” control.
3. **The receiver and variable catalog are live in messmass.** The route validates `camera_` names, writes only those `projects.stats` paths, keeps an audit copy, and creates missing `variables_metadata` entries without overwriting entries an operator already edited. Camera retries the next time a sync is triggered after a failed push.
4. CLAUDE.md section 8 applies in full: the pipeline is tested with fakes; the first production end-to-end proof is the owner's, at a real event.

## What cannot be computed yet, and why

Listed on the Overview as **Not measured yet** (`NOT_MEASURED` in `lib/analytics/report.ts`), never as zeros. Decline counts by reason are measured now from the list of reasons (declines made before the list existed are counted as "no reason from the list"):

| Not measured | Why | Waits for |
|---|---|---|
| Which QR or poster a visit or a photo came from | the redirect drops the link, so a visit cannot be tied to the link that brought the user (the visits per link are shown); passing it on changes the live redirect | link redirect |
| Country and city | the fields are never filled, and a place would need the IP address of the photo, which decision 243 stops keeping | a decision |
| Plays per hour or per screen | only a running count and the last time are kept; recording each play touches the giant screen, frozen until after the match | screen recording |
| Sign-ins by provider | `lastLoginAt` is declared and never written | a sign-in log |
| E-mail opens, clicks, bounces | not tracked, and a tracking pixel is not proposed | a decision |

The journey (visits, steps, camera permission, retakes, consent left, shares and downloads) was in this list in phase 1 and is measured now, on the Journey tab, **from the day the recording started**. Before that day nothing exists; an event with no journey record shows "not recorded", never zeros.

## Limits to know

- A user is a person who can be told apart by an e-mail or an account. Photos at events that do not ask for either are in the photo counts and not in the user counts. Team test photos are counted like any other (there is no list of team addresses any more: the old report hard-coded two).
- Plays are a running total: a re-run of a slideshow adds to it, and there is no time series.
- The day filter limits by the day the photo was **taken**; a photo taken on the last day and decided the next morning is in the range with its decision.
- An iPad that asks for the desktop site counts as a desktop.
- The Journey tab counts **visits** (page loads), not people, by **UTC** day, and the days chosen on the page are read as UTC days there. See [JOURNEY_RECORDING.md](JOURNEY_RECORDING.md) for the rest of its limits.

## Defects of the old report (audit section 2) and where they stand

(a) the stats strip with two branches that never ran: gone, the page is new. (b) "Total images" counted pending and rejected photos: the new numbers say what each state is. (c) the 5,000-row cap: **none in the new view** (a test reads 3,000 photos). (d) the end day left out: **both ends are included** (tested). (e) hard-coded e-mail exclusions: **none**. (f) links to `/admin/tryon/*` from the event tab: the Try-on tab stays inside the event. The Try-on tab itself is the old report and keeps its own defects until the try-on removal (issue 557).
