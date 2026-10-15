# Journey recording (issue 521, phase 2)

An anonymous record of the steps users take through the capture pages, so the Analytics view can say how many visits opened the link, where they got to, how many saved a photo, how many denied the camera, retook, left consent, selected a sign-in method, clicked a CTA, shared or downloaded. Owner decision 241 (2026-10-10): **record the journey anonymously for everyone, and send messmass counters only.** The current data inventory and definitions are in [ANALYTICS_DATA_DICTIONARY.md](ANALYTICS_DATA_DICTIONARY.md); the audit and recommendations are in [ANALYTICS_AUDIT.md](ANALYTICS_AUDIT.md); dashboard figures are in [ANALYTICS.md](ANALYTICS.md).

**Status.** The beacon route, fixed vocabulary, daily counts, 30-day raw rows, kill switch, Journey tab and page beacons are built. The recording is **on by default** (owner decision 241) and a global admin can switch it off from the Journey tab. CTA action and Google/Facebook/Pseudo route choice are included in the vocabulary and report.

## The rule this is built on

The recording **must never slow, block or break the capture.** So:

- The page sends its records **fire and forget** (`lib/journey/client.ts`): nothing is awaited, every failure is swallowed, a hanging request is cut after a few seconds, at most one request is in flight, a visit sends at most 40 records, and the whole thing is a no-op unless the event answer says `journeyRecording: true`.
- The route answers **204 before it writes anything** (`app/api/observability/journey/route.ts`); the write runs after the answer. A slow or broken database cannot slow a beacon, and a failed beacon is simply lost.
- The route is rate limited (1,500 a minute per IP address, `RATE_LIMITS.JOURNEY`: a venue shares one), takes at most 4 KB, and keeps only what the vocabulary allows.
- **A kill switch** (below) stops it without a deploy.

## What is recorded

One record is a **name** from a fixed list, a **key** from that name's fixed list (a step, a channel, an outcome; never free text), and the **milliseconds since the page opened**. The lists are `JOURNEY_VOCABULARY` in `lib/journey/events.ts`, shared by the browser and the server: a name or key that is not in them can neither be sent nor stored.

| Name | Key | When | Recorded by |
|---|---|---|---|
| `journey.start` | the kind of device: `ios`, `android`, `desktop`, `unknown` | the capture page has the event | the page; the server makes the key from the request and does not keep the user agent |
| `journey.resume` | none | the capture flow returned from a completed sign-in | the page or the still-open capture tab; not counted as a visit |
| `step.reach` | `welcome`, `consent`, `who-are-you`, `cta`, `restart`, `frame`, `layout`, `message`, `camera`, `reframe`, `saved`, `thank-you` | a step reached for the first time in the visit | the page |
| `step.transition` | a fixed allowed `from>to` pair | direct transition between steps | the page |
| `consent.shown`, `consent.accept` | `page` (the consent page) or `box` (the box on the Who-are-you page) | once per visit and form | the page |
| `camera.permission` | `granted`, `denied`, `unavailable` | the live camera of a desktop was asked for (one record of each kind per visit) | the camera component |
| `photo.taken` | `system` (the phone's own camera app), `still`, `frame` | a photo was taken | the page |
| `photo.upload` | `started`, `succeeded`, `failed` | the established submission upload started or finished | the page |
| `photo.upload.attempt`, `photo.upload.result` | fixed method/device/outcome combinations | upload attempt and result, grouped by capture method and coarse device | the page/server |
| `photo.upload.duration` | fixed method/device/duration bands | upload elapsed-time band; exact duration and file size are not stored in Journey | the page/server |
| `photo.retake` | none | back from the move-and-zoom step to the camera | the page |
| `photo.save` | `ok`, `failed` | the save answered | the page |
| `journey.complete` | `under-1m`, `1-3m`, `3-10m`, `10-30m`, `over-30m` | a photo was saved during this visit; its legacy key is time to first save | the page |
| `journey.flow.complete` | the same duration bands | the guest reached the end of the configured journey after saving the photo; the key is total flow time | the page |
| `cta.click` | none | the first action pressed on a CTA page in this visit; counted once even if several CTA controls are pressed | the page |
| `cta.action` | `external`, `continue` | distinguishes external navigation from an in-flow action | the page |
| `cta.return` | none | the tab becomes visible/focused after an external CTA was opened; an intent signal, not proof of a completed external visit | the page |
| `login.method` | `google`, `facebook`, `pseudo` | an SSO provider clicked or a valid name-and-e-mail form submitted on the Who-are-you page | the page |
| `auth.result` | provider plus a bounded outcome category | SSO callback completed or failed; no identity, token or raw provider error is included | the server |
| `share.click` | `copy`, `facebook`, `twitter`, `linkedin`, `whatsapp` | a share button pressed | the page |
| `share.view` | none | the public photo page opened by a person (a link preview by a chat app or crawler is not one) | the server |
| `download` | none | the photo downloaded from the public photo page | the server |

**Never recorded in Journey:** an IP address, a user agent string, a cookie, a fingerprint, a name, an e-mail address, a photo, the address of a page or its query. The beacon route reads the user agent only to classify a device into a fixed category; upload events use this coarse category. A validated source-link slug is kept separately on a submission, not as a Journey field. The SSO callback records only a bounded outcome category.

**The visit id** is a random id the page makes when it opens and holds in its memory only (no cookie, local storage or persistent identity). It links raw rows for one page load and is not a person. To carry elapsed flow time through SSO, the recorder stores only an event-scoped start timestamp in `sessionStorage`; it is read on an explicit capture resume within six hours and cleared when the guest reaches the final configured page. It contains no visit ID, account, e-mail or provider. A normal reload starts a new visit.

## Where it is kept, and for how long

| Collection | What | Kept |
|---|---|---|
| `journey_daily` | counts by event, UTC day, name and key; completion duration sum and sample count | for good: aggregate numbers, no visit/person ID |
| `journey_events` | one row per record: `{ eventId, session, name, key, ms, at }` | **30 days**, then the database removes it (a TTL index on `at`, `expireAfterSeconds: 2592000`) |

**What the owner must run:** `npm run db:ensure-indexes` (needs `MONGODB_URI` and `MONGODB_DB`; safe to repeat) creates the indexes: `journey_events_at_ttl` (the 30 days), `journey_events_event_name_at` and the unique key of the daily count. The first write on each server instance also creates them (`lib/journey/store.ts`), so the 30 days hold even if the script was not run; running it is still the clean way and shows in its output whether they exist. Nothing is deleted by this change; the 30 days apply to new rows only.

The Analytics view and Messmass counters read **daily aggregates**. Average time from first page open through the final configured page after the photo is saved uses durable `journey.flow.complete` duration sum/sample count. Median and duration bands use raw `journey.flow.complete` rows retained for 30 days. The existing `journey.complete` saved-photo counts remain available and keep their prior meaning; the new full-flow measurement starts with this release and is not backfilled. A guest who leaves before the final page is not a completed-flow sample. Selected dates filter by the UTC day the guest reached the final page. An SSO resume uses the tab's saved start timestamp, so the elapsed duration spans its page reload. Provider choice is separate from the SSO callback outcome.

## Where the page records

`app/capture/[eventId]/page.tsx` carries one hook call (`useJourneyRecorder`, which only **reads** the page's state: the phase, the page type, the step, the consent, the capture method) and four one-line calls where something happens that is not a change of place: the save result (`journey.saved`), the copy and the social share buttons (`journey.record('share.click', ...)`). `components/camera/CameraCapture.tsx` records the camera permission. The share page (`app/share/[id]/page.tsx`) and the download (`app/api/share/[id]/download/route.ts`) record `share.view` and `download` on the server, after the response, and only for a person (`isCountableVisit`: not a HEAD request, a prefetch, a missing user agent, a chat app's link preview or a crawler). Where the steps are mapped is `lib/journey/steps.ts` (pure, tested).

## What was checked

Unit tests (`lib/journey/*.test.ts`, the route, the share page and download tests) cover the vocabulary, the caps, the kill switch, the batching, the one-request-at-a-time rule, a clock, timer, request or beacon that throws, and that nothing personal is stored. The whole capture page was also compared **before and after in a browser** (an esbuild bundle of the real page, the API mocked, a fake camera; Playwright; phone 390 x 844 with touch and desktop 1280 x 800), with the journey endpoint answering 204, answering 500, hanging forever and being blocked, and with the recording switched off and unknown to the server: every visible element of the camera step, the move-and-zoom step (before and after a retake), the saved step and the next photo is at the same place with the same words, the save carries the same fields and is not slower, nothing overflows, a switched-off recording sends not one request, a hanging endpoint costs at most four requests, and no beacon holds anything personal. The harness is described in the pull request.

## The kill switch

`admin_settings` document `journey-recording` (`lib/journey/setting.ts`). **On unless switched off**: only a stored `enabled: false` turns it off.

- Switch it from the **Journey tab** of the Analytics view (global admins; the button asks first, in the page). `PATCH /api/admin/settings/journey-recording { enabled }`.
- Off: the event answer for the capture page carries `journeyRecording: false`, so a page opened from now on sends nothing at all; and the beacon route, for the pages opened before, answers 204 and **writes nothing**; the server's own records (`share.view`, `download`) stop too.
- It takes effect on every server within 30 seconds (the value is kept in memory that long) and at once on the one that handled the switch. What was recorded stays.
- If the setting cannot be read the recording stays on (a recording that stops by accident would lose the match without anyone having decided it).

## The figures (Journey tab)

Defined in `lib/analytics/journey.ts`; the same numbers feed the CSV export and the counters for messmass.

- **Visits** = `journey.start`: one load of the capture page with the event, not a person. The same user opening the link twice is two visits; a return from a sign-in is not one.
- **Saved a photo** = `journey.complete`: visits that saved at least one photo (retained for continuity). **Finished journeys** = `journey.flow.complete`: visits that reached the final configured page after saving; full-flow completion rate = finished over visits. The separate `photo.save` event records save outcomes.
- **Steps reached** = `step.reach` per step, each visit once per step.
- **Step transitions** = direct from/to edges; each edge's share is divided by visits reaching its source step. It shows observed progression, not a causal abandonment reason.
- **Camera denied / granted / not available** = `camera.permission` (not available: no camera, in use by another program, or it failed). **Only the live camera of a desktop asks**; a phone takes the photo with its own camera app and asks nothing on the page, so a phone never appears here.
- **Retakes** = `photo.retake`; per photo taken = retakes over `photo.taken`. Temporary upload starts, successes and failures are counted separately under Camera, photos and saving.
- **Consent left** = shown minus accepted, for the consent page and for the box on the Who-are-you page separately, never below zero.
- **Shares** = `share.click`; **photo page views** = `share.view`; **downloads** = `download`.
- **Average selfie flow time** = durable completed-flow duration total / sample count, from first page through the final configured page after photo saving. **Median and duration bands** use raw completion rows retained for 30 days. SSO resumption within six hours retains the flow's start time.
- **CTA click rate** = visits with an action pressed on a CTA page / visits that reached a CTA page. At most one click is counted per visit; action type and a tab-return signal are separate.
- **Sign-in and identity choices** = Google/Facebook provider clicks and valid Pseudo form submissions. SSO callback outcomes are shown separately by provider and fixed category.
- **Upload reliability** = attempt/success/failure counts by coarse device and capture method, with elapsed duration bands. Image content, file size and exact network details are excluded.
- **Source conversion** = validated tracked-link visits joined to photo submissions by source slug. Arbitrary query parameters are not accepted.

**Limits to know.** Recorded **from the day the recording started**; nothing exists before, and an event with no record shows "not recorded", never zeros. Days are **UTC days**. Opens are recorded once the page has the event, so a page closed before the event answer arrived is not counted. The browser sends the records, so someone can inflate them (a rate limit and the fixed vocabulary bound it): the figures are for the service and the organisers, not a measure of anything paid for. A reload counts as another visit.

## For messmass

Counters only, never a person (decision 241): when the global sender switch is enabled, vetting, people-marking, new submissions, Journey batches and tracked-link hits schedule an aggregated event snapshot. The `camera_` payload includes duration sums/sample counts, journey step transitions, CTA actions/returns, bounded SSO outcomes, upload outcomes and duration bands, source counts, review queue age bands, and event-scoped repeat submitter counts. It sends no Journey ID, photo, identity key or individual authentication choice. The switch remains off by default. See [ANALYTICS_DATA_DICTIONARY.md](ANALYTICS_DATA_DICTIONARY.md) for counter definitions and limits.

## Files

`lib/journey/events.ts` (vocabulary, `parseJourneyBatch`), `lib/journey/setting.ts` (kill switch), `lib/journey/store.ts` (the writes, the event lookup), `lib/journey/client.ts`, `lib/journey/steps.ts` and `lib/journey/useJourneyRecorder.ts` (the page side), `app/api/observability/journey/route.ts`, `app/api/admin/settings/journey-recording/route.ts`, `lib/analytics/journey.ts`, `components/admin/analytics/JourneySection.tsx` and `JourneySwitch.tsx`.
