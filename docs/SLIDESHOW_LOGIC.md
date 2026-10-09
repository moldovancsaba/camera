# Slideshow Logic

**Version**: 12.3.40  
**Last Updated**: 2026-07-04

This document describes the current slideshow system: admin configuration, playlist generation, public playback, and composite slideshow layouts.

## 1. Core concepts

The slideshow system is built from three layers:

1. **slideshow configuration documents**
2. **playlist generation on the server**
3. **queue-based playback in the browser**

Composite videowalls add a fourth layer:

4. **layout documents that place multiple slideshow players on one screen**

## 2. Public identifiers

- `/slideshow/[slideshowId]`
- `/slideshow-layout/[layoutId]`

These use business identifiers, not Mongo `_id`.

## 3. Source collections

- `slideshows`
- `slideshow_layouts`
- `submissions`
- `events`

## 4. Event linkage rule

Slideshows ultimately source submissions by the event UUID `event.eventId`, not by the event Mongo `_id`.

Admin routes may start from the event Mongo `_id`, but playlist generation resolves the event and then matches submissions using:

- `submission.eventId`
- `submission.eventIds`

## 5. Admin behavior

### Event slideshows

Managed from the event admin detail page through the slideshow manager.

Operators can:

- create slideshow configs
- update timings and display behavior
- copy public URLs
- upload or assign failover background images
- choose whether the playlist uses originals only, approved try-on only, or both

### Slideshow layouts

Also managed from the event admin detail page.

Layouts:

- belong to an event
- split the screen into configured areas
- assign one slideshow per area
- support per-area delay and fit behavior

## 6. Playlist API

Primary route:

- `GET /api/slideshows/[slideshowId]/playlist`

Typical responsibilities:

1. load slideshow by `slideshowId`
2. resolve slideshow event
3. query eligible submissions
4. sort by fairness rules
5. optionally shuffle or rotate based on playback mode and `instanceKey`
6. build slide payloads for the browser

The route accepts `limit` (slides wanted), `instanceKey` (a layout cell) and `exclude` (a comma-separated list of submission ids the player already holds, at most 100; a longer list is cut). A submission in `exclude` is not eligible for that answer; when that leaves nothing, the route answers from the whole pool, because a pool smaller than the player's queue repeats by nature.

**What one call costs** (camera#476, step S6): the pool query (`buildPlaylistPipeline` in the route) keeps only the fields a slide needs (`_id`, the picture addresses, `createdAt`, `playCount`, the picture's size) **before** it sorts, so the whole pool is no longer read as full documents (user info, consents, IP and device data, play history) and sorted in memory; there is no `$limit`, because the `instanceKey` rotation and the random order need the whole pool. The list of deactivated accounts (`getInactiveUserEmails`, a scan of the submissions) is kept for **a minute** per server instance and read again at once on the instance that changes an account's status (`clearInactiveUserEmailsCache`); so a deactivated account's photos leave a slideshow within a minute at most. The route answers with a `Server-Timing` header and logs a call over one second (RUNBOOK, "Slideshow diagnostics"); the per-slide log line is gone.

## 7. Submission eligibility

Playlist sourcing excludes or accounts for:

- archived submissions
- event-hidden submissions
- inactive SSO users where that filter is available
- pseudo users explicitly marked inactive

The exact logic lives in the playlist route and `lib/slideshow/playlist.ts`.

## 8. Fairness model

Base ordering favors:

1. lower `playCount`
2. older `createdAt`

Then additional behavior may apply:

- `orderMode: random` shuffles candidate order
- `instanceKey` can rotate or seed order so multiple cells do not stay synchronized

## 9. Slide generation

`generatePlaylist` groups source submissions by aspect characteristics and emits:

- single-image slides for landscape content
- portrait mosaics
- square mosaics

The exact grouping behavior is implemented in:

- [lib/slideshow/playlist.ts](../lib/slideshow/playlist.ts)

## 10. Browser playback

Primary player:

- [components/slideshow/SlideshowPlayerCore.tsx](../components/slideshow/SlideshowPlayerCore.tsx)

Behavior:

- loads initial playlist
- preloads images
- maintains a queue
- advances on configured timing
- posts play counts asynchronously

**The queue** is `[current, ...upcoming]`, `bufferSize + 1` slides deep. Its rules are in [lib/slideshow/queue.ts](../lib/slideshow/queue.ts) (pure functions, tested in `queue.test.ts`) and the player writes the queue in one place (`commitQueue`: the ref is the truth, the state only draws it).

- **A refill after each advance** asks the server for the slides the queue is short of and sends `exclude` = the ids of every submission already in the queue. The server counts a play only when a slide becomes the current one, so a photo that waits in the queue still looks unplayed to it; without `exclude` the "least played, oldest first" answer is by construction the photo next to the head, and in fixed order the queue filled with copies of it (the screen stood still for `bufferSize + 1` slides: 20 s at buffer 3 and 5 s hold, 55 s at buffer 10; camera#476).
- **Only slides the queue does not hold are appended** (`appendFresh`). A full queue asks the server nothing: the 2.5 s timer is kept as the retry when the queue is short, and costs no request otherwise (before, two of three playlist calls per slide were useless).
- **When the server has nothing new** (a pool smaller than the queue, or the network is down) the loop goes on from the **seed**, every slide the player has received, in the order it arrived, continuing after the slide the queue ends with (`appendFromSeed`). With one slide left in the queue the player moves on to the next slide of the seed instead of repeating the same picture.
- A photo added while the show runs reaches the end of the queue at the next refill, so it appears about `bufferSize` slides later; a shallower `bufferSize` shows new photos sooner.

**Every wait is bounded** (camera#476, step S3; `lib/slideshow/resilience.ts`, `lib/slideshow/preload.ts`):

- A request to our server (playlist, logos, played) gives up after **8 s** (5 s for the logo), covering the body too. A screen that cannot start shows the error and **tries again by itself** after 1, 2, 4, 8, then every 15 s.
- A picture gets **20 s** from the moment its load starts (not from the time spent waiting for a place). A picture that is too slow is reported as failed to the refill but **keeps loading**; if it arrives later it is ready. At most **3 loads run at a time**, in the order they were asked for; the first pictures at start skip the line; a load that hangs gives its place back after the deadline.
- A **photo whose picture does not load** is not appended and not retried for 2 minutes; its id is sent in `exclude` so the server does not hand it out again at once. At start, only slides whose picture loaded start the show, the refill fills the gap.
- The refill appends **each slide as soon as its picture is ready** (no waiting for the slowest) and **releases its single-flight lock after 20 s** whatever is still in flight. After a failed answer the next refill waits 1, 2, 4, 8, then 15 s; a good answer ends the waiting.
- The preloader keeps only the pictures of the queue (the browser's HTTP cache holds the rest), and the first 4 slides of the queue are kept loaded; before, the whole queue was preloaded again at every change and nothing was ever released.
- **The preload is the request the screen uses** (camera#476, step S4a): no `crossOrigin` on the preload (we never read pixels; a CORS-mode preload is a different request from the plain `<img>`, so the browser fetched each picture twice: measured on Chrome 152, 2 resource entries against 1), background loads are low priority (`fetchPriority`), and the first 3 slides of the queue are **decoded** ahead (`decode()`), so the swap does not decode a multi-megapixel picture on the screen's device. The two-layer crossfade (step S4b) is a visible change and is not built.
- **The start** (camera#476, step S5): the show starts when the first **2 slides** and the screen design's picture (waited for 4 s at most) are ready, not when the whole first answer has loaded. The rest of the answer loads behind them (3 at a time) and joins the queue as each picture is ready; the refill leaves that gap alone until the first answer has settled, then fills any hole. The loading-screen logo and the failover background are loaded alongside and never waited for. In `once` mode the whole pass is awaited, as it has an end. `settings` are set only when the show starts: before, they were set early, so the 2.5 s timer could fill the queue and the head was **counted as played while only the loading screen was showing**.
- **The screen recovers by itself** (camera#476, step S8; `lib/slideshow/watchdog.ts`): when the diagnostics hook sees a stall (no slide current for two holds plus the stagger and five seconds, the page visible, the show playing) it reports it, then the player **goes to the next slide** (which re-arms the hold timer); if the picture has not moved a minute after the stall began, a full-screen page **reloads** (the show restarts from the server's queue), but at most **3 times in 10 minutes** (kept in the session; without session storage no reload), after that it only skips. A layout cell never reloads (it would reload the other cells). The page also asks for a **Screen Wake Lock** so the display does not sleep. Each action is an `error` event (`watchdog: next slide`, `watchdog: reload`) in the diagnostics. A scheduled soft reload is not built.
- **It reloads itself** (camera#476, step S8b; `lib/slideshow/reload.ts`): a full-screen page reloads **every 3 hours** and when an admin presses **Reload the screen** (the slideshow card in the event's slideshows list; `POST /api/slideshows/<id>/reload` stores `reloadRequestedAt`, every playlist answer carries it as `slideshow.reloadToken`, and a page that sees a token different from the one it opened with reloads at its next slide; after the reload it opens with the new token, so one press reloads each open copy once). **A save in the slideshow editor (`PATCH /api/slideshows`) sets `reloadRequestedAt` too** (owner, 2026-10-09: a saved change has to reach the screens that are already open), so every open full-screen copy reloads at its next slide after any save; a refused save sets nothing. Both happen at a slide boundary, never in a layout cell; each is an `error` event in the diagnostics.
- **Crossfade** (camera#476, step S4b; owner answer 210: build it, go live only after the owner has seen it): a per-slideshow switch, **off by default** (`Slideshow.crossfade`, the **Crossfade** checkbox in the slideshow editor, carried in the playlist answer as `slideshow.crossfade`). Off: the picture is replaced as before. On: the next picture is drawn as a **new layer that appears at opacity 0 and fades in over the one before** (`fadeDurationMs`), the previous picture stays underneath until the fade is over and is then dropped, so at most two pictures are drawn. The next picture is one of the first slides of the queue, so it is already loaded and decoded (S4a). Multi-image slides are layered the same way.
- **The screen picture** (camera#476, step S7; `lib/submissions/screen-picture.ts`): the giant screen is sent a **screen-sized WebP** (longest edge at most 1920 px, quality 80, about a seventh of the size of the composed JPEG measured on real MTK photos) instead of the full-size photo. It is made **once, when a photo becomes public** (at approval, or at creation for an event without approval), after the answer is sent, stored as `screen-pictures/<submission id>.webp` with a one-year cache header, and named in `Submission.screenImageUrl`; the playlist sends `screenImageUrl` when it exists and `imageUrl` otherwise. A photo that is already small names its own file (`screenImageUrl` = `imageUrl`). The original is never changed; the screen picture is deleted with the submission. A failure is logged and the slideshow keeps the original. Existing photos get one with `scripts/backfill-screen-pictures.ts` (dry run by default; `--apply` needs the owner's go, `RUNBOOK.md` "Screen pictures"). Try-on results do not get one yet.
- What this does not do yet: decode the picture before the swap and show two layers (step S4), show the first picture before all start pictures are loaded (S5), cheaper server calls (S6), screen-sized pictures (S7), a watchdog and a scheduled soft reload (S8).

The player is used in:

- fullscreen slideshow pages. A full-screen page has a **Full screen button in the top-right corner** (shown when the page opens and whenever the pointer moves or the screen is touched, faded after 3 s), **double-click** on the picture toggles full screen like a video, and the **F** key does too (camera#487); a browser without a page full screen (iPhone Safari) shows no button
- embedded layout cells

## 11. Composite layouts

Public route:

- `/slideshow-layout/[layoutId]`

Layout behavior:

- one layout document defines the regions
- each region mounts a slideshow player instance
- each region can carry delay and fit configuration
- `instanceKey` keeps repeated slideshow references from looking identical when possible

## 12. Related APIs

- `POST /api/slideshows/[slideshowId]/played`
- `GET /api/slideshows/[slideshowId]/next-candidate`
- `GET /api/slideshow-layouts/[layoutId]`
- `POST/PATCH/DELETE /api/slideshow-layouts`

## 13. Important implementation notes

### `fadeDurationMs`

The model still stores fade-related timing, but current player behavior must always be checked in code before documenting visual transition semantics.

### Buffering

`bufferSize` is a target queue depth, not a “total number of slides in the show”. Do not raise it to hide a stall: the depth is also how long a newly added photo waits for its turn. Never append a slide the queue already holds (`lib/slideshow/queue.ts`).

### Diagnostics

The player reports what it does (slides shown with a repeat flag, playlist calls, preloads, the refill lock, a 10 s heartbeat, stalls, errors) to `POST /api/observability/slideshow-diagnostic`, which only logs `camera.slideshow_diagnostic`. `?debug=1` shows the last events in a corner panel. The playlist route answers with a `Server-Timing` header. What is sent and how to read it: `RUNBOOK.md`, "Slideshow diagnostics".

### Layout independence

Composite layout cells do not duplicate slideshow business logic. They reuse the same player core with different embedding constraints.

## 14. When to update this doc

Update this file when changing:

- fairness ordering
- candidate filtering
- slide grouping rules
- queue behavior
- layout cell playback behavior
- slideshow admin configuration fields

## 15. Canonical references

- [lib/slideshow/playlist.ts](../lib/slideshow/playlist.ts)
- [components/slideshow/SlideshowPlayerCore.tsx](../components/slideshow/SlideshowPlayerCore.tsx)
- [app/api/slideshows/[slideshowId]/playlist/route.ts](../app/api/slideshows/[slideshowId]/playlist/route.ts)
- [app/api/slideshows/[slideshowId]/played/route.ts](../app/api/slideshows/[slideshowId]/played/route.ts)
- [app/api/slideshow-layouts/route.ts](../app/api/slideshow-layouts/route.ts)
- [app/slideshow/[slideshowId]/page.tsx](../app/slideshow/[slideshowId]/page.tsx)
- [app/slideshow-layout/[layoutId]/page.tsx](../app/slideshow-layout/[layoutId]/page.tsx)
