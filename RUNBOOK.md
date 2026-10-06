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

## Full-frame originals (camera#210)

The camera records the whole image and the fan frames it afterwards; the pure original is stored
with the submission next to the framed photo.

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
  `{partner1}` (home team) and `{partner2}` (visitor) only; `{ reset: true }` restores the five default messages.
  The default list follows the code until an event edits it.
- **Checks:** `GET /api/admin/events/<id>/frame-design` as an admin shows the snapshot; `source` tells whether it
  came from messmass; `context.style.resolvedFrom` tells which messmass level the theme came from.

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

## Scheduled jobs and workers

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
