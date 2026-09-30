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
`go.messmass.com`, `fff.messmass.com`.

`main` has a GitHub branch protection rule requiring a pull request (0
approvals) and the `Verify` status check (`.github/workflows/ci.yml`), but it is
not enforced for admins (`enforce_admins: false`), so direct pushes to `main`
bypass it — and Vercel deploys them regardless of CI.

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

## Scheduled jobs and workers

**Vercel Cron: try-on completion backstop.** `vercel.json` schedules
`GET /api/internal/tryon/sync?status=done&limit=50` every 5 minutes
(`*/5 * * * *`); Vercel runs crons against the production deployment only.

- **Auth.** Vercel sends `Authorization: Bearer <CRON_SECRET>`. The route
  compares it in constant time and fails closed: with `CRON_SECRET` unset every
  cron call gets a generic 403 (`{"success":false,"error":"Forbidden"}`) and
  logs `[internal-auth] try-on sync cron: CRON_SECRET is not configured` as a
  warning.
- **Current state: disabled.** `CRON_SECRET` is not set on project `04_camera`
  (Vercel env names checked 2026-09-29), so the job 403s about 288 times a day
  and nothing syncs. Whether to set it, or to drop the cron from `vercel.json`
  while try-on is paused, is an open owner decision. Check with
  `npx vercel@latest env ls production --scope narimato` (names only).
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
