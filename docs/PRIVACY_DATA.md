# What camera stores about a user, and for how long

Written for owner decision 243 (2026-10-10, issue 521 phase 2): **stop storing the IP address of every photo, and review the full device string.** It is the one place that lists what is kept about the people who use the capture pages, where, and for how long, so the privacy notice and the answers to a request can be checked against it. The plan and the other decisions are in [ANALYTICS_AUDIT.md](ANALYTICS_AUDIT.md); the anonymous journey recording has its own page, [JOURNEY_RECORDING.md](JOURNEY_RECORDING.md). State of 2026-10-11.

## The decision and what changed

| | Before | Now |
|---|---|---|
| IP address of a photo | stored with every photo (`metadata.ipAddress`), read by nothing | **not stored** |
| IP address of an editor's gallery upload | stored (`metadata.ip`) | **not stored** |
| Device of a photo | the full user agent (`metadata.deviceInfo`: model, system version, build, close to a fingerprint) | **only a device class** (`metadata.deviceClass`: `ios`, `android`, `desktop`, `unknown`), **a browser family** (`metadata.browserFamily`: safari, chrome, firefox, edge, samsung, opera, in-app, other; never a version) and the legacy `metadata.deviceType` made from the class; the user agent is read once from the request and **not kept** |
| Device of an editor's gallery upload | the editor's user agent (`metadata.device`) | **not stored** (the photo was not taken by a user) |

`lib/device/coarse.ts` makes the class and the family; `app/api/submissions/route.ts` stores them. The Analytics Devices figure keeps working for old and new photos: it reads `deviceClass`, and for a photo taken before the change it classifies the stored user agent when it reads it (`lib/analytics/facts.ts`).

**Nothing stored was deleted or rewritten.** The photos taken before this change still hold the IP address and the user agent they were saved with. They are read by nothing but the Devices figure (the user agent). What to do with them is the owner's decision: `npx tsx scripts/count-stored-photo-addresses.ts` counts them by event and prints the update that would remove them. It is **read only** (it has no apply). Removing the user agents should wait until `metadata.deviceClass` has been written from them, or the Devices figure turns those photos into "not recorded".

## What is kept about a user

| What | Where | Holds | Kept |
|---|---|---|---|
| The photo | `submissions` | the picture, the event, the frame and message chosen, how it was taken, the framing, sizes, the times, the review decisions; the name and e-mail **if the user gave them** (the Who-are-you page or a sign-in); the account id of a signed-in user; the device class and browser family (new photos) | until the photo is removed |
| The unframed photo (the crop the user saved, before the frame) | a private file in the Blob store (`pending/<event>/…`, an unlisted address, never returned by a public route) and, since issue 509 (owner decision 295), **a second copy on ImgBB** (a public third-party image host: the file has an address that anybody who knows it can open, and ImgBB's terms let it remove files without notice), both named on the photo in `imageCopies` | **since issue 509 it is kept after the photo is approved** (it used to be deleted at approval). Owner answer 226: kept **90 days after the event, then deleted on request**. **That deletion is not built: nothing deletes it automatically yet**, so today it is kept until the photo is removed. Deleting a photo deletes the Blob file and requests the deletion of the ImgBB file through its stored link (best effort: a failed request is logged with the file's address, and the file is then removed by hand) |
| The framed picture | `submissions` (`imageUrl`), in the Blob store and, when the mirror worked, on ImgBB (its address and delete link are now recorded in `imageCopies`) | the picture the public sees (the frame is on it) | until the photo is removed |
| Consents | on the photo, `consents[]` | the page, the exact text and link, the sentence read, accepted, the time. Only acceptances exist | with the photo |
| Registration | `email_registrations` | the event, e-mail, name, first and last seen, whether the welcome e-mail went (only for events that send it) | until removed |
| The anonymous journey | `journey_daily`, `journey_events` | counts and anonymous steps, **no IP address, no user agent, no cookie, no person** | rows 30 days, counts for good |
| Visits to a tracked link | `short_link_hits` | a count per link, day and kind of phone (`android`, `iphone`, `other`); bots and previews are not counted | for good |
| Camera diagnostics | log lines only (`camera.capture_diagnostic`) | a random id of the page visit, the camera mode, timings, sizes, **the user agent cut at 200 characters**; no IP address, name, e-mail, image or cookie. Not stored in the database | the log service's retention |
| Screen diagnostics | log lines only (`camera.slideshow_diagnostic`) | the same kind of record from the giant screens | the log service's retention |
| A crash of a page | log line (`/api/observability/client-error`) | the error, the address of the page, the user agent | the log service's retention |
| People who manage the service | `activity_log` | who did what and when, the outcome; **no IP address, no request body** | until the weekly export after the one that sent it |
| A signed-in session | `web_sessions` | the session payload of a signed-in person | until it expires |

## The IP address, everywhere it still appears

- **The rate limiter** (`lib/api/rateLimiter.ts`) uses the IP address to count requests. It keeps it **in the memory of the server instance** (a bucket per path and address, cleared after an hour) or, when Upstash is configured, **as a SHA-256 hash** (`lib/api/upstash-rate-limit.ts`). It is not written to the database.
- **The hosting platform** (Vercel) sees every request and keeps its own request logs with addresses. That is the platform's, not camera's, and not something the application can switch off.
- **Old photos** hold what they were saved with (above).
- Nothing else in `lib` or `app` reads or writes an IP address (checked by a search of the sources for `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip` and `ipAddress` on 2026-10-11).

## Still to decide (the owner)

1. What to do with the IP addresses and user agents of the photos taken before this change: leave them, or remove them (after the classes are written, for the user agents).
2. The wording of the privacy notice (the audit's step F): this page is the list it must match.
3. The erase flow covering the journey records (they hold no person, so it has nothing to erase for one user; the photo's own erase flow is unchanged).
