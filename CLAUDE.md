# CLAUDE.md — Standing Operating Rules

These are STANDING rules for any AI coding agent working in this repo. They apply to
every task regardless of who asks or how it's phrased. When a task conflicts with
them, the rules win — say so explicitly rather than silently overriding one.

This repo already has a rich set of docs (`ARCHITECTURE.md`, `RUNBOOK.md`,
`TECH_STACK.md`, `NAMING_GUIDE.md`, `LEARNINGS.md`, `HANDOVER.md`). This file is the
operating-rules layer on top of them — read it first, then the relevant doc for
context on the area you're touching.

## 0. Read first, never guess

Before stating a fact about this repo's structure, auth flow, data model, or
behavior: read the actual file or run the actual command. Do not answer from memory
on anything structural. Cite the file(s) you relied on when it matters.

Report only what a tool actually returned. Never fabricate or extrapolate a result
you didn't observe — if you can't verify something, say so plainly instead of
guessing.

## 1. AI-assistant branding ban (non-negotiable)

The agent doing the work is internal tooling, not a feature, co-author, or brand.
Never surface it anywhere the codebase or its history is visible.

- **Commits:** no `Co-Authored-By: <assistant>` trailer, no session-link trailer, no
  model name in the subject or body. Describe the change and its reasoning only.
- **Branches:** never create/push a branch prefixed with the assistant's name (e.g.
  `claude/...`). Use plain names: `feature/...`, `fix/...`, `chore/...`.
  Known limitation: some harnesses assign a branded starting branch automatically —
  that can't be renamed after the fact. Mitigation: don't build further commits on
  it; start a fresh plainly-named branch for the actual work instead.
- **PRs / docs / code / UI copy / API responses:** neutral terms only. Never a
  specific product or model name.
- **Retroactive:** if AI branding turns up in tracked files or reachable history
  during unrelated work, fix it as part of that work, or flag it if genuinely out
  of scope.
- **The one exception:** honest self-disclosure when a human directly asks "are you
  an AI" / "which model is this." Where something can't be changed from inside the
  repo (e.g. a git identity baked into the environment's committer config), say so
  plainly rather than pretending it's fully solved.

## 2. Zero-tolerance quality gate before anything reaches `main`

**This repo currently has no GitHub Actions CI workflow** (`.github/workflows/` is
empty) — the only automated gate on a PR today is Vercel's own build step, which
only catches build failures, not lint or type errors. That means local discipline
is the actual gate; treat it as non-optional rather than assuming a red PR check
will catch a mistake, because none currently will.

Before every push, run: `npx tsc --noEmit` and `npm run lint`
(`eslint .`, effectively zero-warning in practice) at minimum; `npm run build` for
anything touching routing, config, or provider setup. For anything touching the
GDS-adopted surface (`app/admin`, `components/gds`) or dev-only routes, run the full
`npm run release:check` chain (`gds:validate-manifest` → `gds:check` +
`scripts/check-gds-boundaries.mjs` → `type-check` → `lint` →
`verify:production-guards` → `build`) — it's the closest thing this repo has to a
real release gate and it's cheap to run.

Fix failures at the source; never suppress a lint rule, skip a test, or silence a
warning to get green. If a clean run genuinely isn't achievable, stop and say so
rather than pushing anyway.

**Two boundary rules enforced by `scripts/check-gds-boundaries.mjs`:** no direct
`@mantine/core` imports in `app/admin` or `components/gds` (allowlist:
`components/gds/styles.ts`, `components/gds/PublicPrimitives.tsx`) — compose the
shipped `@sovereignsquad/gds-*` components instead. **`verify-production-guards.ts`**
statically requires every dev-only/dangerous route handler to call
`blockDangerousApiInProduction()` — a new dev-only route must be added to that
script's route list as part of its definition of done, or the guard doesn't know to
check it.

## 3. Git workflow actually used in this repo

- A merged PR is finished. Never stack new commits on an already-merged branch —
  start a fresh branch from the current `main` for follow-up work, even if it
  reuses the same name.
- Before any push, self-check: type-check + lint (+ build/release:check when
  relevant) clean, no scratch/debug files staged, no AI branding per §1.
- Open a PR, verify Vercel's deployment succeeded (there's no separate CI check to
  wait on — see §2), then merge directly. Don't leave a green PR sitting unmerged
  waiting for a human unless explicitly told to.
- Clean up local test infrastructure (dev servers, scratch scripts) before
  considering a task done.

## 4. This repo's role in the shared SSO ecosystem

camera, messmass, fanmass, and launchmass all authenticate against a single OIDC
provider at `sso.doneisbetter.com`. Tribal knowledge worth knowing before touching
any auth code here:

- **Login is SSO-only**, and the homepage (`app/page.tsx`) doesn't render its own
  login screen either — an unauthenticated visit with nothing to explain
  server-redirects straight to `/api/auth/login` → SSO's hosted login page.
  Exception: right after logout (`?logout=success`), the homepage renders normally
  instead of auto-redirecting, so the user actually lands somewhere visible rather
  than bouncing straight back into SSO. Don't remove that exception without
  understanding why it's there (it's the fix for logout looking like it does
  nothing).
- **SSO has no RP-Initiated Logout / `end_session_endpoint`.** Confirmed against
  `https://sso.doneisbetter.com/.well-known/openid-configuration` — only
  `authorize`, `token`, `userinfo`, `revoke`, `introspect`, `jwks_uri` are exposed.
  This app's logout (`app/api/auth/logout/route.ts`) already does the right thing:
  revokes both `session.accessToken` and `session.refreshToken` at SSO
  (`lib/auth/sso.ts` `revokeToken()`, best-effort) before clearing the local
  session. It also passes `prompt=login` on the next login (`from_logout=true` →
  `app/api/auth/login/route.ts`), so SSO shows its real login screen instead of
  silently re-approving a still-live SSO browser session — this is the reference
  implementation messmass's equivalent logout flow was built to match.
- **`revokeToken()` (`lib/auth/sso.ts`) has no fetch timeout.** If SSO's revoke
  endpoint hangs, this call currently can too — bound it with
  `signal: AbortSignal.timeout(...)` if this ever becomes a real issue (messmass's
  equivalent already does this).
- **Session tokens live in the session itself.** `Session` (`lib/auth/session.ts`)
  stores `accessToken`/`refreshToken` directly (either in the `camera_session`
  cookie or, if `shouldUseMongoWebSessions()`, a Mongo-backed session document) —
  unlike messmass, which originally discarded them after the OAuth callback and had
  to add a separate cookie to keep them around for revocation.
- **`SESSION_COOKIE_DOMAIN`** is opt-in (`lib/auth/session.ts` `sessionCookieDomain()`)
  — unset by default, meaning the session cookie is host-only unless an operator
  explicitly sets it to `.messmass.com`. Don't assume it's shared-domain scoped
  without checking the actual deployment env.

## 5. Local dev-server / testing gotchas (verified this session)

- Reaching an *external* host from Playwright's Chromium (anything not
  `localhost`/`127.0.0.1`) needs the proxy passed explicitly —
  `chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } })` — `curl` picks
  up `HTTPS_PROXY` automatically but Chromium does not.
- Vercel preview deployments sit behind Vercel's own deployment-protection SSO gate
  by default (`vercel.com/sso-api` redirect) — a `net::ERR_CONNECTION_RESET` or a
  `302` to `vercel.com/sso-api` when hitting a preview URL is that gate, not an app
  bug. Don't spend time debugging it as one.

## 6. Documentation

Update the relevant existing doc (`ARCHITECTURE.md` for structural changes,
`RUNBOOK.md` for operational changes, `LEARNINGS.md` for gotchas worth remembering)
and this file in the same change set whenever the behavior or workflow they
describe changes.
