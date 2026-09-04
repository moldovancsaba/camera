# Operations Runbook

## Branching model

Single long-lived branch `main` (production), plus short-lived per-task branches
(`feature/*`, `fix/*`, `chore/*`, `dependabot/*`, …) merged in via PR and then
deleted; no `dev`/`preview` branch exists. Deploy from `main`. Full policy in
[docs/BRANCHING.md](docs/BRANCHING.md).

## Deploying to production

**Important:** pushing to `main` on GitHub does **not** auto-deploy. As of 2026-06,
the Vercel project `narimato/04_camera` is not receiving GitHub push events, so
every release must be shipped manually from a clean checkout of `main`:

```bash
cd <path-to-your-camera-checkout>
git checkout main && git pull
npx vercel@latest --prod
```

This builds on Vercel with the project's production env vars and promotes the
build to all production domains: `camera.messmass.com`, `go.messmass.com`,
`fff.messmass.com`.

### Verify after deploy

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://camera.messmass.com/            # expect 200
curl -s -o /dev/null -w "%{http_code}\n" https://camera.messmass.com/admin/events # expect 307 -> SSO
npx vercel@latest inspect <deployment-url> | grep -i alias                        # confirm camera.messmass.com is bound
```

Admin pages require SSO and 307-redirect to `/api/auth/login` when
unauthenticated — that redirect (not a 500 / "Oops") is the healthy signal.

## Fixing auto-deploy (so `git push` deploys again)

The project-level Git link exists (`vercel git connect` reports
`moldovancsaba/camera` connected), but no git-triggered deployments are firing.
To restore automatic deploys:

1. **GitHub** → Settings → Applications → Installed GitHub Apps → **Vercel** →
   Configure → ensure **`moldovancsaba/camera`** is in the repo access list.
2. **Vercel** → project **04_camera** → Settings → Git → confirm the connected
   repo and **Production Branch = `main`**; ensure deploys are not paused and
   there is no blocking **Ignored Build Step**.
3. Push a commit (or Redeploy from the dashboard) and confirm a new deployment
   appears.

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
npm audit            # 3 known dev-only/unfixable-without-downgrade advisories as of 2026-06
```
