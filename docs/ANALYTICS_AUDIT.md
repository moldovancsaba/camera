# Analytics audit: what we know about the users and the service, what we could know, and how to feed messmass

Audit of 2026-10-09 (issue 521; owner request 2026-10-09: "The analytics menu is fully not ok. It says 'Try-On Analytics'. The analytics has to collect all user interaction we collect or can collect! When, where, how and what they do ... how many images taken, shown on slideshow, vetting average time, who managed and how many images accepted, declined, why declined ... check what works now, find how the actual analytics works, make an audit what type of activities we have and where and how can we add to our system to know everything about the users and our service and the habits to have the largest KYC possible. We need to feed messmass with these data").

How it was made: two read-only sweeps of the camera and messmass code, whose findings were checked against the code where this document relies on them; and read-only counts on the production database on 2026-10-09 (nothing was written). What is **measured** is marked as such; what comes from the code sweep is marked **(code)**; what is a proposal is in sections 6 to 9.

## 1. The short answer

1. **The Analytics menu is a try-on moderation report and nothing else.** It reads archived AI try-on results and try-on jobs; an event without try-on shows zeros. It says nothing about the photo journey, the screens, vetting by people, the share page or the e-mails.
2. **The data for most of the KPIs you named already exists in the database**, but nothing reads it together: photos taken, plays on the screens (441,891 plays measured), who approved or declined and when (with a free-text reason), the vetting time (derivable). What is **not recorded at all** is the guest's journey: how many people opened the link, where they stopped, whether they allowed the camera, how many retakes, which share button they used, which QR or poster they came from. There is no page-view, step or session counter anywhere, and no analytics service.
3. **Messmass receives four numbers from camera and no photo counts** (QR visits, link visits, Android and iPhone QR scans), through one throttled channel. Feeding it the photo and vetting numbers needs one new route in messmass, variable registration, and a totals builder, a client and a sync in camera, copying the existing pattern.
4. **"The largest KYC possible" needs a decision first, not code.** Recording what a person does and who they are is personal data: it needs a stated purpose, a legal basis, the consent the journey already asks for, and a retention time. The proposal below separates three levels and sends messmass **counters**, not people. Today camera already stores more than it uses about every guest (the full user-agent and the IP address of every photo, never read by any code): that is a finding in itself.

## 2. What the Analytics menu is today (code)

| Question | Answer |
|---|---|
| Where | Event tab "Analytics" (`lib/adminNavigation.ts:276`, "Try-on analytics of the event", global admins only); the try-on hub's Analytics card; the event overview calls the same page "Asset Health Report". One page, `app/admin/tryon/analytics/page.tsx`, wrapped by `app/admin/events/[id]/analytics/page.tsx`. |
| Why the title | Hard-coded `Try-On Analytics`, eyebrow "Apps", the action "Open Try-On App" (`analytics/page.tsx:82-84`). The data really is try-on only. |
| What it reads (`lib/tryon/analytics.ts`) | `submissions` with `submissionKind: 'tryon_result'` and `tryOnModerationArchive.archived: true` (lines 266-269), the `tryon_jobs` collection and `leather_suits`. Funnel (submitted, queued, processing, generated, approved, declined, service, superseded, failed), hourly outcomes in UTC, tables by preset, garment and event, preset performance, and on the global view a "Multi-event customers" table by e-mail. |
| Filters and export | Bucket, event, from and to date. CSV or JSON export in sections (`app/api/admin/tryon-analytics/export`). |
| Defects found | (a) The stats strip has two branches that can never run (`analytics/page.tsx:93-106`) and the numbers they would show ("Total images", "Original captures", "Customer e-mails") exist only on the event overview. (b) "Total images" counts every non-archived submission, pending, rejected and broken ones too (`analytics.ts:629-727`). (c) Both main queries are cut at 5,000 rows (`analytics.ts:170, 322`): a large event is silently truncated. (d) The date inputs send `YYYY-MM-DD` and the filter compares them as strings with ISO times (`analytics.ts:285-290`): the end day is probably left out (read from the code, not run). (e) E-mail exclusions are hard-coded (`@seyuselfies.com`, `m@m.m`). (f) Some links always point to `/admin/tryon/*` from the event tab. |

## 3. What is recorded today

DB = a database write; Log = a log line only (Vercel runtime log: not ours to keep or query).

### 3.1 The guest

| What | Where it is written | DB / Log | Fields |
|---|---|---|---|
| The photo | `app/api/submissions/route.ts` (insert at 429) | DB `submissions` | user id (`anonymous` when not signed in), name and e-mail, frame id/name/category, the chosen frame variant (message), event, partner, method (`camera_capture` or `file_upload`), status, created and updated, the try-on request, the reframe (mode, zoom, crop, mirrored), sizes, share visibility |
| Device and IP | `submissions/route.ts:381-383` | DB `metadata` | the full user-agent and the **IP address of every photo**; `deviceType` is always "unknown"; nothing reads the IP or classifies the agent (**code**) |
| Declared, never filled | `lib/db/schemas.ts:847-861` | none | browser info, country, city, geolocation, processing time |
| Name and e-mail | `submissions/route.ts:255-262` and the contact PATCH | DB `userInfo` | name, e-mail, collected at |
| Consent | `submissions/route.ts:265-296` | DB `consents[]` | page, exact text, link, the sentence read (new), accepted, time. Only acceptances exist: someone who leaves at the consent page leaves nothing. |
| Welcome registration | `lib/email/triggers.ts:81-109` | DB `email_registrations` | event, e-mail, name, first and last seen, welcome sent |
| The camera | `CameraCapture.tsx`, `SystemCameraCapture.tsx` -> `/api/observability/capture-diagnostic` | **Log** | random session id, camera mode asked and granted, timings, outcome, retries, brightness, sizes, method, viewport, a test label, the user-agent cut at 200 characters. Summarised offline by a script. |
| Crashes | `app/error.tsx` -> `/api/observability/client-error` | **Log** | digest, message, url, user-agent |
| Broken picture | `lib/media/broken.ts` | DB `mediaHealth` | broken, reason, checked at |

### 3.2 Photo vetting and the people who manage

| What | Where | DB / Log | Fields |
|---|---|---|---|
| Approve or reject a photo | `lib/photo-vetting/review.ts` | DB `submissions` | `reviewStatus`, `reviewHistory[] {action, by, at, reason}` (the reason is free text, 500 characters), approved at/by. **A reject sets no reviewed-at or reviewed-by**: only `reviewHistory` has the actor and the time (**code**). The vetting time is derivable (`photoReview.submittedAt` to `reviewHistory.at`) and is not stored. |
| Try-on decisions | `app/api/admin/tryon-results/*` | DB `submissions`, `tryon_moderation_events` | decision, reviewed at/by, archive bucket (approved, rejected, service, superseded) with a reason, and an audit row per action (actor, time, before and after) |
| Switch vetting on or off | `app/api/events/[eventId]/route.ts` | DB `events.photoVetting` | required, updated at/by |
| Everything else the people who manage do | the **activity log** (issue 517, new 2026-10-09) | DB `activity_log` | when, who, role, method, path, status, outcome, the reason of a failure. It records the path and the status, not the body, so it cannot tell an approval from a rejection: the vetting record above holds that. |
| Sign-ins | `lib/auth/*` | **Log** | console lines with the e-mail; `lastLoginAt` is declared and never written |

### 3.3 The screens, the links, the share page, the e-mails

| What | DB / Log | Fields |
|---|---|---|
| Slideshow plays (`played` route) | DB `submissions.playCount`, `slideshowPlays.<id>.count`, `lastPlayedAt` | a running count per photo and per slideshow: no per-play row, no screen, no duration |
| Screen diagnostics | **Log** | session, uptime, slide timings, stalls, errors |
| QR and link visits | DB `short_link_hits` | one row per link, UTC day and device kind (android, iphone, other), a count; people only (bots, previews and prefetch are excluded). The redirect drops the link: a photo cannot be tied to the QR or poster it came from. |
| Share page views, downloads, share clicks | **nothing** | `shareCount` and `downloadCount` exist on every submission and are only ever set to 0 (**code**); the share buttons make no server call |
| E-mails | DB `submissions.metadata` (result e-mail), `email_registrations` | sent or failed and when for the result e-mail; a failed arrived or welcome e-mail leaves no reason; no opens, clicks or bounces |

## 4. What the data supports today (measured, 2026-10-09)

| Figure | Value | Note |
|---|---|---|
| Submissions | 1,667 | 727 original photos, 597 try-on results, 343 older ones without a kind |
| Taken with the camera / uploaded | 1,317 / 7 | the other 343 have no method |
| Original photos by decision | 59 approved, 8 rejected, 660 not decided or from before vetting | |
| Try-on results by decision | 542 approved, 55 rejected | 597 have a reviewer and a time |
| Photos with a full vetting history | 67 | action, who, when, reason; e.g. one decided 2 minutes after it was taken, another about 10 hours |
| Decline reasons | free text only ("No"); no fixed list | "why declined" cannot be counted by reason today |
| Plays on the screens | 441,891 plays on 383 photos | a running count only |
| Consent records per submission | 0: 328, 1: 1,176, 2: 16, 3: 77 | 328 submissions have no consent record: older photos and, until the fix of 2026-10-09, photos of people who signed in with Google or Facebook (the acceptance was lost in the redirect) |
| Tracked link rows | 2 links, 6 hit rows | |
| Analytics collections | none (no page views, no sessions, no interaction log) | |

So **today** we can report: photos taken (by event, day, method), approved and rejected (with who and when), the vetting time of the 67 photos that have a history, plays per photo, consent counts, QR and link visits by day and device, e-mails sent. We cannot report anything about the journey itself.

## 5. Gaps

**The guest's journey (nothing is recorded):** how many people open the link; the step they reach and leave at (welcome, consent, who-are-you, frame, camera, reframe, preview, share, thank-you); time per step and from landing to saved photo; camera permission denied, camera missing or in use (the user sees an error, the server sees nothing); retakes, reframe changes, abandoned photos; frames and messages browsed and not chosen; consent abandoned; the sign-in provider used; share clicks by channel, share-page views, downloads; the QR or poster the visit came from; a structured device class and browser (only the raw user-agent exists); the browser language; client errors other than a crash; e-mail opens, clicks and bounces.

**The people who manage:** vetting by reason (no fixed list); vetting time as a stored number; management reads (the export of e-mails and images) are never logged; role and status changes leave only a console line; no sign-in audit; short links and reload requests store no actor. (The management routes that did not reach the activity log were wrapped on 2026-10-09 and a test keeps it that way.)

**The screens:** plays per hour, per screen and per slideshow (only a running count exists); the diagnostics are log lines.

**Messmass:** the photo and vetting numbers (section 6).

## 6. How camera feeds messmass today (code), and what a new feed needs

- **One channel, four numbers.** `POST {MESSMASS_BASE_URL}/api/integrations/camera/events/{messmassEventId}/link-stats` with `{ totals: { visitQrCode, visitShortUrl, qrscanAndroid, qrscanIphone } }` (`lib/messmassClient.ts:136-153`, `lib/short-links/totals.ts`). Whole running totals, a 5 second timeout, never throws. Authenticated with the shared secret `CAMERA_MESSMASS_INTERNAL_SECRET` (messmass compares it with a plain `!==`, not constant time: a small finding for the messmass side).
- **When it runs:** after a counted visit (throttled to one push per event per 30 seconds, skipped when the totals are unchanged) and when an admin opens the event's links. **An event that has only its own short address and no tracked link never pushes**, although its visits are recorded (`lib/short-links/sync.ts:33`).
- **On the messmass side** (`app/api/integrations/camera/events/[messmassEventId]/link-stats/route.ts`, `lib/cameraLinkStats.ts`): writes `stats.<key>` of the event's project as a baseline plus camera's total, idempotent. `qrscanAndroid` and `qrscanIphone` are not registered as variables in any seed script of the repository; `visitQrCode` and `visitShortUrl` are.
- **What messmass means by KYC:** the catalog of every variable it knows (`/admin/kyc`, collection `variables_metadata`); a variable's name is the same string as the key in `projects.stats`, the clicker counter and the `[name]` in chart formulas; camelCase; types count, numeric, percentage, currency, text. Images already have names there: `remoteImages`, `hostessImages`, `selfies`, `allImages` (derived), `approvedImages`, `rejectedImages`.
- **What a new feed needs:** (1) a sibling route in messmass, `.../camera/events/[messmassEventId]/photo-stats`, guarded by the same `assertCameraSecret`, using the same baseline-plus-total write; (2) variables registered in `variables_metadata` (a seed script: a stat without an entry is stored but invisible), never `derived: true` (a derived variable is silently skipped by the pushes), type count, not editable by hand where camera owns the value; (3) in camera a totals builder over `submissions`, a client with the same shape and timeout, and a sync with the same throttle and unchanged-skip, triggered on a vetting decision, on a play, and by a daily job; (4) names that do not collide with what operators type in the clicker (`selfies`, `remoteImages`): either baseline plus total or separate `camera*` variables. Averages are not additive: send them as a whole value with no baseline. **No test data goes into production messmass** (`CLAUDE.md` section 8): the feed is tested with fakes and a database of its own.

## 7. Proposal: one record of an interaction, and what is recorded

### 7.1 Three levels of knowing (the decision behind "the largest KYC")

| Level | What | Basis | Kept |
|---|---|---|---|
| **0 Anonymous counts** | counters per event, day and step (how many opened, reached, left, took, retook, shared) with no person in them | legitimate interest of the service, no personal data | as long as wanted |
| **1 Pseudonymous session** | a random id per page load (as the camera diagnostics already do), the step sequence and timings, a device class (not the raw agent), the source (QR placement), no name, no e-mail, no IP | the same, and stated in the privacy notice | the raw rows 30 days, the counts for ever |
| **2 Identified** | name, e-mail, consents, the photo, who they are in messmass terms | the consent the journey already collects (the accept page), the purpose written in it | per the privacy notice; erasable (the delete flow exists) |

The proposal records **levels 0 and 1 for everyone**, keeps **level 2 where it is today** (the submission), and sends messmass **level 0 counters**. "Everything about a person" across events (a profile) is level 2 plus linking and needs its own consent text and a lawful purpose; it is the owner's decision (below), not a default.

### 7.2 The record

One function writes every interaction, so no page invents its own: `recordInteraction({ event, session, name, fields })`, from the browser as a batched beacon (`navigator.sendBeacon`, like the capture diagnostics) to one route (`/api/observability/journey`), which sanitises it (an allow-list of names and fields, sizes capped, no free text) and does two things: **adds to a daily rollup** (`interaction_daily`: event, day, name, a small key such as the step or the channel, a count: one `$inc`, like `short_link_hits`, cheap at match-day volume) and keeps the **raw row for 30 days** (a TTL index) for the funnel and timing views. The same record is the source of the Analytics menu and of the messmass counters.

### 7.3 What is recorded (names, where, fields)

| Name | When | Fields (no free text) |
|---|---|---|
| `journey.start` | the capture page opens | source (the QR or link placement, passed by the redirect as `?src=`), device class, browser language, event language |
| `page.view`, `page.leave` | every journey page | page type, index, time on page |
| `consent.accept` / `consent.abandon` | accepted / left on the consent page or the acceptance box | which form (page or the one box) |
| `login.method`, `login.fail` | sign-in | google, facebook or form; a failure code |
| `camera.permission` | the camera was asked for | granted, denied, not found, in use; method; start time |
| `camera.shutter`, `camera.retake`, `reframe.change` | taking the photo | attempt, view (portrait or landscape, wide or tight, issue 525), zoom |
| `frame.browse`, `frame.choose` | the frame step | frame id, variant, count browsed |
| `photo.save` | the photo is saved | ok or failed, time, size |
| `share.click`, `share.view`, `download` | after the photo | channel; view of the public photo page; the download |
| `email.result` | e-mails | sent, failed, a reason code (opens and clicks need a tracking pixel and links: not proposed) |
| `screen.slide` | the giant screen shows a photo | slideshow, photo (the running count stays as it is); per hour rollup |
| `client.error` | an error the user saw | a code and the step |

For the people who manage: the activity log stays the audit; the vetting decision gets a **reason code from a fixed list** (for example: not me, unclear, inappropriate, duplicate, other + free text) and a stored **time to decision**, so "why declined" and "average vetting time" are counted, not parsed.

### 7.4 The KPIs, defined

Photos taken (by event, day, method) = submissions of kind original, not archived, not broken. Shown on the slideshow = sum of plays; per hour from `screen.slide`. Vetting: decided / pending, approval rate, average and median time to decision, by person (`reviewHistory.by`), declines by reason code. Journey: opened, reached each step, completion rate (opened to saved), drop-off per step, time per step and in total, camera permission rate, retakes per photo, share rate by channel. Consent: accepted, abandoned. Sources: opens and photos per QR placement. E-mails: sent, failed by reason.

### 7.5 The Analytics menu, rebuilt

Event tab **Analytics** (visible to the people who manage the event, not only global admins): **Overview** (the KPIs above for the event and a time range), **Journey** (the funnel and the time per step), **Vetting** (decisions, reasons, times, by person), **Screens** (plays per hour, per slideshow), **Sources** (QR placements), **Try-on** (what exists today, kept as one tab). Export as CSV from every tab. The defects of section 2 are fixed on the way (no row cap, an inclusive end date, no hard-coded e-mails).

### 7.6 Messmass

One new daily-and-on-decision push of **counters** per event, level 0 only: `imagesTaken`, `imagesApproved`, `imagesRejected`, `imagesShownOnSlideshow` (plays), `avgVettingSeconds`, `journeyOpens`, `journeyCompleted`, `cameraDenied`, `retakes`, `shares`, `downloads`, `consentAccepted`, `consentAbandoned`, one `declined<Reason>` per fixed reason, and the QR and link visits it already receives (with the own-short-address gap closed). Names are camelCase and registered in the KYC catalog; the people who vetted are **not** variables (a name is personal data): messmass gets the totals.

## 8. Order of work

Nothing in the live capture path changes before the match on 16 October.

| Step | What | Live risk |
|---|---|---|
| A | The fixed reason list and the stored time to decision in vetting (a small change in the vetting UI and `review.ts`) | low; touches vetting, so after the match |
| B | The interaction record: the route, the allow-list, the rollup and the raw rows with their TTL; the client function; no page emits anything yet | none |
| C | Emit the events: the journey pages, the camera, the share page, the screens | medium: it touches the capture page; behind a switch per event, off by default |
| D | The Analytics menu, rebuilt (read-only on top of B and the existing data; the vetting and photo tabs can ship first, they need only existing data) | none |
| E | The messmass feed: the route in messmass, the variables, the totals builder and sync in camera | none for guests; messmass is production: fakes only until the owner's first real event |
| F | The privacy side: the notice text, the retention (the IP and the raw user-agent stored on every photo today), the erase flow covering the new records | the owner's decisions |

## 9. Decisions for the owner

- **241:** the three levels of section 7.1: record levels 0 and 1 for everyone and send messmass counters only. Recommendation: yes.
- **242:** a person-level profile across events ("the largest KYC"): not by default; it needs a consent text and a purpose of its own. Do you want it, and for what?
- **243:** the IP address and the full user-agent are stored on every photo today and no code reads them. Recommendation: stop storing the IP and keep a device class.
- **244:** the fixed list of decline reasons (section 7.3) and its wording, English and Hungarian.
- **245:** the list of messmass variables of section 7.6, and whether camera counters get names of their own (`camera*`) or share `selfies` and `approvedImages`.
- **246:** the order: D (the vetting and photo tabs on existing data) and A first, B and C after the match; E when a real event can be watched. Is that the order?

## 10. What was and was not checked

Checked by me: the production counts of section 4; the activity log hole (ten management route files outside the shared handler, now fixed); that the share and download counters are only ever initialised; that the redirect drops the link; that a reject stores its actor in `reviewHistory` and no reviewed-at; that no analytics collection exists. From the code sweep, not re-run: the line references of sections 2, 3 and 6, the defects (c) to (f) of section 2 (the end-date one is a reading of the code, not a run), and the messmass side. Not done: any change to the capture path or to messmass; no test data was written anywhere.
