# Analytics (issue 521)

The Analytics view of an event, and of all events together. **Phase 1** says what the data that already exists says (photos, vetting, users, screens, links, e-mails, consents): nothing is recorded for it. **Phase 2** adds the **Journey** tab, from an anonymous recording of the capture pages ([JOURNEY_RECORDING.md](JOURNEY_RECORDING.md): what is recorded, what never is, the 30 days, the kill switch). The plan and the owner's decisions are in [ANALYTICS_AUDIT.md](ANALYTICS_AUDIT.md) (decisions 241 to 246: counters only go to messmass, the order is the photo and vetting numbers on existing data first, the journey recording and the change of the photo's IP address after).

## Where it is

| Where | Who | What |
|---|---|---|
| Event menu **Analytics** (`/admin/events/<id>/analytics`) | the event's managers and global admins (the same rule as the Vetting tab next to it) | the numbers of the event, in tabs |
| Operations **Analytics** (`/admin/analytics`; the old address `/admin/tryon/analytics` is redirected) | global admins | the same numbers over every event, and one row per event (the name opens that event's tab) |
| `GET /api/admin/events/<id>/export/analytics` | like the tab | the figures of every tab as one CSV (`section,item,value`), with the same days and clock |

Tabs are links (`?view=`), and the days and the clock are in the address too, so a report can be shared as a link. The tabs: **Overview** (the key figures, photos per day and per hour, what is not measured), **Journey** (one event: visits, steps reached, photos saved, camera permission, retakes, consent left, shares and downloads, and the kill switch of the recording; the days are UTC days), **Photos and users**, **Vetting and people**, **Screens**, **Sources** (one event), **E-mails and consent**, **Messmass** (global admins: a preview of the counters that would go to messmass, nothing is sent). There is no Try-on tab any more (it went with the try-on integration, issue 557; an old `?view=tryon` address shows the Overview).

## What is counted

The photos filed under the event (its UUID in `eventId` or `eventIds`) that are originals (a missing `submissionKind` is an original: 343 older photos have none), not removed from the event by an admin (`isArchived`) and whose picture is not gone (`mediaHealth.broken`). The last two are named in the line above the tabs, not counted. Try-on results are not photos of this report. A photo an editor added in the gallery (`metadata.adminGalleryUpload`) is counted apart ("added by editors"): nobody took it, though the screens show it.

`lib/analytics/facts.ts` reads a database document once into a small record (`PhotoFacts`); `lib/analytics/report.ts` turns the records into the report; `lib/analytics/load.ts` is the only part that touches the database (read only, a narrow projection, **no row cap**: the old try-on report silently cut its queries at 5,000 rows). Every aggregation is a pure function with unit tests.

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
| Decline reasons | the free text of each decline, counted without regard to case or spacing; declines with and without a reason. **Counts by reason need the fixed list (decision 244).** | `reviewHistory[].reason` |
| People marked | `summarizePeople` over the photos a reviewer looked at: people, who (gender and age), emotion, merchandise; who marked | `people`, `peopleReview` |
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

## Counters for messmass (prepared, switched off, never sent)

Owner decision 245: the numbers sent to messmass are the list of the audit (section 7.6), **counters only, never a person** (decision 241). Phase 1 prepares the pipeline; **nothing was sent to messmass, and nothing can be until the owner decides**.

| Counter | Kind | What it counts | Status |
|---|---|---|---|
| `imagesTaken` | total | photos taken or uploaded by users (the counted photos above, editors' uploads not included) | computed |
| `imagesApproved`, `imagesRejected` | total | of those, approved and declined now | computed |
| `imagesShownOnSlideshow` | total | plays: the sum of the running play count of the event's counted photos, all slideshows | computed |
| `avgVettingSeconds` | average | average time from the photo to its first decision, whole seconds; **left out until a photo was decided** | computed |
| `consentAccepted` | total | photos whose user accepted at least one consent | computed |
| `journeyOpens`, `journeyCompleted`, `cameraDenied`, `retakes`, `consentAbandoned`, `shares`, `downloads` | total | from the journey recording ([JOURNEY_RECORDING.md](JOURNEY_RECORDING.md)): visits, visits that saved a photo, times the live camera of a desktop was refused, retakes, consent shown and not accepted, share buttons pressed, downloads of the photo | computed **since the recording started**; not sent at all for an event that has no journey record |
| `declined<Reason>` | | the reason is free text | waits for the fixed list of reasons (decision 244) |

A counter that cannot be counted is **never sent as a zero**: a zero would say nobody did it. An event with no journey record sends no journey counter, even though the recording is running for the others. The visits of the tracked links (`visitQrCode`, `visitShortUrl`, `qrscanAndroid`, `qrscanIphone`) already reach messmass through their own channel (`docs/SHORT_LINKS.md`) and are not in this list; the audit's note that an event with only its own short address never pushes (`lib/short-links/sync.ts`) is untouched, because that path is live.

**The pieces** (all in `lib/analytics/`, unit-tested with fakes only, no database and no network):

- `counters.ts`: the list (`COMPUTABLE_COUNTERS`, `WAITING_COUNTERS`) and `buildCounters(report)`, pure. A total is a **whole running total** for the event (never a day's change), so a repeated push changes nothing; an average is not additive and is sent as a whole value that messmass stores as it is, with no baseline.
- `counters-setting.ts`: the one switch, `admin_settings` document `messmass-counters`, **off unless a stored `true`**.
- `counters-sync.ts`: `syncEventCounters(db, event, { force? })`. It reads the setting first and returns `disabled` having read and written nothing else; then checks the event is linked to messmass (`messmassEventId`); claims a throttle slot (one push per event per 30 seconds, one atomic update of `event.counterSync.pushedAt`); computes the counters over the whole event; skips a set equal to the last good push (`event.counterSync.counters`); pushes. It never throws, so a hook needs no guard. Results: `pushed`, `unchanged`, `throttled`, `failed`, `disabled`, `not_linked`, `nothing_to_send`.
- `lib/messmassClient.ts` `pushPhotoStatsToMessmass`: `POST {MESSMASS_BASE_URL}/api/integrations/camera/events/<messmassEventId>/photo-stats` with `{ "totals": { ... }, "averages": { ... } }`, the same secret as the link stats, a 5 second deadline through `fetchBounded`, and one `messmass.photo_stats_push` log line per attempt (outcome, status, time, how many counters; no numbers, no secret; issue 178); false on any refusal, never throws.
- The **Messmass tab** of the event's Analytics (global admins): a preview of the numbers as they are now, the setting, the link, the last push, and the counters that wait. It reads and sends nothing.

**Not done, on purpose, and what it needs:**

1. **No trigger.** Nothing calls `syncEventCounters`. The audit's triggers (a vetting decision, a play, a daily job) are on the approver's screens and the giant screen, which are frozen until after the match, and the owner makes the first real push.
2. **No switch on a screen.** The setting can only be stored in the database today; the switch (and a manual "Send now" for one chosen event) come together with the trigger.
3. **The receiving side does not exist.** messmass has no `photo-stats` route and none of these names is registered in its variable catalog (`variables_metadata`; a stat without an entry is stored but invisible, and a derived variable is silently skipped). The audit's section 6 lists what that route needs: the same secret check, the baseline plus camera's total write for the totals, the whole value for the average, names that do not collide with what operators type in the clicker. Until it exists a push is refused (false), which the sync reports as `failed` and does not remember.
4. CLAUDE.md section 8 applies in full: the pipeline is tested with fakes; the first end-to-end proof is the owner's, at a real event.

## What cannot be computed yet, and why

Listed on the Overview as **Not measured yet** (`NOT_MEASURED` in `lib/analytics/report.ts`), never as zeros:

| Not measured | Why | Waits for |
|---|---|---|
| Which QR or poster a visit or a photo came from | the redirect drops the link, so a visit cannot be tied to the link that brought the user (the visits per link are shown); passing it on changes the live redirect | link redirect |
| Decline counts by reason | free text today | the fixed list of reasons (decision 244) |
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
