# Journey recording (issue 521, phase 2)

An anonymous record of the steps users take through the capture pages, so the Analytics view can say how many people opened the link, where they got to, how many saved a photo, how many said no to the camera, retook, left the consent, shared and downloaded. Owner decision 241 (2026-10-10): **record the journey anonymously for everyone, and send messmass counters only.** The plan is in [ANALYTICS_AUDIT.md](ANALYTICS_AUDIT.md) (sections 7.1 to 7.3, steps B and C); the figures are in [ANALYTICS.md](ANALYTICS.md).

**Status.** The receiving side is built: the beacon route, the vocabulary, the daily counts and the raw rows, the kill switch, the Journey tab and the counters for messmass. The capture page starts sending with the second pull request of the issue (the page beacons); until then no page emits anything and the Journey tab says "nothing recorded".

## The rule this is built on

The recording **must never slow, block or break the capture.** So:

- The page sends its records **fire and forget** (`lib/journey/client.ts`): nothing is awaited, every failure is swallowed, a hanging request is cut after a few seconds, at most one request is in flight, a visit sends at most 40 records, and the whole thing is a no-op unless the event answer says `journeyRecording: true`.
- The route answers **204 before it writes anything** (`app/api/observability/journey/route.ts`); the write runs after the answer. A slow or broken database cannot slow a beacon, and a failed beacon is simply lost.
- The route is rate limited (600 a minute per IP address, `RATE_LIMITS.JOURNEY`), takes at most 4 KB, and keeps only what the vocabulary allows.
- **A kill switch** (below) stops it without a deploy.

## What is recorded

One record is a **name** from a fixed list, a **key** from that name's fixed list (a step, a channel, an outcome; never free text), and the **milliseconds since the page opened**. The lists are `JOURNEY_VOCABULARY` in `lib/journey/events.ts`, shared by the browser and the server: a name or key that is not in them can neither be sent nor stored.

| Name | Key | When | Recorded by |
|---|---|---|---|
| `journey.start` | the kind of device: `ios`, `android`, `desktop`, `unknown` | the capture page has the event | the page; the server makes the key from the request and does not keep the user agent |
| `journey.resume` | none | the page opened again after a sign-in (`?resume=true`) | the page; not counted as a visit |
| `step.reach` | `welcome`, `consent`, `who-are-you`, `cta`, `restart`, `frame`, `layout`, `message`, `camera`, `reframe`, `saved`, `thank-you` | a step reached for the first time in the visit | the page |
| `consent.shown`, `consent.accept` | `page` (the consent page) or `box` (the box on the Who-are-you page) | once per visit and form | the page |
| `camera.permission` | `granted`, `denied`, `unavailable` | the live camera of a desktop was asked for (one record of each kind per visit) | the camera component |
| `photo.taken` | `system` (the phone's own camera app), `still`, `frame` | a photo was taken | the page |
| `photo.retake` | none | back from the move-and-zoom step to the camera | the page |
| `photo.save` | `ok`, `failed` | the save answered | the page |
| `journey.complete` | `under-1m`, `1-3m`, `3-10m`, `10-30m`, `over-30m` | the first saved photo of the visit (the key is how long it took) | the page |
| `share.click` | `copy`, `facebook`, `twitter`, `linkedin`, `whatsapp` | a share button pressed | the page |
| `share.view` | none | the public photo page opened by a person (a link preview by a chat app or crawler is not one) | the server |
| `download` | none | the photo downloaded from the public photo page | the server |

**Never recorded:** an IP address, a user agent string, a cookie, a fingerprint, a name, an e-mail address, a photo, the address of a page or its query. The only thing read from the request headers is the user agent, once, to name the kind of device in one word, and it is not kept. A test (`app/api/observability/journey/route.test.ts`) sends a request full of such things and searches everything stored for them.

**The visit id** is a random id the page makes when it opens and holds in its memory only (no cookie, no local or session storage). It links the records of one page load and nothing else; it is not a person and is not kept across a reload (a reload is another visit; a return from a sign-in is `journey.resume`).

## Where it is kept, and for how long

| Collection | What | Kept |
|---|---|---|
| `journey_daily` | a count for each event (UTC id), UTC day, name and key, bumped with `$inc`: `{ eventId, day, name, key, count }` | for good: it is numbers, nothing about a person |
| `journey_events` | one row per record: `{ eventId, session, name, key, ms, at }` | **30 days**, then the database removes it (a TTL index on `at`, `expireAfterSeconds: 2592000`) |

**What the owner must run:** `npm run db:ensure-indexes` (needs `MONGODB_URI` and `MONGODB_DB`; safe to repeat) creates the indexes: `journey_events_at_ttl` (the 30 days), `journey_events_event_name_at` and the unique key of the daily count. The first write on each server instance also creates them (`lib/journey/store.ts`), so the 30 days hold even if the script was not run; running it is still the clean way and shows in its output whether they exist. Nothing is deleted by this change; the 30 days apply to new rows only.

The Analytics view and the counters for messmass read the **daily counts**. The raw rows are for the funnel and the timings; today one thing reads them (the median time to the first saved photo).

## The kill switch

`admin_settings` document `journey-recording` (`lib/journey/setting.ts`). **On unless switched off**: only a stored `enabled: false` turns it off.

- Switch it from the **Journey tab** of the Analytics view (global admins; the button asks first, in the page). `PATCH /api/admin/settings/journey-recording { enabled }`.
- Off: the guest event answer carries `journeyRecording: false`, so a page opened from now on sends nothing at all; and the beacon route, for the pages opened before, answers 204 and **writes nothing**; the server's own records (`share.view`, `download`) stop too.
- It takes effect on every server within 30 seconds (the value is kept in memory that long) and at once on the one that handled the switch. What was recorded stays.
- If the setting cannot be read the recording stays on (a recording that stops by accident would lose the match without anyone having decided it).

## The figures (Journey tab)

Defined in `lib/analytics/journey.ts`; the same numbers feed the CSV export and the counters for messmass.

- **Visits** = `journey.start`: one load of the capture page with the event, not a person. The same user opening the link twice is two visits; a return from a sign-in is not one.
- **Saved a photo** = `journey.complete`: visits that saved at least one photo; **completion rate** = saved over visits.
- **Steps reached** = `step.reach` per step, each visit once per step.
- **Camera denied / granted / not available** = `camera.permission` (not available: no camera, in use by another program, or it failed). **Only the live camera of a desktop asks**; a phone takes the photo with its own camera app and asks nothing on the page, so a phone never appears here.
- **Retakes** = `photo.retake`; per photo taken = retakes over `photo.taken`.
- **Consent left** = shown minus accepted, for the consent page and for the box on the Who-are-you page separately, never below zero.
- **Shares** = `share.click`; **photo page views** = `share.view`; **downloads** = `download`.
- **Median time to the first photo** = the median `ms` of `journey.complete` over the raw rows still kept (30 days); the five buckets cover the whole recording.

**Limits to know.** Recorded **from the day the recording started**; nothing exists before, and an event with no record shows "not recorded", never zeros. Days are **UTC days**. Opens are recorded once the page has the event, so a page closed before the event answer arrived is not counted. The browser sends the records, so someone can inflate them (a rate limit and the fixed vocabulary bound it): the figures are for the service and the organisers, not a measure of anything paid for. A reload counts as another visit.

## For messmass

Counters only, never a person (decision 241): `journeyOpens`, `journeyCompleted`, `cameraDenied`, `retakes`, `consentAbandoned`, `shares`, `downloads` (`lib/analytics/counters.ts`). They are whole running totals since the recording started, and an event with no journey record sends none of them (never a zero). The pipeline is still **off, with no trigger**, and nothing is sent to messmass by this change.

## Files

`lib/journey/events.ts` (vocabulary, `parseJourneyBatch`), `lib/journey/setting.ts` (kill switch), `lib/journey/store.ts` (the writes, the event lookup), `lib/journey/client.ts` and `lib/journey/useJourneyRecorder.ts` (the page side, added by the page beacons change), `app/api/observability/journey/route.ts`, `app/api/admin/settings/journey-recording/route.ts`, `lib/analytics/journey.ts`, `components/admin/analytics/JourneySection.tsx` and `JourneySwitch.tsx`.
