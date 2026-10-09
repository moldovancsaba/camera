# Giant-screen slideshow freeze: root-cause research and fix plan

Read-only investigation of the camera repository (Next.js 16.3.7, React 19.2.0, date 2026-10-09), made for issue [#476](https://github.com/moldovancsaba/camera/issues/476) (client feedback: the slideshow freezes for 10 to 20 seconds).
Nothing in the repository was changed by it. Nothing was run against a database or production. The pure simulation of the player queue and a local slow-image test server were written outside the repository; the logic of the simulation is described in C1 below and its numbers were re-run and match. They become the unit test of step S2 and the local reproduction of step S3.

Honesty note: I have not seen the real screen, its settings, its device or its logs. Every "likelihood" below is a judgement from code, a simulation and public docs.
Every "how to confirm" step is there so that judgement can be replaced by evidence. Claims I could not verify are marked **(unverified)**.

## Summary

1. Most likely root cause: the refill logic asks the server for "the least played slide" without telling it what is already queued, and appends the answer without a duplicate check (`SlideshowPlayerCore.tsx:338-347`). With `orderMode: fixed` (the default) the queue fills with copies of the same next photo. A simulation of our own code gives runs of `bufferSize + 1` identical slides in a row (20 s at buffer 3 / 5 s hold, 55 s at the default buffer 10). That looks exactly like a freeze, needs no network problem, and ends when another photo reaches the front. It is a model of the code, not yet a live observation (confirm in 10 minutes, section 5).
2. Second cause, on a real venue network: every wait is unbounded (no timeout on playlist fetches or image preloads) and refill is single-flight (`refillBusyRef`), so one stalled request stops all refilling, the queue drains and the last slide repeats; startup waits for all 11 images (`Promise.all`, line 422). The preload also warms a different cache entry than the one the screen uses (`crossOrigin="anonymous"` on preload only) and never calls `decode()`.
3. Contributing: images are shown at full stored size (try-on results are PNG at frame size, multi-MB), preloaded in a burst that competes with the picture on screen, and every poll costs the server a collection scan plus an unbounded aggregate.
4. First fix: add instrumentation (so the next freeze leaves evidence), then fix the queue (send `exclude`, dedupe, stop the useless 2.5 s polls). Both are small, independent and measurable. Then bounded + decoded double-buffered preload, then screen-sized derivatives.
5. Cheapest check right now (no code): read `orderMode`, `bufferSize`, `transitionDurationMs` of the giant-screen slideshow in admin, open the screen with DevTools, and watch the ids in `playlist?limit=1` and `/played`. If `orderMode` is `fixed` and the ids repeat, cause 1 is confirmed.

---

## 1. How the slideshow loads and caches today

Files: `app/slideshow/[slideshowId]/page.tsx` (17 lines, wraps the player), `components/slideshow/SlideshowPlayerCore.tsx` (1040 lines, the whole player), `components/slideshow/ScreenDesignLayers.tsx` (overlay, QR, texts), `app/api/slideshows/[slideshowId]/playlist/route.ts`, `.../played/route.ts`, `lib/slideshow/playlist.ts`, `docs/SLIDESHOW_LOGIC.md`, `docs/SCREEN_DESIGN.md`. The layout page `app/slideshow-layout/[layoutId]/page.tsx` mounts one player per cell (variant `embedded`, own `instanceKey`); it does no polling itself.

**Startup (`loadInitialBuffer`, lines 358-447), strictly sequential:**
1. `GET /api/slideshows/:id/playlist` (`cache: 'no-store'`, no timeout). Server returns settings and `limit = bufferSize + 1` slides (11 by default). One slide = one image (`generatePlaylist`, `lib/slideshow/playlist.ts:148-190`; mosaics are no longer generated).
2. `GET /api/events/:eventId/logos` (lines 389-407), awaited, for the loading-screen logo.
3. Preload of the failover background image (411-418), awaited.
4. `await Promise.all(playlist.map(preloadSlide))` (420-422): all 11 images must settle before `setIsLoading(false)` (441). Only then does the stage mount, which is when the overlay PNG, QR and the Google font link start loading (`ScreenDesignLayers.tsx:45,49`).

**Steady state:**
- Queue `[current, ...upcoming]` in React state. Target depth `bufferSize + 1` (`totalQueueSlotsFromBufferSize`, line 121). Defaults: hold 5000 ms, fade 1000 ms, buffer 10, loop, fixed order (`lib/slideshow/default-slideshow.ts:93-98`, `SlideshowEditor.tsx:81-95`).
- Advance = one `setTimeout(holdMs)` per head slide (line 525), then `queue.slice(1)` and `maintainLoopBuffer()` (552-560). A `setInterval(…, 2500)` also calls `maintainLoopBuffer()` (578-584).
- `maintainLoopBuffer` (293-356): single-flight via `refillBusyRef`; if the queue is exactly at target it pulls `limit=1` ("one past target"); while below target it pulls `limit=need` (max 25), preloads the chunk with `Promise.allSettled`, appends. No `exclude` is sent, no duplicate check on the main path.
- Preload (`preloadImage`, 234-253): `new Image()`, `crossOrigin = 'anonymous'`, resolves on `onload`, stored forever in `preloadedImages` (a `Map`, line 185, never pruned). No `decode()`, no timeout, no priority. An extra effect re-runs `preloadSlide` for the whole queue after every queue change (484-487).
- Display (`renderSlide`, 771-785): a plain `<img src=… style={{objectFit}}>` with no `crossorigin` attribute, no `onError`, no key, no `decoding` hint. The same DOM element is reused for every slide, so React only changes `src`. Fade = wrapper opacity 0 to 1 over `fadeDurationMs` (611-629, 910-923); it is a fade-in, not a crossfade.
- `POST /played` for the head slide at the moment it becomes head (513). The server sorts by `playCount` asc then `createdAt` asc (`route.ts:337`).
- Offline fallback: `loopSeedSlidesRef` (a list of every unique slide ever received) is replayed when a fetch returns nothing (321-332, 587-595).

**Server per playlist call** (`playlist/route.ts`, `dynamic = 'force-dynamic'`, `Cache-Control: private, no-store`): rate-limit check (192), slideshow `findOne` (206), event `findOne` (243, up to 2 queries), `getInactiveUserEmails()` = `distinct` over the whole submissions collection (273), `aggregate` over the whole eligible pool of the event, sorted, full documents (326-340), optional `loadEventTheme` when a screen design exists (367-371), then slice to `limit`. `diagnostics.generationMs` is returned in the JSON (476).

**Images** (`imageUrl` is used as is, `lib/slideshow/playlist.ts:167-172`): guest photos are a canvas JPEG q0.85, longest edge at most 2048 px (`app/capture/[eventId]/page.tsx:652-671`), uploaded unchanged to Vercel Blob (`lib/imgbb/upload.ts:190-207`, no `cacheControlMaxAge` set). Try-on results are composed by sharp as PNG at frame size (`lib/tryon/frame-composition.ts:169-195`); a 480 px preview exists (line 31) but the slideshow does not use it. Older submissions may still point to `i.ibb.co` (comment in `next.config.ts`; `lib/imgbb/upload.ts:7-9` says imgbb deleted images without notice).
Vercel Blob caches public blobs in CDN and browser for up to one month by default, with ETag revalidation, from "19 regional hubs", described as optimised for non-critical assets (Vercel docs, section 3).

**What does not exist:** service worker, Cache API use, wake lock, stall watchdog, scheduled reload, any client telemetry for the slideshow, `PerformanceObserver`, `decode()`. `next/image` is not used by the player.

**Rate limiting:** `SLIDESHOW_PLAYLIST` 180/min per IP per path (`lib/api/rateLimiter.ts:80`). `RUNBOOK.md:78-83` says Upstash is not configured in production, so buckets are per serverless instance.

---

## 2. Ranked root-cause candidates

| # | Candidate | Where | Likelihood | Fastest confirmation |
|---|---|---|---|---|
| C1 | Refill sends no `exclude`, appends without dedupe: queue fills with copies of the next photo (fixed order) | `SlideshowPlayerCore.tsx:270-290, 301-317, 338-347`; `route.ts:337, 350-362` | **High if `orderMode=fixed`** (default); none if `random` | Network tab: same id in consecutive `playlist?limit=1` and `/played`; or re-run the simulation |
| C2 | Unbounded fetch/preload + single-flight lock + all-or-nothing startup | `:234-253, 278-281, 295-297, 338-341, 420-422` | **Medium-High** on venue Wi-Fi/4G | Log lock-held time; stall a request with a local slow-image server (hang mode) |
| C3 | Preload is a different request from the displayed one (`crossOrigin` mismatch); no `decode()`; one reused `<img>` keeps the old picture until the new one is ready | `:242` vs `:774-784, 812-816, 843-847` | **Medium** | `performance.getEntriesByName(url)` length per shown URL; DevTools cache column; `curl -I` with/without `Origin` |
| C4 | Heavy images (try-on PNG at frame size, no screen-sized derivative) + burst preloading that competes with the picture on screen | `lib/tryon/frame-composition.ts:169-195`; `:420-422, 338, 484-487` | **Medium-High** with try-on in the show; Medium otherwise | `fileSize`/`mimeType` distribution for the event; DevTools transfer sizes vs link speed |
| C5 | Startup waterfall: playlist, logos, background, 11 images, then overlay | `:389-422`; `ScreenDesignLayers.tsx:49` | **High** for "start or restart takes 10-20 s" | DevTools waterfall (cache disabled, Fast 4G) |
| C6 | Server cost per poll: collection scan, unbounded aggregate, ~3-4 calls per slide | `route.ts:273, 326-340`; `lib/sso/submission-account.ts:14-27`; `ensure-indexes.ts:178-197` | **Medium** as cause, **High** as amplifier of C2 | `diagnostics.generationMs` in responses; Atlas profiler; Vercel function duration |
| C7 | Memory grows for hours (`preloadedImages` never pruned) | `:185, 243-246` | Low-Medium (device dependent) | Chrome Task Manager / `performance.memory` over 2-3 h |
| C8 | Broken images are queued anyway, retried on every queue change, never skipped | `:259-264, 484-487, 774-784` | Low-Medium (older events with imgbb URLs) | Console warnings "Failed to preload image" |
| C9 | Browser/OS: occluded or hidden window throttled, display sleep, device too weak | n/a (no wake lock, no watchdog) | Low-Medium, device dependent | Heartbeat log (rAF gaps, `visibilityState`) |
| C10 | 429 from our rate limiter | `rateLimiter.ts:80` | Low (Upstash unset, ~30 calls/min per screen) | Count 429s in the log |
| C11 | Rendering cost of the overlay stack (full-stage alpha PNG, opacity transition, drop-shadow, container units) | `ScreenDesignLayers.tsx:49-57`; `:917-921` | Low | LoAF / frame gaps during fade |

### C1. Queue refill duplicates the next photo (details)

- `fetchPlaylistChunk` (270-290) sends only `limit` and `instanceKey`. The route supports `exclude` (`route.ts:197-198, 278-281`) but the player never uses it.
- Main refill path appends `chunk.slice(0, Math.max(stillNeed, 1))` with no check against the queue (342-347). Only the "one past target" path dedupes (307-308), and there it is nearly always a no-op.
- `playCount` is incremented only when a slide becomes head (513). Slides waiting in the queue still count 0, so "least played, oldest first" (`route.ts:337`) is by construction the photo at or next to the head. In fixed order the answer is deterministic, so each refill appends another copy of it until it finally reaches the head.
- Simulation (a pure JS model of lines 217-228, 293-356 and the route ordering, kept outside the repository), steady state, new photo every 4 slides, 5 s hold:

| order | buffer | longest run of the same photo | slides identical to the previous |
|---|---|---|---|
| fixed | 3 | 4 slides (20 s) | 75 % |
| fixed | 10 (default) | 11 slides (55 s) | 91 % |
| random | 3 or 10 | 1 | 0 % |

  First slides in fixed order with buffer 10: `1,2,…,11,2,3,…,11,12,12,12,12,12,12,12,12,12,12,12,13,13,13,13…`. In the first version of the simulation, 364 of 382 one-past-target polls returned a photo already queued (pure waste), and 182 refill appends were duplicates.
- Side effects: new photos wait roughly a full buffer (55 s) before appearing; play counts of repeated photos inflate; two thirds of all playlist calls (the 2.5 s ticks) do nothing useful.
- Why it can look "intermittent, 10 to 20 s": the run length is `bufferSize + 1` times the hold, and it only occurs in fixed order; a short buffer or hold gives 10-20 s.
- Confirm: (a) admin: orderMode, bufferSize, transitionDurationMs of the screen's slideshow. (b) Live: DevTools, Network, Fetch/XHR; `playlist?limit=1` responses carry `playlist[0].submissions[0]._id`, and `/played` bodies carry `submissionIds`; consecutive repeats of one id confirm it. (c) Or re-run the simulation.
- Limits of this finding: depends on the live `orderMode`. If the screen runs `random`, C1 does not apply and C2-C6 become the main suspects.

### C2. Unbounded waits, single-flight lock, all-or-nothing start

- No timeout anywhere: `fetch` at 278 and 375, logos fetch at 391, image preload resolves only on `onload`/`onerror` (243-250).
- `maintainLoopBuffer` holds `refillBusyRef` (295-297) across the playlist fetch and the whole `Promise.allSettled` of image preloads (338-341), and releases it in `finally` (353-355). While held, the advance trigger (560), the 2.5 s interval (578-584) and the `online` listener (597-602) all return immediately. One stalled request therefore disables refilling for as long as it hangs.
- When the queue drains, `computeNextLoopQueue` (217-228) with one slide left returns that slide again (`expandPlayerPlaylist(q, 2).slice(1)`), so the same picture repeats until refill works again.
- Startup: `Promise.all` (422) means one slow image delays the first picture, one hung image never shows it (loading screen until a manual reload).
- Why a venue network produces it: shared Wi-Fi, carrier NAT, roaming and captive links make in-flight requests stall rather than fail; our code never gives up. (Chrome's own default timeouts for stalled image/fetch requests: **unverified**, but nothing in our code bounds them.)
- Confirm: log `refillBusyMs` (how long the lock is held) and per-request durations (section 6). Reproduce locally with a small server that serves one image slowly and hangs every 5th request, behind a mocked playlist; the queue should drain.

### C3. Preload is not the request the screen uses; no decode

- Preload sets `img.crossOrigin = 'anonymous'` (242) = CORS-mode request. The displayed `<img>` has no `crossorigin` attribute = no-cors request. The WHATWG HTML spec keys the "list of available images" by URL plus CORS mode (and origin when not no-cors), so the preloaded entry is not a hit for the displayed element; in that case the spec keeps showing the current picture until the new image has fully loaded, and only then swaps (source: html.spec.whatwg.org, "updating the image data"). Chrome's actual memory-cache reuse rules were **not verified**. Chrome logs a console warning for the same class of mismatch on `<link rel=preload>` ("not used because the request credentials mode does not match"); I only found community reports of it, no official page.
- Whether the second request is cheap depends on the HTTP cache: Vercel says public blobs are cached by the browser up to a month with ETags (cheap), unless the response carries `Vary: Origin` or similar, which I could not check. Evidence that Blob answers CORS requests at all: the capture page already loads Blob frames with `crossOrigin='anonymous'` for canvas use (`app/capture/[eventId]/page.tsx:634,643`); the header itself was **not** inspected.
- `onload` does not mean decoded. `HTMLImageElement.decode()` (Baseline since January 2020, MDN) resolves when the image is decoded and safe to show, and MDN recommends it for replacing a displayed image. We never call it, so a multi-megapixel decode happens at swap time, on the user's device.
- The same `<img>` element is reused (no key, no second layer): while the new image is not ready, the old picture stays visible, which is what a viewer reads as a freeze. The fade logic (611-629) sets opacity 0 and then 1 on that wrapper, so a late image fades in late.
- Confirm: for each shown URL log `performance.getEntriesByName(url).length` (2 or more = fetched twice) and the later entry's `duration`; DevTools Network "Size" column ("(memory cache)", "(disk cache)", or bytes). One read-only `curl -I -H 'Origin: https://<camera host>' <one public blob image url>` shows `access-control-allow-origin`, `vary`, `cache-control`, `age` (not run by me).

### C4. Image weight and burst preloading

- Estimates (not measured): guest JPEG at most 2048 px, q0.85, roughly 0.3-1 MB; try-on PNG at frame size, roughly 4-10 MB each for photographic content. At 5 Mbps, 5 MB = 8 s per image; 11 images at start = 1.5 min.
- Burst: 11 parallel preloads at start (422), up to 25 per refill chunk (338), whole queue re-preloaded after every queue change (484-487). Nothing marks background preloads as low priority, so the picture needed now competes with them for the same link (how Chrome schedules them against each other: **unverified**).
- No screen-sized derivative exists; `previewImageUrl` (480 px) is too small for a giant screen. Blob serves from regional hubs, not a city-level edge (Vercel docs); the store region is unknown to me.
- Confirm: read-only aggregation on the event's submissions: count by `mimeType`, average and p95 `fileSize`; then DevTools transfer sizes per slide; compute bytes per minute against the venue link.

### C5. Startup waterfall
Playlist (heavy server call) then logos then background then 11 images then overlay and font. Each step awaits the previous. The overlay (a 1920x1080 alpha PNG, hosted on R2 `r2.dev` for MTK) is not preloaded, so the first seconds on screen may lack the design.

### C6. Server cost per poll
- Per slide per screen: 1 call at advance plus 2 ticks of the 2.5 s interval at full depth = about 3 calls; each does 4-6 queries.
- `getInactiveUserEmails` (`lib/sso/submission-account.ts:14-27`): `distinct('userEmail', {cameraAccountDisabled: true, userEmail: {...}})` on the whole collection; `lib/db/ensure-indexes.ts:178-197` has no index on `cameraAccountDisabled` or `userEmail`. Without a usable index MongoDB scans the collection (general MongoDB behaviour; **not confirmed by `explain`** on your data). Cost grows with all submissions of all events (212 events per `HANDOVER.md`).
- `aggregate` (326-340): `$match` + `$addFields` + `$sort` on a computed field, no `$limit`, no `$project`: the whole eligible pool of the event is read as full documents (userInfo, consents, metadata with IP and user agent, slideshowPlays…) on every call, and sorted in memory. The MongoDB docs note that a `$limit` directly after `$sort` lets the server keep only the top N, and that an unsupported `$sort` runs in memory.
- Function region defaults to `iad1` (`vercel.json` is `{}`; Vercel docs); Atlas tier and region unknown. Mongo driver `serverSelectionTimeoutMS: 10000`, `socketTimeoutMS: 45000` (`lib/db/mongodb.ts`), so a bad call can take tens of seconds, and the client waits without limit.
- The buffer hides a slow call only while the queue is deep; with C1 fixed and a lock stuck (C2) it becomes visible.

### Smaller items
- C7: each preloaded `HTMLImageElement` kept in the Map keeps its encoded bytes reachable; after hours that is the whole pool (my reasoning about Chromium internals, **unverified**). On a small kiosk device this ends in swapping or a tab crash.
- C8: `preloadSlide` swallows failures (259-264), so a dead URL (deleted imgbb file) is queued and shown as alt text "Slideshow"; it is retried at every queue change.
- C9: Chromium treats a fully occluded window as hidden on Windows (`CalculateNativeWinOcclusion`) and throttles timers of hidden pages (Chromium docs, section 3); our timers would slow or stop. No wake lock.
- C10: with ~30 calls/min per screen against 180/min per IP and per-instance buckets, 429 is unlikely for one screen. Layout pages with many cells of the same slideshow would approach it.
- C11: all static except the opacity transition; low on any GPU-backed browser, possible on software-rendered signage boxes.
- Latent bug (not the freeze): `advanced`/`ended` flags are set inside `setState` updater functions and read synchronously (552-559, 536-548, 667-683). React may run the updater later, so the flag can still be `false` when read; in `once` mode this can leave the last slide without the "Playback complete" state.

**Looked at and fine:** the advance timer is a plain `setTimeout` and does not wait for images; effect dependencies do not reset the timer when the queue is appended; `loadInitialBuffer` runs once (no remount, no state reset after init); `ScreenDesignLayers` re-renders without touching the DOM (stable `src`, stable `__html`); the QR is a server-made SVG (no client drawing); the layout page does not poll; `proxy.ts` adds nothing heavy; `/played` is fire-and-forget; the playlist route sends correct no-store headers for personalised data; no `PerformanceObserver`/canvas work on the main thread.

---

## 3. Research: newer or better ways (as of October 2026)

"New" is judged against a typical 2024 implementation. I found nothing released after our April 2026 implementation that changes the picture (limited search; a JPEG XL decoder in Chrome 145 is behind a flag, not usable).

| Technique | New since 2024? | Fits Next 16 / React 19 / Vercel? | Would it help the freeze? | Source |
|---|---|---|---|---|
| Two stacked layers + `await img.decode()` before swap | No (`decode()` Baseline since Jan 2020) | Yes, client-only, in `SlideshowPlayerCore` | **High**: swap only when ready; no blank or stale frame; decode off the swap path | [MDN decode()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode), [MDN decoding](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decoding) |
| Preload with the same CORS mode as display; bounded concurrency; `fetchPriority="low"` for background preloads | `fetchpriority` is recent (Chrome 102, Safari 17.2, Firefox 132) | Yes | **High** (fixes C3/C4 contention) | [web.dev Fetch Priority](https://web.dev/articles/fetch-priority), [WHATWG list of available images](https://html.spec.whatwg.org/multipage/images.html#updating-the-image-data) |
| `createImageBitmap` / `OffscreenCanvas` | No (createImageBitmap Baseline since Sep 2021) | Possible, but needs canvas rendering and manual `close()`; MDN does not say it decodes off the main thread | Low-Medium: `decode()` on `<img>` gets most of the benefit with less code | [MDN createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) |
| Cache API + service worker precache, stale-while-revalidate (Workbox/Serwist) | No | Possible; Next docs point to Serwist; extra moving part; cross-origin Blob images need CORS to be inspectable | Medium: removes network from the display path after first fetch, helps flaky links; does not fix C1; adds a stale-cache failure mode. Do after the logic fix | [Workbox strategies](https://developer.chrome.com/docs/workbox/caching-strategies-overview), [MDN Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache), local `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` |
| `<link rel=preload as=image>` | No | Poor fit for a dynamic list | Low: same as `new Image()`; must match crossorigin | [web.dev](https://web.dev/articles/preload-responsive-images) |
| `Cache-Control` max-age / immutable on content-addressed URLs | No | Blob: configurable `cacheControlMaxAge` (we already use 31536000 for frames, not for photos); `immutable` itself is not settable via the SDK (**unverified**) | Low: default is already up to 1 month; value is in making sure the display request reuses it | [Vercel Blob caching](https://vercel.com/docs/vercel-blob/public-storage), [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) |
| Right-sized derivatives (JPEG/WebP at 1920-2560 px, generated at upload with sharp) | No | Yes, sharp is already a dependency (`lib/imgbb/upload.ts`, `frame-composition.ts`) | **High**: 5-10x fewer bytes per slide; also removes PNG-photo decode cost | repo code; AVIF choice not verified here |
| `next/image` optimizer / `/_next/image` instead | No | Possible: Blob host already in `remotePatterns`; Next 16 requires `qualities`; transformations are billed (Hobby 5K/month included; cache MISS and STALE billed), source max 8192 px, first request per size is slow | Medium: no pregeneration needed, but first-hit latency at the event and billing; pregenerated beats it for a screen | [Vercel pricing](https://vercel.com/docs/image-optimization/limits-and-pricing), local `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md` |
| HTTP/3 | No | Vercel staff said "not supported yet" in May 2025; current CDN docs do not list it; could not verify October 2026 | Unknown, probably low (stall cause is queue logic, not protocol) | [Vercel community](https://community.vercel.com/t/http-3-support/41935), [Vercel CDN docs](https://vercel.com/docs/cdn) |
| SSE / WebSocket push for "new photo" instead of polling | No (SSE is old) | WebSockets are not supported by Vercel Functions (community/vendor sources); SSE works but each stream is capped by function max duration (300 s default with Fluid compute) so the client must reconnect | Low-Medium: removes polling load; but the freeze is not caused by discovery latency. First step is simply to poll less (S2) | [Vercel limits](https://vercel.com/docs/functions/limitations), [Vercel community](https://community.vercel.com/t/can-sse-be-implemented-with-only-next-js-api-routes/11063) |
| View Transitions API (same-document) | Yes: Baseline Newly available Oct 2025 | Yes as raw `document.startViewTransition`; React/Next integration **unverified** | Low / not recommended: cosmetic, snapshots a 4K frame; a plain opacity crossfade between two layers is cheaper | [web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) |
| `content-visibility` | No | n/a | None: a single full-screen stage has no off-screen content (my reasoning, no source) | n/a |
| Screen Wake Lock API | Yes: Baseline Newly available (March 2025) | Yes, client-only; released when the page is hidden, so re-acquire on `visibilitychange`; secure context only | Low-Medium: prevents display/OS sleep on devices that sleep; kiosk OS settings usually do this too | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) |
| Chrome kiosk flags (`--kiosk`, `--disable-features=CalculateNativeWinOcclusion` on Windows) and periodic soft reload | No | Operator side; flags need testing on your Chrome build | Medium for C9; the reload is a safety net, not a fix. A vendor KB also recommends timed refresh for browser-side memory build-up | [Chromium occlusion doc](https://chromium.googlesource.com/chromium/src/+/master/docs/windows_native_window_occlusion_tracking.md), [Chrome timer throttling](https://developer.chrome.com/blog/timer-throttling-in-chrome-88/) |
| Stall watchdog (rAF heartbeat + "no slide change" timer) with recovery | No | Yes | **High** as a safety net: detects any cause, skips or reloads | n/a (standard technique) |
| Measuring: Resource Timing, Long Tasks (50 ms), Long Animation Frames | LoAF is recent, Chrome-only, "Limited availability" | Yes, client-only, Chrome kiosk is fine | **High** for evidence, no effect on behaviour | [web.dev long tasks](https://web.dev/articles/optimize-long-tasks), [MDN LoAF](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming) |
| Cache the playlist on the Vercel CDN (`s-maxage`) | No | Only for a non-personalised variant (fixed order, no `instanceKey`); response must not be `private`/`no-store`; `Vary: Cookie` makes it uncacheable | Low-Medium: collapses many screens into one compute; risky for random/instanceKey | [Vercel CDN cache](https://vercel.com/docs/caching/cdn-cache) |

Summary of the research: the techniques that matter here are old and boring (decode before swap, correct cache keying, bounded concurrency, right-sized files, a watchdog). Nothing new in 2025-2026 replaces them. The one genuinely new-and-useful platform piece is the Wake Lock (Baseline 2025). Do not add a service worker or SSE before the queue logic is fixed.

---

## 4. Proposed fix plan (small steps, each shippable and measurable)

Ordered by expected benefit per effort. Rules that apply to every step (from `CLAUDE.md`): own branch from `main`, PR, run `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, and the full `release:check` chain before pushing; no test writes to messmass-linked events (section 8 of `CLAUDE.md`); user-visible changes on live events and production data writes need the owner's go (memory: merge after Verify, ask first for those).

### S0. Confirm the diagnosis (no code, 30 min)
- What: read the screen slideshow's `orderMode`, `bufferSize`, `transitionDurationMs`, `submissionSourceMode` (try-on included?), playMode in admin; open the live screen URL with DevTools (Network, Fetch/XHR and Img; Performance monitor) for 10 minutes; note the ids in `playlist?limit=1` and `/played`, request durations and sizes.
- Verify: repeated ids = C1; any request over 8 s or pending = C2; 2 entries per image URL = C3; sizes over 2 MB = C4.
- Risk: none. Do not click anything that posts.
- Optional stop-gap (owner decision, changes ordering semantics: random ignores fairness): set `orderMode: random` on that slideshow. Verify by the same network log. Not a fix.

### S1. Instrumentation (section 5) first
- **Status 2026-10-09: done** (PR of branch `feat/slideshow-diagnostics`): the events of section 5 except the `?debug=1` copy to `sessionStorage` (the ring is in memory and in `window.__slideshowLog`; the beacon flushes on `pagehide`), no report script. Notes: `RUNBOOK.md` "Slideshow diagnostics".
- Files: new `lib/slideshow/diagnostics.ts` (event types, sanitiser), new `components/slideshow/useSlideshowDiagnostics.ts` (ring buffer, heartbeat, beacon), new `app/api/observability/slideshow-diagnostic/route.ts` (copy of `capture-diagnostic/route.ts` pattern, `RATE_LIMITS.DIAGNOSTICS`), small hooks in `SlideshowPlayerCore.tsx`; unit tests for the sanitiser.
- Verify: unit tests; local run shows `?debug=1` overlay; Vercel runtime log shows `camera.slideshow_diagnostic` lines.
- Risk: low (no behaviour change; beacon is best-effort, size-bounded). Do not log image URLs with query strings or any personal data; hash ids.
- Not to do: no `console.log` spam in production; no persistence of diagnostics in Mongo.

### S2. Fix the queue logic (C1) and stop useless polls
- **Status 2026-10-09: done** (queue rules in `lib/slideshow/queue.ts`, `exclude` sent on every refill, no duplicate append, no request for a full queue, seed continuation; the preload depth separation and the 30 s heartbeat were not needed: the queue fills at the next advance. Notes: `docs/SLIDESHOW_LOGIC.md` section 10, `RELEASE_NOTES.md`.)
- What: send `exclude=<ids of every submission in the queue>` with each refill; dedupe on append (by `slideKey`); delete the "one past target" path; trigger refill only when `queue.length < target` (at advance and on failure retry) plus a 30 s heartbeat for new photos instead of every 2.5 s. Extract the queue rules into a pure module `lib/slideshow/queue.ts` (advance, refill-merge, restore-from-seed) so they are unit-testable; replace the `advanced`/`ended` flags with values computed from `slideQueueRef`. Separate "queue depth" (how far ahead the order is decided) from "preload depth" (how many slides must be downloaded and decoded ahead: 3-4 is enough to cover network latency): a deep queue makes a new photo wait `bufferSize x hold` before it appears (55 s at the defaults), a shallow queue shows it within about 20 s.
- Files: `components/slideshow/SlideshowPlayerCore.tsx`, new `lib/slideshow/queue.ts` + test, `app/api/slideshows/[slideshowId]/playlist/route.ts` (cap `exclude` at 100 ids; the empty-pool fallback at 343-348 stays), `docs/SLIDESHOW_LOGIC.md` section 10 and 13.
- Verify: unit test that drives the queue with a fake server using the ordering of `route.ts:337` (the simulation of the queue is the template): longest identical run must be 1, new photo appears within `bufferSize` slides; Playwright test with mocked playlist and image routes (below); live: S1 log shows `dupOfPrev=0`, playlist calls per slide drop from about 3 to about 1.
- Risk: medium-low. Edge cases: pool smaller than the queue (server falls back to no-exclude; duplicates are then correct); a very long `exclude` URL (cap it; or switch the refill to POST).
- Not to do: do not raise `bufferSize` as a workaround (longer runs in fixed order); do not change fairness ordering in the same PR.

### S3. Bound every wait and release the lock (C2, C8)
- **Status 2026-10-09: done** (`lib/slideshow/resilience.ts`, `preload.ts`; deadlines 8 s for requests and 20 s for pictures, 3 loads at a time, a late picture is kept, failures remembered 2 minutes and sent in `exclude`, the lock released after 20 s, backoff 1 to 15 s, the start retries by itself, prune). Differences from the plan: the image deadline is 20 s not 10 (a multi-MB try-on PNG on a slow link needs more; tune from the S1 logs), `decode()` stays in S4, and the effect that re-preloaded the whole queue now keeps only the first 4 slides loaded. Notes: `docs/SLIDESHOW_LOGIC.md` section 10.
- What: `AbortSignal.timeout(8000)` on playlist, logos and played fetches (retry with backoff 1, 2, 4, 8 s, max 15 s); image preload wrapped in `Promise.race` with a 10 s timeout; `refillBusyRef` released on timeout; a slide enters the queue only if its image loaded and decoded, failures are skipped and remembered for a few minutes (not retried at every queue change); remove the effect at 484-487; concurrency limit of 2 preloads at a time, current slide first; prune `preloadedImages` to the queue window.
- Files: `SlideshowPlayerCore.tsx` (or the new preload module `lib/slideshow/preload.ts` + test).
- Verify: the slow-image test server in hang mode: queue keeps playing, lock time in the log stays under 10 s, no repeats; Chrome DevTools "Offline" for 30 s then online: recovery within one heartbeat.
- Risk: medium (touches the core loop; ship after S2 so the effect of each is measurable).
- Not to do: do not make timeouts shorter than a slow-but-working link needs (log first, tune from S1 data); do not retry without backoff.

### S4. Make preload real: same request, decoded, double-buffered (C3)
- **Status 2026-10-09: S4a done** (no `crossOrigin` on the preload, `fetchPriority` low for background loads, `decode()` for the first 3 slides). **Settled by a test on Chrome 152 (this resolves open question 9 for that browser):** a CORS-mode `Image` preload followed by a plain `<img>` gives 2 resource entries (the picture is fetched again, here from the HTTP cache), a plain preload gives 1. **S4b (two stacked layers, a true crossfade) is not built:** it is a visible change on a live screen and needs the owner's go.
- What: drop `crossOrigin` on the preload (we never read pixels), or set the same attribute on both; after `onload` call `await img.decode()` (guarded by the timeout); render two stacked `<img>` layers A/B: set `src` on the hidden one, `await decode()`, then flip opacity so the fade becomes a true crossfade; give each layer a key per slide; mark background preloads `fetchPriority = 'low'`; keep the layer's `onError` to skip to the next ready slide.
- Files: `SlideshowPlayerCore.tsx` (`renderSlide`, 771-852, and the fade effect 611-629).
- Verify: S1 log: `imgComplete=true` and `decodeMs` recorded at every swap, `getEntriesByName(url).length === 1`; visual check of the crossfade at 4K in Chrome; memory flat over 1 h.
- Risk: medium (visual change on a live screen: owner's go for the crossfade look; keep `fadeDurationMs` semantics).
- Not to do: no `createImageBitmap` for every slide; no View Transitions; do not keep more than the queue window of decoded images.

### S5. Startup: show the first picture early (C5)
- What: show the stage as soon as the first 1-2 slides are decoded and the overlay PNG is loaded; load logos, background, overlay in parallel with `Promise.allSettled`; preload the remaining queue in the background; preload the overlay (`new Image()` with decode) before first show so there is no pop-in.
- Files: `SlideshowPlayerCore.tsx` (`loadInitialBuffer`), maybe `ScreenDesignLayers.tsx`.
- Verify: time-to-first-picture mark (S1) on Fast 4G with cache disabled: from about N x image time to about 2 x image time.
- Risk: low-medium. Not to do: do not start the show with fewer than 2 ready slides (single-slide repeats).

### S6. Cut server cost per call (C6)
- **Status 2026-10-09: done in part** (a and d, and b as a cache): the `$project` before the `$sort` (no `$limit`: the instance rotation and the random order need the whole pool), a one-minute cache of `getInactiveUserEmails`, the per-slide log line removed; `Server-Timing` came with S1. Measured read-only on the MTK pool (36 photos): same order, same slide fields, 85 KB to 18 KB, 56 to 31 ms. **Not done, needs the owner:** the partial index for `cameraAccountDisabled` (production index, `db:ensure-indexes`), the function region next to the database (needs the region facts), the per-instance cache of the sorted pool (changes how fast a new photo shows).
- What (each is independent):
  a. In the aggregate add `$project` of only `_id, imageUrl, finalImageUrl, metadata.finalWidth/finalHeight/originalWidth/originalHeight` and, for `fixed` order, a `$limit` right after `$sort` (`limit + exclude.length`); `random` still needs the full id list: use `$project` of ids only for the shuffle, then fetch the chosen docs.
  b. Replace the per-call `distinct` with a module-level TTL cache (60 s) of `getInactiveUserEmails`, or add a partial index `{cameraAccountDisabled: 1, userEmail: 1}` with `partialFilterExpression: {cameraAccountDisabled: true}` in `ensure-indexes.ts` (index creation on production needs the owner's go and `npm run db:ensure-indexes`).
  c. Optional per-instance cache (5 s) of the sorted eligible pool per slideshow.
  d. Add a `Server-Timing` header with phase durations; set `generationMs` log for calls over 1 s.
  e. Pin the function region next to the Atlas cluster and the venue in `vercel.json` (decision needs the region facts, section 7).
- Files: `playlist/route.ts`, `lib/sso/submission-account.ts` or `lib/db/sso.ts`, `lib/db/ensure-indexes.ts`, `vercel.json`.
- Verify: `generationMs` p50/p95 before/after from S1/S1-server logs; Atlas profiler shows no COLLSCAN on this route; `explain` on both queries.
- Risk: low for a, d; medium for b-index and e (production config). Not to do: do not cache the playlist response on the CDN for random/instanceKey requests; do not add the index without an `explain` first.

### S7. Screen-sized derivatives (C4)
- What: at upload and at try-on completion create `screenImageUrl` with sharp (JPEG q80 or WebP, longest edge 1920, optionally 2560 for 4K walls), upload to Blob with `cacheControlMaxAge: 31536000`; store on the submission; playlist emits `screenImageUrl ?? imageUrl`; try-on composites stop being PNG for photographic content; a dry-run-first backfill script for existing events (pattern of `backfill-default-dryrun`).
- Files: `lib/imgbb/upload.ts`, `lib/tryon/frame-composition.ts`, `lib/slideshow/playlist.ts`, `lib/db/schemas.ts` (`Submission`), new backfill script under `scripts/`.
- Verify: bytes per slide (S1 `bytes` field) down by the measured ratio; visual check on the real wall resolution (ask the designer for the wall's pixel size).
- Risk: medium (new field, backfill writes production data: owner's go, dry run first; messmass rule applies to events with `messmassEventId`: do not touch photos, derivatives only). Not to do: do not overwrite `imageUrl`/`originalImageUrl`; do not delete originals.

### S8. Resilience: watchdog, scheduled soft reload, wake lock (C9)
- What: heartbeat every second with `requestAnimationFrame`; if no slide change for `2 x hold + 5 s` while visible, skip to the next ready slide; if it persists for 60 s, `location.reload()` (with a sessionStorage counter: at most 3 reloads per 10 min, then show the last good frame and keep trying); a soft reload every 4-6 h at a slide boundary (the player restarts from the server queue; no data loss); request a Screen Wake Lock and re-acquire on `visibilitychange`. Document the operator checklist (Chrome `--kiosk`, power settings, `--disable-features=CalculateNativeWinOcclusion` on Windows, nothing overlapping the window) in `RUNBOOK.md`.
- Verify: block all network for 2 minutes in DevTools: watchdog logs, reload happens once, screen resumes; leave a test screen 6 h and compare memory.
- Risk: low-medium (reload loops: protect with backoff counter). Not to do: do not reload while an image is mid-fade; no reload loop without a cap.

### S9. Later, only if S1 data shows the network is still the bottleneck
Service worker precache of the next N screen images and the overlay (Serwist, cache-first for content-addressed blob URLs, versioned cache name, purge on activate); SSE "new photo" hint with reconnect (cap 300 s per stream) or a longer poll. Not before S2-S7.

### Reproducing a freeze locally (no production, no writes to messmass)
1. Pure logic: the simulation of the queue shows C1; it becomes the S2 unit test.
2. Network: Chrome DevTools, Network tab, throttling profile "Slow 4G" or a custom 1 Mbps / 400 ms profile, "Disable cache" on for startup tests and off for steady state; Performance tab CPU 6x slowdown for a weak signage box.
3. Slow or hung images: a small local server that serves one JPEG at 100 kB/s and hangs every 5th request, with `Access-Control-Allow-Origin: *` and a 30-day cache header like a Blob URL.
4. End-to-end: a Playwright test (`tests/e2e`, config exists) that opens `/slideshow/<test id>` against the local dev server with `MONGODB_DB=camera_test`, and uses `page.route` to (a) answer `**/api/slideshows/*/playlist*` with a fixed-order fake server (the model of the queue simulation), (b) answer `**/played` with 200, (c) fulfil image URLs with the slow server. Assertions: sample `img.currentSrc` every 250 ms; max time with an unchanged `currentSrc` is at most hold + 1.5 s; no two consecutive slides identical; under a hung image the max stall stays under the timeout.

---

## 5. Instrumentation first (so the next freeze leaves evidence)

**Where:** a client hook used by `SlideshowPlayerCore` (variant-aware: tag `variant`, `instanceKey`, `slideshowId`), a ring buffer of the last 500 events in memory and mirrored to `sessionStorage` every 10 s (survives a reload; wrap in try/catch), and a beacon to a new `app/api/observability/slideshow-diagnostic` route that mirrors `app/api/observability/capture-diagnostic/route.ts` (public, size-bounded, allow-listed, logged with `logInfo`, never persisted, `RATE_LIMITS.DIAGNOSTICS` 300/min). Send: every 60 s (batched summary), and immediately on a stall, a reload, or an error burst (`navigator.sendBeacon`, fall back to `fetch keepalive`).

**What to record (all small, no images, no personal data; ids hashed or shortened to the last 6 characters, URLs reduced to host plus last path segment):**

| Event | Fields | Answers |
|---|---|---|
| `slide_shown` | slide id, `dupOfPrev`, `queueLen`, `msSincePrevShown`, `imgComplete` at swap, `naturalWidth/Height`, `decodeMs` (if measured), `srcHost`, `bytes` and `fetchMs` from `PerformanceResourceTiming`, `fromCache` guess (duration under 20 ms) | C1 repeats, C3 fetched-at-swap, C4 weight |
| `playlist_fetch` | `limit`, status, `ms`, returned ids vs queue (dup count), server `diagnostics.generationMs`, `excludeCount` | C1, C6, C2 |
| `preload` | start, end, `ms`, outcome (ok / error / timeout), `bytes`, queue position | C2, C4, C8 |
| `lock` | `refillBusyMs` each time the single-flight lock is released; log when held over 5 s | C2 |
| `heartbeat` (every 10 s) | uptime, `visibilityState`, max rAF gap in the interval, count and max of long tasks / LoAF (`PerformanceObserver`, feature-detected), `performance.memory.usedJSHeapSize` (Chrome only), `preloadedImages.size`, `queueLen`, `navigator.connection` `effectiveType/downlink/rtt` (Chrome only), `onLine` | C7, C9, network class |
| `stall` | no slide change for `2 x hold + 5 s`: attach the last 30 events and the state above; also when a decoded-but-not-shown slide waits | all |
| `error` | `window.onerror` / `unhandledrejection` short message, resource errors on `<img>` | C8 |

**Server side:** in the playlist route add a `Server-Timing` header (phases: rate-limit, slideshow, event, inactive emails, aggregate, theme, total) and `logWarn('slideshow.playlist_slow', …)` when total exceeds 1000 ms with the phase breakdown and pool size (no ids). `generationMs` already exists in the body.

**On-screen aid:** `?debug=1` shows a small corner panel (queue length, last 10 slide ids, `msSincePrevShown`, max rAF gap, lock time, heap, last error) and exposes `window.__slideshowLog` (the ring buffer) so an engineer can read it through DevTools remote debugging or the owner can screenshot it. Hidden by default; no layout impact.

**How to read it afterwards:** Vercel runtime logs, filter `camera.slideshow_diagnostic` (and `slideshow.playlist_slow`), group by `slideshowId` and time; look for `stall` records and read the 30 events around them. The questions each answers: did the same id repeat (`dupOfPrev`)? was a request or the lock stuck (`lock`, `preload` timeouts)? was the image fetched twice or late at swap (`imgComplete=false`, `fetchMs`)? did the page stop being painted (rAF gap, `visibilityState`)? was memory climbing (`usedJSHeapSize`, `preloadedImages.size`)? was the server slow (`generationMs`, Server-Timing)? A second copy lands in `sessionStorage` so a reload does not erase the last minutes.

---

## 6. Open questions I could not answer from the code

1. Device, OS, browser and version, GPU, resolution of the giant screen (MTK x Vasas LED wall) and how it is connected (wired, venue Wi-Fi, 4G).
2. The live slideshow's `orderMode`, `bufferSize`, `transitionDurationMs`, `fadeDurationMs`, `submissionSourceMode`, `playMode`; is the screen `/slideshow/<id>` or the layout page; how many players share one IP.
3. Which freeze: slow start (10-20 s at load/reload), or the picture sticks mid-loop? Does it recover alone, and does a manual reload fix it? Time of day (capture traffic peak?) and how often.
4. Image mix for that event: share of try-on results vs guest photos, `mimeType`, `fileSize` p50/p95, share of `i.ibb.co` URLs.
5. Response headers of one public Blob image with and without an `Origin` header (`access-control-allow-origin`, `vary`, `cache-control`, `age`, `x-vercel-cache`): decides how bad C3 really is. I did not request any production URL.
6. Blob store region, Vercel function region (default `iad1`; `vercel.json` is `{}`), Atlas tier and region, whether Fluid compute is on, whether Upstash is still unset.
7. `explain()` of the two hot queries (`distinct` on `cameraAccountDisabled`, the playlist `aggregate`) on production data, and Atlas profiler data for the event day.
8. Whether the GDS `PlaybackSurface` wrapper (Mantine `Paper` with title, status badge, padding; `node_modules/@sovereignsquad/gds-core/dist/chunk-KBYLW5WJ.mjs` around line 3490) is visible around the stage on the real screen; the stage is absolutely centred over it so probably hidden, but I did not see a rendering.
9. Chrome's actual memory-cache reuse between a CORS-mode `Image` and a no-cors `<img>`, and its default timeout for stalled image loads: not verified; a 20-line test page on the target browser settles both.
10. Whether anyone has observed the same photo repeating on the screen (supports C1) or a blank/old frame while loading (supports C3).
