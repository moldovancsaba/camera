# Analytics (issue 521, phase 1)

The Analytics view of an event, and of all events together. It says what the data **that already exists** says: nothing is recorded for it and nothing about how a photo is taken, stored or shown changed. The plan and the owner's decisions are in [ANALYTICS_AUDIT.md](ANALYTICS_AUDIT.md) (decisions 241 to 246: counters only go to messmass, the order is the photo and vetting numbers on existing data first, the journey recording and the change of the photo's IP address after the match on 2026-10-16).

## Where it is

| Where | Who | What |
|---|---|---|
| Event menu **Analytics** (`/admin/events/<id>/analytics`) | the event's managers and global admins (the same rule as the Vetting tab next to it) | the numbers of the event, in tabs |
| Operations hub **Analytics** (`/admin/tryon/analytics`) | global admins | the same numbers over every event, and one row per event (the name opens that event's tab) |
| Tab **Try-on** (`?view=tryon`) | global admins | the try-on moderation report the menu used to be (unchanged; the try-on removal, issue 557, takes it away) |
| `GET /api/admin/events/<id>/export/analytics` | like the tab | the figures of every tab as one CSV (`section,item,value`), with the same days and clock |

Tabs are links (`?view=`), and the days and the clock are in the address too, so a report can be shared as a link. The tabs: **Overview** (the key figures, photos per day and per hour, what is not measured), **Photos and users**, **Vetting and people**, **Screens**, **Sources** (one event), **E-mails and consent**, **Try-on**.

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
| Devices | iPhone or iPad, Android, desktop, not recorded, from the stored user agent at read time (an iPad that asks for the desktop site looks like a Mac); nothing new is stored | `metadata.deviceInfo` |
| How the photo was provided, framing | `method` (camera, uploaded, not recorded), the `reframe` mode (fills, fits, moved or zoomed) and the front-camera share | `method`, `reframe` |
| Frames, messages, layouts chosen | the event's own frame by name; the generated frame by its message and by its layout image (labelled by the start of the file name, because that is all that names it) | `frameName`, `frameVariant.message`, `frameVariant.imageUrl` |
| Plays | the sum of the running play count of the counted photos, photos shown at least once, the share of the photos the screens may show (not waiting, not declined), the most played, by slideshow with its name, the time of the last play | `playCount`, `slideshowPlays`, `lastPlayedAt` |
| Link and QR visits (one event) | the counted visits of the tracked links and of the event's own short address, by link, phone kind and UTC day | `short_links`, `short_link_hits` |
| E-mails | welcome (registrations, sent), arrived, the photo link (sent, failed, skipped with the reason, by kind), declined (sent, not sent), follow up (not sent yet) | `metadata.*`, `email_registrations` |
| Consents | photos with and without a consent record, the records by the exact words the user read (the Who-are-you sentence when there was one, else the checkbox text), first and last time, the separate public gallery permission, the public wall choice | `consents[]`, `publicGalleryConsent`, `photoReview.shareOptIn` |

Days can be limited (`from`, `to`; **both included**, on the chosen clock): they limit the photos by the day they were taken, and the decisions and plays of those photos follow them. The link visits are limited by their own UTC day.

## What cannot be computed yet, and why

Listed on the Overview as **Not measured yet** (`NOT_MEASURED` in `lib/analytics/report.ts`), never as zeros:

| Not measured | Why | Waits for |
|---|---|---|
| People who opened the link, the step they reached and left at, time per step, how many finished | no page view, step or session is recorded anywhere | journey recording (phase 2, after the match) |
| Camera permission asked, granted, denied; retakes | the user sees it, the server does not; the camera diagnostics are log lines | journey recording |
| Consent left without accepting | only acceptances are stored, on the photo | journey recording |
| Shares by channel, share page views, downloads | `shareCount` and `downloadCount` are only ever set to 0; the share buttons make no server call | share page recording |
| Which QR or poster a photo came from | the redirect drops the link (the visits per link are shown) | journey recording |
| Decline counts by reason | free text today | the fixed list of reasons (decision 244) |
| Country and city | the fields are never filled; the IP address stored on every photo is read by nothing and storing it is to stop (decision 243) | the change of the photo's address (after the match) |
| Plays per hour or per screen | only a running count and the last time are kept | journey recording |
| Sign-ins by provider | `lastLoginAt` is declared and never written | a sign-in log |
| E-mail opens, clicks, bounces | not tracked, and a tracking pixel is not proposed | |

## Limits to know

- A user is a person who can be told apart by an e-mail or an account. Photos at events that do not ask for either are in the photo counts and not in the user counts. Team test photos are counted like any other (there is no list of team addresses any more: the old report hard-coded two).
- Plays are a running total: a re-run of a slideshow adds to it, and there is no time series.
- The day filter limits by the day the photo was **taken**; a photo taken on the last day and decided the next morning is in the range with its decision.
- An iPad that asks for the desktop site counts as a desktop.

## Defects of the old report (audit section 2) and where they stand

(a) the stats strip with two branches that never ran: gone, the page is new. (b) "Total images" counted pending and rejected photos: the new numbers say what each state is. (c) the 5,000-row cap: **none in the new view** (a test reads 3,000 photos). (d) the end day left out: **both ends are included** (tested). (e) hard-coded e-mail exclusions: **none**. (f) links to `/admin/tryon/*` from the event tab: the Try-on tab stays inside the event. The Try-on tab itself is the old report and keeps its own defects until the try-on removal (issue 557).
