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

As of 2026-09-28 GitHub Dependabot shows 2 critical, 5 high and 3 medium open
alerts (`next` ×2 critical; high: `@tiptap/core`, `browserslist`, `js-yaml`,
`postcss`, `sharp`; medium: `@tiptap/core`, `baseline-browser-mapping`,
`postcss`). The Dependabot PRs had been failing CI on inventory drift since
`386d3fe`; that was fixed in 12.3.37 (`ccd77d5`) and the rebased PRs pass CI.
