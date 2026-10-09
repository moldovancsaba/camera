# Operations Runbook

## Branching model

Single long-lived branch `main` (production), plus short-lived per-task branches
(`feature/*`, `fix/*`, `chore/*`, `dependabot/*`, …) merged in and then
deleted; no `dev`/`preview` branch exists. Every push to `main` deploys. Policy
and current practice (PRs recommended; most changes are pushed directly) in
[docs/BRANCHING.md](docs/BRANCHING.md).

## Deploying to production

Production deploys from git: every push to `main` builds and promotes
`narimato/04_camera` via the Vercel Git integration (verified 2026-09-28:
production = `origin/main`). Vercel does not wait for GitHub Actions — run
`npm run inventory:check && npm run release:check` before pushing.
`npx vercel@latest --prod` is for manual redeploy/rollback only.

The build is promoted to all production domains: `camera.messmass.com`,
`go.messmass.com` and `camera.doneisbetter.com` (savetheworld reads camera
through it; do not detach it). `fff.messmass.com` was detached on 2026-09-30.

`main` has a GitHub branch protection rule requiring a pull request (0
approvals) and the `Verify` status check (`.github/workflows/ci.yml`). Since
2026-09-30 it is enforced for admins (`enforce_admins: true`) and force-pushes
are off, so every change reaches `main` through a green PR. Vercel deploys each
merge to production without waiting for further checks.

### Verify after deploy

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://camera.messmass.com/            # expect 200
curl -s -o /dev/null -w "%{http_code}\n" https://camera.messmass.com/admin/events # expect 307 -> /admin/login
curl -s -o /dev/null -w "%{http_code}\n" https://go.messmass.com/admin/events     # expect 307 -> /admin/login
npx vercel@latest api "/v6/deployments?app=04_camera&target=production&state=READY&limit=1" --scope narimato
# -> deployments[0].meta.githubCommitSha must equal `git rev-parse origin/main`
```

Admin pages require SSO and, on both domains, 307-redirect to `/admin/login`
when unauthenticated (`proxy.ts` gate; `/admin/login` then decides how to reach
SSO) — that redirect (not a 500 / "Oops") is the healthy signal.

## Local production-parity check

To reproduce production behavior locally (catches RSC/render crashes that
`next dev` masks):

```bash
npm run build
ALLOW_DANGEROUS_DEV_ROUTES=true PORT=3001 npm start
# dev-login bypass (local/staging only):
# /api/auth/dev-login?role=admin&access=true&email=you@local&redirectTo=/admin
```

## Health checks (any environment)

```bash
npm run type-check                  # tsc --noEmit
npm run lint
npm run build
npm run verify:production-guards    # dev-login/e2e routes blocked in production
npm audit
```

GitHub Dependabot showed 0 open alerts on 2026-09-29 (`gh api
repos/moldovancsaba/camera/dependabot/alerts?state=open`): v12.3.38 (`61b45fa`)
updated `sharp`, `next`, the `postcss` override and the transitive packages, and
superseded the open Dependabot PRs.

CI (`.github/workflows/ci.yml`, job `Verify`) also runs a gitleaks secret scan of
the working tree before installing anything (since v12.3.39). A finding fails the
job and uploads a redacted `gitleaks-report` artifact. A false positive is
allowlisted by exact value (an anchored regex under `regexes`) in
`.gitleaks.toml`, with the reason written next to it; never by path, because a
path entry stops scanning that whole file.

## Rate limits (Vercel Firewall, configured outside the repo)

Camera's in-app limiter (`lib/api/rateLimiter.ts`, `RATE_LIMITS`) counts in each
serverless instance's own memory, because `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` are not set in production. A burst test on 2026-09-30
showed the effect: 130 requests to `POST /api/submissions` (limit 10 a minute)
got 67 answers from the app and 33 from the in-app limiter, so about ten times
more than intended passed. The real ceiling is a Vercel Firewall rule:

| Rule | Matches | Limit | Notes |
|---|---|---|---|
| `fan-upload-flood-ceiling` | `POST /api/submissions` (exact path, so the owner-checked `PATCH`/`DELETE` on one submission are not counted) | 100 requests per 60 s per IP, fixed window | Throttles only while over the limit, no lockout. The blocked response is a 429 with `x-vercel-mitigated: deny`, sent before any camera code runs. |

- **Why 100.** Fans at a stadium share Wi-Fi and carrier NAT addresses, so one IP
  can legitimately carry many guests. The number is a flood ceiling, not a
  per-user quota. The in-app limiter stays as a second layer.
- **Inspect.** `npx --yes vercel@latest firewall rules list --project 04_camera --scope narimato`
  and `... firewall overview` (traffic by action, busiest rules).
- **Tune or disable.** Changes are staged as a draft and only go live on
  publish: `firewall rules edit fan-upload-flood-ceiling ...` (or
  `firewall rules disable fan-upload-flood-ceiling`), review with
  `firewall diff`, then `firewall publish`; `firewall discard` throws the draft
  away. If guests report upload errors at a live event, raise the limit or
  disable the rule first, then look at `firewall overview`.
- **Not in git.** This configuration lives in the Vercel project, like the
  environment variables, so it is not restored by a redeploy. Recreate it with the
  command in `HANDOVER.md` ("Firewall") if the project is ever rebuilt.
- **Upstash.** Distributed in-app limits need the two Upstash variables above
  (`.env.example`). Not planned; if it is ever enabled, retune `RATE_LIMITS.UPLOAD`
  first, because per-IP limits that start counting globally would tighten and
  could throttle fans who share an IP.

## How the photo is taken, and what is kept (camera#257)

It works the same way for every camera (owner decision 2026-10-06): the largest still the camera can take, at the moment
of the shutter, then the guest zooms and pans anywhere in it, presses "Continue" (which saves the photo; the separate "Love it" screen is gone, camera#344), and **only the frame-sized result is saved**.
The full-size photo stays in the browser during the reframe step and is dropped afterwards; nothing is uploaded for it.

- **Every touch device** (iPhone, iPad, Android phones and tablets, any browser): the device's own camera app, through a file
  input with `capture`. The page has one "Take photo" button; the camera app opens on the front camera and the user changes between all
  the cameras in it (the second "Use the back camera" button was removed, owner 2026-10-09). The photo is used
  as the camera gave it (an iPhone Air front camera: 18 MP, 4896 x 3672) with its EXIF orientation applied, not re-encoded;
  only a photo above 40 MP is scaled down once. There is no live view inside the page on these devices; the frame's boxes
  show in the reframe step. The camera app may add its own "Use photo" tap.
- **A desktop webcam** (no camera app exists): the live view, where the shutter takes a real photo
  (`ImageCapture.takePhoto`, Chrome and Edge) at the largest size the camera offers (at most 40 MP), and uses the video frame
  when the photo fails, takes more than 7 s, or has another shape than the live view. Safari and Firefox on a desktop have no
  `takePhoto`: the video frame, the most they can give.
- **Back to the old capture:** add `?capture=frame` to the capture link (live view and video frame on every device);
  `?capture=still` and `?capture=system` force the other two methods for testing.
- **The four front-camera views (issue 525; owner 2026-10-09, four screenshots of the iPhone's Camera app):** the newest iPhones' front camera has a square sensor and the Camera app offers **portrait or landscape** and **wide or tight**; the device's own camera that a file input opens shows only the portrait ones, and Safari gives a page no control over those modes (they are native camera features). So the page can offer the views itself on its **live view**: `?views=1` on the capture link turns the live view on (instead of the device's camera app) with two choices at the top: **Portrait | Landscape** and **Wide | Tight** (Hungarian: Álló | Fekvő, Széles | Közeli). **A press always changes the view.** The camera is asked for the shape once (**Landscape** 1920 x 1440, **Portrait** 1440 x 1920); if the picture that comes back has another shape, the page cuts the middle of it to the shape chosen (3:4 or 4:3) and does not ask again (the owner's iPhone 2026-10-09 gave the same landscape 4:3 picture for both, so the two buttons showed no difference, and each press restarted the camera twice); **Tight** keeps the middle 70 % of what is left (the phone's own zoom is not available to a page on every phone). What is shown is exactly what the shutter keeps. A line under the view says what the phone gave and what was asked (`1920×1440 (asked 1440×1920) · this phone keeps its own shape: cut to the view`) so a screenshot is enough to tell a phone's behaviour. **The live stream is the raw sensor stream**: in low light it is darker than the Camera app's picture, which the Camera app processes; a page cannot ask for that. The reframe step afterwards works as always. **It is off unless the link says so**: nothing in the capture path of any event changes (the match on 16 October uses the device's camera app) until the owner has tried `?views=1` on the phone and decides. Code: `lib/camera/view.ts`, `components/camera/CameraCapture.tsx` (`viewControls`), `captureFullFrame` (crop).
- **Diagnostics:** the `capture` record has `method` (`system`, `still`, `frame`), `nativeWidth` / `nativeHeight` (the
  photo's own size), `outputWidth` / `outputHeight` and `stillFellBack`. Use `?cameraTest=<label>` on a phone test.
- **If a phone's photo cannot be opened** (a format the browser cannot decode) the guest sees "We could not open the photo.
  Please take it again." and stays on the camera step.

## Full-frame originals (camera#210, no longer stored since camera#257)

Until 2026-10-06 the camera recorded the whole image, the fan framed it afterwards, and the pure original was stored with the
submission next to the framed photo. **The capture page no longer uploads it** and no longer sends `originalImageUrl` or
`reframe` (owner: keep only the frame-sized image). The section below describes what older submissions still carry and what
the server still accepts (a page opened before the change may still send them). `POST /api/uploads/original` is not called by
the page any more; remove it, the claim handling in `POST /api/submissions` and `npm run blob:orphans` once no page loaded
before the change can still be open.

- **Where:** Vercel Blob, `originals/<eventId>/<random>-<suffix>.jpg` (public store, unguessable
  path, never returned by a public route, never mirrored to imgbb). `submissions.originalImageUrl`
  points at it and `submissions.reframe` records how it was framed.
- **How it gets there:** when a fan taps Save, the browser asks `POST /api/uploads/original` for a
  token (one JPEG, at most 15 MB, 10 minutes, existing event only) and uploads straight to
  `https://vercel.com/api/blob/` (allowed by the CSP `connect-src`). The submission then carries
  only the URL. `POST /api/submissions` accepts it only when it is inside the event's folder of our
  own store and a Blob lookup confirms a JPEG of an allowed size; a foreign or malformed claim is a
  400, a file it cannot confirm just drops the original.
- **If the upload fails** (network, token route down) the browser retries twice, then saves the photo
  without the original; the submission looks like an older one (original = composite, no `reframe`).
  Look for `submissions.original_unverified` log lines and for submissions that have a framed photo
  but no `reframe` after the rollout.
- **Cleanup:** deleting a submission now deletes its files (see "Deleting a submission"). An upload
  that succeeds but whose save never completes leaves an orphan under `originals/`;
  `npm run blob:orphans` lists them.
- **Privacy:** the original shows more of the scene than the framed photo, so the privacy and consent
  text must say the full camera image is stored (proposed wording under "Deleting a submission").

## Installing the capture flow as an app (camera#222)

Each event installs as its own app: `GET /capture/<eventId>/manifest.webmanifest` (public, built by
`lib/pwa/event-manifest.ts`) names the app after the event, opens at `/capture/<eventId>?source=pwa`, stays in
that event's scope, takes the event's brand colour as the status-bar colour, runs `standalone` and allows
**both orientations** (`orientation: any`). The event layout links it and adds the iOS web-app tags and
`viewport-fit=cover`; full-screen shells pad themselves with the safe-area insets (`.app-safe-area`).

- **Install:** iPhone/iPad Safari: Share, Add to Home Screen. Android Chrome: the install prompt or menu, after
  a few seconds of use. Desktop Chrome/Edge: the install icon in the address bar.
- **Check an event's manifest:** `curl -s https://<host>/capture/<eventMongoId>/manifest.webmanifest` should return
  JSON with that event's name; an unknown or malformed id is a 404. Chrome DevTools, Application, Manifest shows the
  parse and installability result.
- **No service worker, so no offline mode,** on purpose: capture and upload need the network, and a stale cache
  on a fast-moving app is a bigger risk than the benefit. Chrome does not require one to install.
- **Icons** are `public/pwa/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, generated from `app/icon.png`
  (200x200), so the 512 versions are enlarged. Drop in a 512x512 original under the same names to sharpen them
  (the files are cached for a year, so use new file names and update `PWA_ICONS`).
- **Limits to know:** the share page (`/share/<id>`) and the SSO login are outside the app's scope, so they open in
  the system's in-app browser sheet; the Android back gesture leaves the app from any step (steps are not history
  entries); the manifest is cached for 5 minutes at the edge, so a rename reaches installed apps shortly after.
- **GDS:** `getGdsWebAppManifest` cannot be imported by a Next route handler (it fails `next build`, see
  camera#225), so the same shape is built locally and a unit test compares it with the GDS generator.

## Deleting a submission (camera#211)

`DELETE /api/submissions/[submissionId]` (the owner or an admin) and
`POST /api/admin/tryon-results/[submissionId]/remove` (global admin) delete the stored files first and
the database record second.

- **What is deleted:** every file of the submission in this project's own Blob store: the composite
  (`imageUrl`/`finalImageUrl`), the full-frame original (`originalImageUrl`), the preview, and the
  try-on source. A URL on any other host is never touched. A file another submission still points at is
  kept and counted as `keptShared`.
- **If a file cannot be deleted:** the answer is 502 and the record stays, so the same request can be
  repeated (deleting a file that is already gone is not an error). A failure is logged as
  `Submission <id>: deleting N stored file(s) failed`. The record is never removed while a file it
  names may still be online.
- **imgbb mirror:** the stored delete link is requested (only `ibb.co` / `imgbb.com` links are ever
  called) and `files.imgbbFailed` reports a failed request, but it never blocks the delete.
  **Not verified:** whether imgbb deletes on that request, because no imgbb key was available when this
  was built. Check once with a real mirrored submission: delete it, then open its `i.ibb.co` URL.
  The mirror is only written when `IMGBB_API_KEY` is set.
- **Not covered:** the try-on result derived from a deleted submission stays until it is removed with
  `POST /api/admin/tryon-results/[submissionId]/remove`; try-on job records keep their (now dead) URLs;
  deleting an event leaves its submissions and their files; event and partner "remove" only hide a
  submission, so it keeps its files by design (restorable).
- **Orphans from before this change:** `npm run blob:orphans` (needs `MONGODB_URI`, `MONGODB_DB`,
  `BLOB_READ_WRITE_TOKEN` from `vercel env pull`) lists Blob files no document refers to, split by
  folder, and holds back files under 24 hours old as possible uploads in flight. It only reports.
  Decision for the owner: delete the orphans older than a retention period once the list is reviewed.

### Proposed wording for the privacy text (needs owner or counsel sign-off)

The privacy policy and the consent pages are written per landing page and event (database content, not
code), so the wording below is for the owner to paste where it fits; nothing here changes live text.

- "We store the full, uncropped camera image next to the framed photo. It shows everything the camera
  saw, including people and places around you. We use it only to produce your photo and never publish it."
- "We also record, without any personal data, whether your camera worked (browser, device type, camera
  settings) to fix capture problems."
- "You can delete your photo at any time. Deleting it removes the framed photo and the full camera
  image from our storage. [Retention: state how long photos are kept after the event, for example
  N months, then deleted.]"

## Generated default frame (camera#231)

An event without a frame of its own gets a generated frame (plan: `docs/DEFAULT_FRAME_PLAN.md`). This section covers
what is built so far, the data (`events.frameDesign`, camera#234); the renderer, the capture flow, the editor
panel and the backfill follow (camera#235 to #238).

- **Snapshot:** taken from messmass `GET /api/integrations/camera/events/[id]/frame-context` when messmass provisions
  the event, and when an admin calls `POST /api/admin/events/[id]/frame-design/refresh` (the editor panel gets a
  button, camera#237). There is no automatic follow of messmass changes.
- **Failure behaviour:** a slow, failing or unconfigured messmass never blocks provisioning. A refresh that gets no
  usable answer keeps the previous snapshot and answers `messmassUnavailable: true`; an event with no snapshot yet
  gets the fallback built from camera's own name and partner logo, no teams, and the system theme (Inter, light
  colours), `source: camera`. A later refresh replaces the fallback with the messmass data. Look for
  `frame design snapshot failed for a provisioned event` in the logs.
- **`changed`:** a refresh reports `changed: true` only when something drawn differs (names, partner logo, font,
  colours); fetching the same data again is not a change.
- **Messages:** `GET` and `PUT /api/admin/events/[id]/frame-design`. At most 10, 80 characters each, placeholders
  `{partner1}` and `{partner2}` only (the two sides the frame shows: home team and visitor, or the two sides of a pairing in the event name, camera#248); `{ reset: true }` restores the five default messages.
  The default list follows the code until an event edits it.
- **Checks:** `GET /api/admin/events/<id>/frame-design` as an admin shows the snapshot; `source` tells whether it
  came from messmass; `context.style.resolvedFrom` tells which messmass level the theme came from.
- **Images (camera#235):** one transparent 1920x1080 PNG per usable message, drawn on the server
  (`lib/frame/render.ts`, `@napi-rs/canvas`) and stored in Vercel Blob under `frames/generated/<eventId>/<key>.png`;
  `frameDesign.variants[]` keeps each image's URL, message, layer boxes (for the live-view territories), font and logo
  state. They are generated after a refresh, after the message list is saved (a `502` means the snapshot or the list
  is saved but the images are not: repeat the request, it is safe), and after provisioning (after the response).
  A message whose `{partner1}` / `{partner2}` cannot be filled is skipped; with no usable message there is one image
  without a message layer.
- **Reuse:** an image is redrawn only when something that decides it changed (what is drawn, the message, the font
  actually used, the drawing code `FRAME_RENDER_VERSION`). An image made while the logo could not be fetched
  (`logo: failed`) or a custom font could not be fetched (`font.retry`) is redrawn at the next generation.
- **The event emoji as the logo (camera#274):** a partner with no logo gets the first emoji of the event title in the logo spot (see the
  plan, decision 17). Images drawn with an older drawing code are drawn again by "Redraw the older images" on `/admin/frames/generated`
  (dry run first; it only touches images, never the snapshot).
- **Rolling the frame out to existing events (camera#238):** `/admin/frames/generated` (Libraries, "Generated Frames",
  global admin only), API `POST /api/admin/frame-backfill`. It covers every event with no active frame of its own and no
  generated images; events with an own active frame are never touched, events with images are skipped, so it can be
  repeated and continued. Order:
  1. **First check on Vercel** (above), on one event, from the Frames page of that event.
  2. **Dry run**, with the messmass check on. It writes and draws nothing; the messmass check asks messmass once per linked
     event (read-only, up to 40 s). Read the counts: events with an own frame, with images, to do (linked, native,
     inactive, with a snapshot but no images), native events without a partner logo, and from messmass how many will
     have a logo, real teams, a pairing in the name or the event name only, which theme they get and how many use a
     custom font. The owner reviews this before the run.
  3. **Run**: tick that the report was read, confirm; it takes three events per request and continues until none is
     left; "Stop after this batch" ends it, running again continues (finished events are skipped). A **linked event
     messmass gives no usable answer for is not drawn from camera's fallback**: it is listed as waiting and stays to do
     (use the event's own Frames page, Refresh, to force the fallback for one event). Failures are listed per event and
     retried by the next run. When it ends a dry run is repeated, so "To do" is what is left.
  4. **First-day checks**: the final dry run shows `To do` equal to the waiting and failed events only and `With a frame
     of their own` unchanged from the first report; open the capture link of three events (a pairing name, real teams,
     no logo) on a phone: territories in the live view, a different message on each shutter press, the real composition on
     the preview; save and open the share page; on an event with "apply frame to returned results" a try-on result carries
     the same frame. Logs to watch: `Frame backfill: event <id> failed`, `frame images could not be generated`,
     `submissions.frame_variant_dropped`.
  5. **Rollback**: per event, assign or activate a frame of its own (the generated one stops applying at once). For all
     events, revert the capture change (camera#246) or, with the owner's approval, remove the images from the events
     (`frameDesign.variants`); the stored images stay in Blob and a later run draws them again (identical inputs reuse
     the same files).
  Timing: about 3 events per request; 219 events are about 75 requests.
- **Editing (camera#237):** the panel at the top of `/admin/events/[id]/frames` shows the images, the snapshot and the
  message list, and has Save messages, Reset to the default list and Refresh from messmass (the first real way to take
  a snapshot and draw the images of one event; use it for the "First check on Vercel" above). A save or refresh takes
  a few seconds because the images are drawn then; a red notice with "Try again" means the data is saved but the images
  are not, and repeating is safe. "Messages saved" with `N images: X drawn, Y reused` is the normal answer.
- **Capture (camera#236):** while an event has no active frame of its own and `frameDesign.variants` has images, the
  guest page skips the frame picker, shows the layer boxes as 50% black territories in the live view and the reframe
  step, picks a variant at every shutter press and composes it on the preview step. The submission stores
  `frameVariant { index, message, imageUrl }` and `frameId: null`. To switch an event off, assign it an active frame of
  its own (the generated frame is derived, so this takes effect at once) and to switch it back, deactivate that frame.
  A `submissions.frame_variant_dropped` warning means a client sent an image that is not one of ours; the photo was saved
  without the record. The public event response carries `generatedFrame`, not `frameDesign`.
- **Event names that are a pairing:** when there is no home and visitor team, a name like "A - B", "A x B" or "A vs B"
  is drawn as two lines without the separator (camera#244, rules in the plan, decision 15). Bumping
  `FRAME_RENDER_VERSION` is how a change to the drawing code reaches existing events: their images are redrawn at the
  next generation (refresh, message save or provisioning), not all at once.
- **Old images are never deleted:** a submission records the variant it used and try-on composes with that URL later.
- **Logos** are drawn exactly as they are (their own transparency, nothing removed, no box behind them). Only https
  URLs on `i.ibb.co` and camera's own Blob store are fetched, with no redirects, 5 MB and 8 s limits; anything else is
  `logo: failed` and the frame is drawn without it.
- **Fonts:** Inter, Roboto, Poppins and Montserrat and the colour emoji font are bundled in `assets/frame-fonts` (OFL,
  see its README). A custom partner font is fetched from the messmass origin at render time (a plain `/fonts/` path,
  3 MB, 5 s), kept in memory only, never stored. If it cannot be had the frame uses Inter and `font.note` says why.
- **First check on Vercel:** the renderer was verified on macOS and by the Linux CI tests of the same code, but not
  yet inside a deployed function. After the first deploy, refresh one event as an admin
  (`POST /api/admin/events/<id>/frame-design/refresh`) and open `frameDesign.variants[0].imageUrl`: a frame with text
  and the logo (if the partner has one) means the canvas package and the fonts work there. A 502 with
  `frame images could not be generated` in the function log means they do not.

## Photo vetting (camera#261)

Plan and decisions: [docs/PHOTO_VETTING_PLAN.md](docs/PHOTO_VETTING_PLAN.md). The setting is `events.photoVetting.required`; until the rollout
package it is off for every event, so none of the behaviour below applies yet.

- **A vetted photo** is saved `pending_review` with the plain photo in a private Blob object under `pending/<eventId>/`. No picture exists,
  nothing is mirrored to imgbb, no link is shown or emailed, and a requested try-on is held.
- **Approve or reject:** the event's **Vetting** tab (`/admin/events/<id>/vetting`, global admins and the event's partner Events managers; the global
  Vetting page lists the events whose photos wait). Photos come first, the try-on results of the event below them, for global admins:
  Waiting / Rejected / Approved lists, approve or reject one photo, or select several and approve them together. It calls
  `POST /api/admin/submissions/<id>/review` with `{"action":"approve"}` or `{"action":"reject","reason":"..."}`. The same tab shows the
  event's setting; only a global admin can switch it (turning it off asks first).
  Approval composes the plain photo with the frame image the photo recorded (the generated variant, or the event's own frame), stores the
  picture, publishes the photo, applies the guest's pledge-wall choice, queues the held try-on, emails the share link
  (`/share/<token>`, whatever the event's own email switch says) and deletes the private photo. Rejection keeps the photo private, cancels the
  held try-on and emails a short fixed "not approved" note with a link to take another photo. A rejected photo can still be approved.
- **If approval answers 502** ("the photo stays pending"), the frame image or the photo could not be fetched or stored; nothing changed, so
  repeat the action. A frame is never skipped silently: an unframed picture is only made for a photo that recorded no frame at all.
- **If the email did not go out** the answer says `email: failed` or `skipped` (no address, no sender configured); the photo is approved
  either way, and `metadata.emailSent*` on the submission shows what happened.
- **The share link** of a vetted photo is `/share/<shareToken>` (in the approval email). Waiting: a notice that refreshes itself; rejected: a
  notice with "Take another photo"; approved: the photo. A waiting or rejected photo is only shown to its token, never to its database id.
  Run `npm run db:ensure-indexes` once before the rollout: it adds the unique `shareToken` index the lookup uses.
- **Pending photos in the Blob store** are referenced by `photoReview.photoUrl`, so the orphan finder does not report them and deleting the
  submission deletes the file.

### Turning photo vetting on (camera#271)

1. **One event first.** A global admin opens the event's **Vetting** tab (`/admin/events/<id>/vetting`) and presses *Turn vetting on*. Take a
   photo on that event's capture page (on a phone too): the guest first gives an email or logs in with Google / Facebook, sees the shapes
   instead of the frame, saves, and reads "waiting for approval". The photo must be on **no** public page. Then approve it on the Vetting tab:
   the guest gets the email with `/share/<token>`, the page shows the framed photo, and the photo reaches the slideshow, the wall and the
   fanmass feed only now. Reject another one and check the "not approved" email and the page's "Take another photo".
2. **Indexes.** Run `npm run db:ensure-indexes` once (production env): it adds the unique `shareToken` index and the queue index.
3. **Every event.** `/admin/photo-vetting` (global admin; done on 2026-10-06, 238 of 238 events then and every event since is on, so the page has no sidebar entry any more (owner, 2026-10-08) and is opened by its address). *Run the dry run*, read it (how many events, which took photos in the last 24
   hours and 7 days: from the moment the run finishes their next photos wait for approval, so tell their managers first), tick *I have
   read the dry-run report*, then *Turn photo vetting on for every event*. The run is repeatable; events already on are skipped, and nothing
   written before is changed. Photos made before vetting stay public: a missing review status counts as approved and no approval time is
   written (the fanmass feed would otherwise send them again).
4. **New events** start with vetting required (`PHOTO_VETTING_DEFAULT_FOR_NEW_EVENTS` in `lib/events/photo-vetting.ts` is `true`). It covers events
   created in the admin, by messmass provisioning and by savetheworld provisioning.

**Checklist for the first live event:** a test photo stays invisible (share page by id is "not found", no slideshow slide, not on the wall,
not in the fanmass feed); approval emails the guest and publishes it; a try-on requested with the photo runs only after approval; the
event manager (not only a global admin) can open the Vetting tab and approve; an event that has its own frame shows the darkened
silhouette, an event with a generated frame shows the shapes.

**Rolling back.** One event: the switch on its Vetting tab (global admin) turns vetting off; photos already waiting stay on the Vetting tab and
can still be approved, and new photos are published at once as before. Everything: turn the code default back (`false`) and switch the
events off one by one, or ask for a bulk switch-off. Nothing the rollout wrote is destructive: it only sets `photoVetting` on events.

## Event theme (camera#285)

The guest pages are drawn with the **theme** of the event: the background, heading, card, button and radius colours of its messmass style,
the partner's logo (else the event's emoji) and the font. It is the same snapshot the generated frame is drawn from
(`events.frameDesign.context`), so `GET /api/events/<id>` returns it as `theme` and nothing is stored twice. Events whose style is the
messmass default get the default look; an event with no snapshot yet gets the default look with its brand colour on the buttons.

- **It follows messmass.** Editing a style or a partner (logo, name, style, template, team data) in messmass posts to
  `POST /api/internal/messmass/theme-updated`; camera marks the events stale and refreshes the first ones at once, and every other event on
  the next guest request (after the response). A new logo also redraws the frame images of that event. There is no cron.
- **If an event keeps the old look.** The snapshot's `fetchedAt` (admin: the event's frame design) tells when it was last taken; an event
  messmass could not answer for stays as it was and is asked again after ten minutes (`events.themeCheckedAt`). *Refresh from messmass* in
  the event's frame design forces it.
- **Where it shows.** `app/capture/[eventId]/layout.tsx` wraps the whole guest journey in `EventThemeScope`, and `/share/<id>` and its
  notices are wrapped the same way; the cards (Mantine Paper, so the GDS flow shell too), buttons, inputs, headings and the public shell header
  take the theme through CSS variables (`lib/theme/css.ts`). A page without an event (or an event without a snapshot) keeps the default look.
- **Fonts.** Google fonts load from fonts.googleapis.com; custom fonts from `www.messmass.com/fonts/` (the CSP in `next.config.ts` allows
  both). A font that cannot load falls back to the system stack, so the page always renders.
- **Logos.** The theme shows the partner logo only from i.ibb.co, imgbb.com or the project's Blob store (the image CSP); anything else shows
  the event's emoji instead.
- **Contrast is enforced in code**, not in the style: text that would not read is shown in white or black, so a bad style costs the look,
  never the page.

## Capture diagnostics (anonymous)

The capture screen reports how each capture went so the rate of black or near-black photos can
be compared per device and browser (camera#204, plan `docs/CAMERA_MODULE_PLAN.md`).

- **What is sent** (`lib/camera/diagnostics.ts`): requested and granted camera mode, front or
  back camera, number of cameras, time to first frame, time until the shutter unlocked, time
  from unlock to the tap, number of attempts and broken-frame retries, brightness mean and
  spread of the captured frame, video and output size, page orientation, viewport and pixel
  ratio, and a random per-page-load session id. The server adds the user agent (200 characters).
- **What is never sent or kept:** images, names, emails, IP addresses, cookies, camera labels or
  device ids. Records are only written as a structured log line (`camera.capture_diagnostic`),
  never to the database. Unknown fields are dropped by an allowlist on the server.
- **Reading it:** export the runtime logs from Vercel (project `04_camera`) and run
  `npm run camera:diagnostics-report -- [--by browser|device|testRun] <logfile>`, or pipe the log
  text in. It groups records and prints broken-frame rate, dark photos, "no frame event" streams,
  and median timings. Lines without `camera.capture_diagnostic` are ignored.
- **Phone tests:** add `?cameraTest=<label>` to the capture URL (for example
  `?cameraTest=iphone-15-safari`); the label appears in every record of that page load and
  `--by testRun` separates those runs.
- **Privacy text:** landing-page privacy text is authored per landing page in the admin, so add
  this sentence to each one that is in use (wording to be confirmed by the owner or counsel):
  "When you use the camera we collect anonymous technical information about how it worked, such as
  the browser, the camera resolution and timings. It contains no photo and nothing that identifies
  you, and it is used only to make the camera more reliable."
- **Limits:** the beacon is rate limited to 300 requests a minute per IP (a venue can share one
  IP); excess records are dropped. It never blocks or delays capture.

## Slideshow diagnostics (anonymous, camera#476)

The giant-screen player reports what it does, so a freeze leaves evidence (`docs/_research/SLIDESHOW_FREEZE_RESEARCH.md`, step S1).

- **What is sent** (`lib/slideshow/diagnostics.ts`, `components/slideshow/useSlideshowDiagnostics.ts`): in batches of at most 100 events, every minute, when 90 are waiting, when the page is hidden or closed, and at once on a stall.
  - `slide_shown`: the photo (last 6 characters of its id), whether it is the same as the one before (`dup`), the queue length, the gap since the previous slide, how often the browser fetched its picture (`fetches`, 2 or more means the preload did not serve the screen), the load time and size where the browser says them, the picture's size, its host (never the path).
  - `playlist`: the call (`limit`, `excl` = ids sent as exclude), status, round trip `ms`, `serverMs` (the route's own `generationMs`), `got` and `fresh` slides.
  - `preload`: time and outcome (ok, error) of each image preload. `lock`: how long one refill held the single-flight lock.
  - `heartbeat` every 10 s: visibility, the longest gap between two animation frames (`rafGapMs`, a page that stops painting shows here), long tasks, JS heap (Chrome), preloaded pictures, queue length, online, network class.
  - `stall`: the show should be moving and no slide became current for two holds and five seconds (not while the page is hidden or paused); `error`: a window error or an unhandled rejection (80 characters).
- **What is never sent or kept:** pictures, addresses with paths or queries, names, e-mails, cookies, IP addresses, device ids. A record is only a structured log line (`camera.slideshow_diagnostic`, a warning when the batch has a stall or an error), never in the database; unknown fields are dropped by an allowlist. The server adds the user agent (200 characters).
- **Reading it:** Vercel runtime logs of project `04_camera`, filter `camera.slideshow_diagnostic`; group by `batch.session` (one page load) and read the 30 events around each `stall`. Did the same id repeat (`dup`)? Was a call or the lock stuck (`ms`, `lock`)? Was a picture fetched twice or late (`fetches`, `loadMs`)? Did the page stop painting (`rafGapMs`, `vis`)? Was memory climbing (`heapMb`, `preloaded`)? There is no report script yet (the capture one is `npm run camera:diagnostics-report`).
- **On the screen:** open the screen with `?debug=1` for a small panel with the last events in the corner, and `window.__slideshowLog` in the developer tools holds the last 300. Without `?debug=1` nothing is shown.
- **Server side:** `GET /api/slideshows/<id>/playlist` answers with a `Server-Timing` header (phases `rate`, `slideshow`, `event`, `inactive`, `aggregate`, `theme`, `total`), visible in the network tab, and a call over one second leaves one `slideshow.playlist_slow` warning with the phases, the pool size and the limit.
- **Limits:** the beacon is rate limited to 300 requests a minute per IP, a layout page with many cells sends one stream for each cell, and a stall is not reported while the page is hidden.

## Giant-screen operator checklist (camera#476)

For whoever sets up the screen that shows `/slideshow/<id>` at a venue. The player now recovers from a stall by itself, but a good setup prevents most of them.

- **What the page does by itself:** it keeps the display awake (Screen Wake Lock, re-asked when the page becomes visible again; needs https, which production has); if no slide has changed for two holds and five seconds while the page is visible it reports the stall and goes to the next slide; if the picture has not moved a minute after the stall began it **reloads the page** (the show restarts from the server's queue, nothing is lost), **at most 3 times in 10 minutes**, after that it only keeps skipping; a request to our server gives up after 8 s and a picture after 20 s, and a screen that cannot start retries by itself.
- **Set up the screen's computer:** wired network if there is any; no display sleep and no screen saver (the wake lock helps but the operating system's own settings are the first line); the browser's window **full screen** (the **Full screen** button that appears in the top-right corner when the pointer moves, a **double-click** on the picture, or the F key; or the browser's kiosk mode) and **nothing laid over it**: a window that is covered counts as hidden, and a hidden page's timers are slowed or stopped (on Windows Chromium treats a fully covered window as hidden; the flag `--disable-features=CalculateNativeWinOcclusion` turns that off, **to be tested on the Chrome build in use**, I have not run it); no other app popping notifications over the show; browser auto-update not scheduled during the event.
- **Check before the event:** open the screen's address once with `?debug=1` and look at the corner panel for a minute: `slide_shown` lines with `dup=false`, `fetches=1`, a `heartbeat` every 10 s with `vis=visible` and a small `rafGapMs`, no `stall` or `error`.
- **After a freeze:** Vercel runtime logs of `04_camera`, filter `camera.slideshow_diagnostic` (see "Slideshow diagnostics" above); a watchdog action appears as an `error` event with `watchdog: next slide` or `watchdog: reload`.
- **It reloads itself every 3 hours** (owner answer 212), at a slide boundary, so a picture is never cut: the show restarts from the server's queue in a moment. A layout cell never reloads. **Reload the screen now:** the **Reload the screen** button on the slideshow's card in the event's slideshows list (an Events manager of the partner, or a global admin): every open copy reloads at its next picture, a few seconds later. **Saving the slideshow does the same** (every save in the slideshow editor sets the same reload token, owner 2026-10-09), so a changed text, colour or setting shows on the screens that are already open without anybody pressing the button. The reload is an `error` event in the diagnostics (`reload: scheduled`, `reload: admin`).
- **Not built yet:** an editor guide of the giant screen (it comes in one messmass PR with the other guides).

## Screen pictures (camera#476, step S7)

The giant screen is sent a **screen-sized WebP** of each photo (longest edge at most 1920 px, quality 80), not the full-size photo (a composed JPEG of a megabyte or more, a try-on PNG of several). `lib/submissions/screen-picture.ts` makes it once when a photo becomes public, after the answer, and stores it as `screen-pictures/<submission id>.webp` (one-year cache) with its address in `Submission.screenImageUrl`.

- **Check one:** the photo's document has `screenImageUrl`; the playlist answer (`/api/slideshows/<id>/playlist`) shows it as the slide's `imageUrl`. A photo without one is sent as before.
- **Failure:** a warning `screen_picture.failed` in the Vercel logs (the photo is unaffected; the screen keeps the original). It is made again by the backfill below.
- **Existing photos, from the admin (owner answers 211 b and 219 b: all photos on the slideshow events):** the card **Screen-sized pictures** on the **Slideshows** page (global admins) shows how many photos still lack one and has the button **Make the screen pictures**: it works in batches of 24 on the server (`POST /api/admin/screen-pictures/backfill`, which uses the server's own Blob credentials, so nobody needs a token), shows the progress, can be stopped and pressed again, and a photo that cannot be made (a dead old link) is passed over once. It only adds the picture and its fields; nothing is deleted or changed.
- **Existing photos, from a terminal (needs the owner's go):** `npx tsx scripts/backfill-screen-pictures.ts` is a **dry run** (counts per event, writes nothing; `--measure=12` downloads 12 samples to measure the saving; `--event=<uuid>` for one event). `--apply --event=<uuid> [--limit=200]` makes them (needs `BLOB_READ_WRITE_TOKEN`; three at a time; safe to repeat, a photo that has one is skipped). It only adds `screenImageUrl` (and `screenImageBytes`, `metadata.screenWidth/Height`) and new files under `screen-pictures/`; no original is touched, nothing is deleted. First dry run (2026-10-09): 352 photos on 10 slideshow events, 157.6 MB stored; 12 measured samples 8.1 MB to 1.1 MB (14 %); MTK x Vasas has 23 photos (11.2 MB), MTK x ETO 5 (2.3 MB).
- **Undo:** unset `screenImageUrl` on the photos (the playlist then sends the original again) and delete the `screen-pictures/` files if you want the space back.
- **Not covered:** try-on results (made by another path) keep the full-size picture for now.

## Activity log and its weekly CSV (issue 517; owner 2026-10-09)

"Log activities, error feedbacks, who did and when. Weekly send it as csv to moldovancsaba@gmail.com so we have archived, and keep for a week then delete when the next you send out."

- **What is recorded (`lib/activity/log.ts`):** a record for **every change the people who manage the service make** (a request that changes something on a management path: `/api/admin/*`, events, partners, slideshows, layouts, frames, images, logos, landing pages, hashtags, try-on, answered ok, by a signed-in person) and for **every refused (4xx) or failed (5xx) request**, by anybody. Page views, the photos guests take and the beacons the screens and phones send are not activities (the analytics of issue 521 are for those). A record holds: when, who (the account's id, e-mail and role; empty for an anonymous failure), the method, the path with only its ids (`id`, `eventId`, `slug`, `slideshowId`), the status, the outcome (`ok`, `refused`, `error`) and, for a failure, the reason the answer gave (300 characters at most). **Never** a request body, an IP address, a device or anything a guest typed; for a crash the answer's words ("Internal server error"), never the stack. The same failure of the same person on the same path is written once a minute.
- **Coverage is guarded:** every route on a management path must use `withErrorHandler` (`lib/activity/coverage.test.ts` fails otherwise; the playlist and next-candidate routes of the screens are the two public exceptions). The slideshow editor's save, layouts, frames, logos and the users' role, status and merge routes were found outside it on 2026-10-09 and are wrapped now.
- **How:** `withErrorHandler` hands every answer to `observeApiRequest` (`lib/activity/observe.ts`), which writes after the answer was sent and never fails a request. It writes **only on the production deployment** (`VERCEL_ENV=production`; `ACTIVITY_LOG=1` turns it on elsewhere, `0` off) because a preview or a local run uses the same database. Collection `activity_log` (index on `at`).
- **The weekly mail:** `vercel.json` has a cron, **Mondays 06:00 UTC**, calling `GET /api/internal/activity-export` (`lib/activity/export.ts`): the records written since the previous export are mailed as one CSV attachment (`when, who, user id, role, method, path, status, outcome, message`; a message that starts with `=`, `+`, `-` or `@` is defused so a spreadsheet never reads it as a formula) to `ACTIVITY_EXPORT_TO` (default **moldovancsaba@gmail.com**) through Resend; a row in `activity_exports` records the period; **only after the mail went**, the records the **previous** export carried are deleted. So a record is mailed before it is ever deleted and is kept one to two weeks. A week with no records is still mailed (an empty CSV), so the owner knows it ran. A mail that fails writes and deletes nothing: the next run covers the same period again (and the answer is 502, in the Vercel log).
- **Owner step, once: set `CRON_SECRET` on project `04_camera`** (`openssl rand -hex 32 | npx --yes vercel@latest env add CRON_SECRET production --scope narimato`, then redeploy): Vercel then sends `Authorization: Bearer <CRON_SECRET>` to the cron, and only to the production deployment. Without it the route answers 403 (fail closed, a warning in the log) and nothing is mailed. The same variable brings the try-on cron back (see Scheduled jobs).
- **Admin:** **Settings > Activity log** (global admins): records waiting for the next mail, records kept, the last mail, the address, and **Send now** (`POST /api/admin/activity-log`: the same export at once; the first one before the match on 16 October does not have to wait for Monday or for `CRON_SECRET`).
- **Privacy:** the log names the people who manage the service (their e-mail and role) and what they did, and holds nothing about a guest beyond an anonymous failure; the CSV goes to the owner's own address. Tell the people who manage the service that their actions are logged.

## Scheduled jobs and workers

**Vercel Cron: the weekly activity export (issue 517)** is the one cron in `vercel.json` (Mondays 06:00 UTC; it needs `CRON_SECRET`, see "Activity log and its weekly CSV").

**Vercel Cron: try-on completion backstop (paused since v12.3.40).** The job that
used to live in `vercel.json` called
`GET /api/internal/tryon/sync?status=done&limit=50` every 5 minutes. The owner
paused try-on on 2026-09-30 (local worker stopped, `tryOn.enabled` off on every
event), and `CRON_SECRET` was never set on project `04_camera`, so every run got a
403 (about 288 a day) and synced nothing. The cron entry is therefore removed.
The route itself is unchanged and still works when called with the service
secret.

- **To bring it back.** (1) Set `CRON_SECRET` on project `04_camera`
  (`openssl rand -hex 32 | npx --yes vercel@latest env add CRON_SECRET production --scope narimato`);
  (2) restore this block in `vercel.json`:
  `{"crons":[{"path":"/api/internal/tryon/sync?status=done&limit=50","schedule":"*/5 * * * *"}]}`;
  (3) deploy. Vercel then sends `Authorization: Bearer <CRON_SECRET>` and only runs
  crons against the production deployment.
- **Auth when it is on.** The route compares the bearer in constant time and fails
  closed: with `CRON_SECRET` unset every call gets a generic 403
  (`{"success":false,"error":"Forbidden"}`) and logs
  `[internal-auth] try-on sync cron: CRON_SECRET is not configured` as a warning.
- **What it does when enabled.** It applies completion only for `done` jobs that
  have a stored `result.publicResultUrl` but no completion marker: no derived
  `submissions` doc with `sourceJobId` = the job id, and no `remove` event in
  `tryon_moderation_events` (`lib/tryon/sync.ts`). At most `limit` unapplied jobs
  per run; a run with nothing new writes nothing. Before v12.3.39 it re-applied
  the newest 50 jobs on every run (new uploads, frames stacked on framed
  results), which is why the secret had to wait for that fix.
- **Manual run.** `POST /api/internal/tryon/sync` with header
  `x-camera-tryon-secret: <CAMERA_TRYON_INTERNAL_SECRET>` and body
  `{"limit": 25}`, or `?jobId=job_<yyyyMMddHHmmss>_<8 hex>` for one job (any
  other id shape is a 400). In the response, `outcomes.scanned` counts the
  jobs attempted and `outcomes.skipped` the ones that were already applied. To
  re-apply an already-applied job on purpose, use
  `POST /api/admin/tryon-jobs/[jobId]/reapply-result` from an admin session.

**Workers.** Camera runs no worker process. The try-on queue (`tryon_jobs`) is
processed by the Python worker in the try-on repo
(`scripts/tryon_queue_worker.py`, configured by that repo's
`.env.tryon-worker.example`), which reports back through
`POST /api/internal/tryon/complete`; that service is paused by the owner as of
2026-09-29. The TypeScript worker that used to live here (`npm run tryon:worker`)
was removed in v12.3.39: it claimed jobs with no target filter, so starting it
would have raced the Python worker, and it wrote Mongo directly instead of
going through the completion webhook.
