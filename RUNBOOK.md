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
