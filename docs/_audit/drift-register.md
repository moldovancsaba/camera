# camera drift register — fleet audit P3, first edition

Generated 2026-08-19 against HEAD `9dff0ae` (audit at code `97c1f67`) by the
fleet documentation audit (camera#118; method in messmass#344). Every claim
carries file:line evidence. Verdicts: WRONG / STALE / MISSING / CURRENT.

Contract-first enforcement live since 2026-09-08 (messmass#355):
`npm run inventory:check` (scripts/fleet-audit-inventory.py --check) runs in
`.github/workflows/ci.yml`; the rule text is in `contract-first-rule.md`.
Route-level reference: `api-reference.md` (camera#124, 99 of 99 routes with
the guard actually called, request/response shape, side effects, and a
zero-caller deprecation list).

## 0. Behavior findings escalated out of the docs audit (see camera#119)
- ~~**`GET /api/internal/tryon/sync` trusts a spoofable header**~~ RESOLVED
  (2f0c088): the `x-vercel-cron` branch is gone; GET requires either
  `x-camera-tryon-secret` or `Authorization: Bearer <CRON_SECRET>` and fails
  closed when `CRON_SECRET` is unset (sync/route.ts:42-56). Regression tests:
  app/api/internal/tryon/sync/route.test.ts (spoofed header 403, no headers
  403, unset secret 403, valid Bearer passes). `CRON_SECRET` documented in
  .env.example (12.2.22).
- ~~**`PATCH /api/submissions/[submissionId]` is effectively unauthenticated**~~
  RESOLVED (2f0c088): the public FIRST write is preserved; once
  `userInfo.collectedAt` is set, only an admin `appRole` may change it
  (route.ts:158-171). Regression tests:
  app/api/submissions/[submissionId]/route.test.ts (anon first write 200,
  finalized+anon 403 with no write, finalized+admin 200).
- ~~**Session cookies are neither encrypted nor signed** despite
  lib/auth/session.ts:5 claiming "encrypted": the cookie holds plain
  `JSON.stringify(session)` (:170), including access+refresh tokens in
  cookie-only mode. `SESSION_SECRET` is used only for OAuth-state HMAC.~~
  FIXED 2026-09-08 (v12.2.22, camera#122): the plain cookie is HMAC-signed
  (lib/auth/session-signing.ts) and unsigned/tampered cookies are rejected —
  the unsigned form was a forgeable admin session. Production normally uses the
  Mongo pointer cookie. Not encrypted, by decision: contents stay readable to
  the holder; confidentiality is HttpOnly + Secure + TLS (docs/AUTHORIZATION.md §13).
- **`POST /api/upload-logo`** is `requireAuth` only — any `appRole:'user'`
  can upload, while the sibling `POST /api/logos` is `requireAdmin`.
- ~~**`GET /api/migrate/submissions`** runs a destructive `updateMany` behind
  only the production guard (reachable on any non-prod deploy);
  `GET /api/debug/users` dumps user emails/names, production-guard only.~~
  REMOVED (070058e, camera#125): `app/api/migrate/` and `app/api/debug/` no
  longer exist.
- Sync-route bug: `?jobId=` path is dead — it requires `ObjectId.isValid()`
  (sync/route.ts:75-79) but job ids are `job_<stamp>_<hex>` (lib/tryon/hash.ts:25-28),
  never valid ObjectIds, so single-job sync always 400s.

## 1. WRONG (highest priority)
- ~~**W1/W2 "Camera never calls out"**: docs/MESSMASS_FANMASS_INTEGRATION.md:20,141-143
  and README.md:262-263 claim camera is inbound-only. False:
  lib/messmassClient.ts:43 (`POST {MESSMASS_BASE_URL}/api/integrations/camera/sso-session`)
  and :71 (`/partners`), called from app/api/auth/callback/route.ts:44 and
  app/api/partners/route.ts:136, [partnerId]/route.ts:123.~~ FIXED (v12.2.21):
  docs/MESSMASS_FANMASS_INTEGRATION.md intro + §4 and README "Fleet
  integrations" describe both outbound calls.
- ~~**W3 proxy appAccess**: docs/AUTHORIZATION.md:117-121 says proxy.ts rejects
  when `appAccess===false`; proxy.ts:89-97 + lib/auth/middleware-session-gate.ts:26-56
  read only `expiresAt`/`sid`. ARCHITECTURE.md:167-173 documents it correctly —
  the two canonical docs contradict each other.~~ FIXED (v12.2.21):
  docs/AUTHORIZATION.md §6 "Middleware" now says the proxy does not check
  `appAccess`.
- ~~**W4** internal-route count: doc says 6 routes / 2 GETs; there are 3 GETs and
  5 POSTs across 7 files. Rate-limit values (120/60) are correct.~~ FIXED
  (v12.2.21): docs/MESSMASS_FANMASS_INTEGRATION.md §5 lists 3 GET + 5 POST.
- **W5** `.env.example:99` points at `middleware.ts` — renamed to proxy.ts (Next 16).
- ~~**W6 branching policy**: docs/BRANCHING.md:27,36 (echoed README.md:146-150,
  ARCHITECTURE.md:359-361, HANDOVER.md:11-16) say "only main/preview/dev";
  `git branch -a` shows 34 refs and neither `dev` nor `preview` exists.~~ FIXED
  (v12.2.21): docs/BRANCHING.md and its echoes describe single-`main` practice.
- **W7** (premise corrected 2026-09-28): `.github/` does exist again —
  `.github/workflows/ci.yml` since v12.2.2 — so "no `.github/`" is false. The
  nonexistent `.github/workflows/gds-release-gate.yml` is cited in
  docs/DOCUMENTATION.md's dated 2026-06-07 note (history, superseded by its
  2026-09-03 note) and was cited as current in docs/GDS_CAMERA_ADOPTION.md:32,
  which the 2026-09-28 docs pass (12.3.37) points at `ci.yml`.
- ~~**W8** lib/tryon/completion.ts:244 error says "direct i.ibb.co" but the
  validator it guards (lib/imgbb/url.ts:11-27) accepts any `*.ibb.co`.~~
  RESOLVED (12.2.22, camera#126): the message now names both accepted host
  families (`*.ibb.co` direct hosts and `*.public.blob.vercel-storage.com`)
  and points at `normalizeImgbbDirectUrl`.

## 2. STALE
- ~~Version headers frozen fleet-behind: README/ARCHITECTURE/TECH_STACK :3 = 2.17.0,
  AUTHORIZATION/TRYON_*/MONGODB_CONVENTIONS/SLIDESHOW/EVENT_EXPORTS = 2.16.0,
  MESSMASS_FANMASS_INTEGRATION = 2.18.0; package.json = 2.26.0.
  docs/DOCUMENTATION.md:102 mandates headers match package.json — the canonical
  set violates it. HANDOVER.md:3 = 2.23.0 (3 releases behind).~~ Recurred: on
  2026-09-28 ARCHITECTURE/TECH_STACK/HANDOVER :3 said 12.2.22, README,
  EVENT_EXPORTS and TRYON_ARCHITECTURE 12.3.35, the other current docs 12.3.36,
  with package.json at 12.3.37. All current-doc `**Version**:` headers set to
  12.3.37 in the 2026-09-28 docs pass; historical files (LEARNINGS,
  NAMING_GUIDE, CODE_AUDIT) keep their own stamps. Lockstep bumps also
  rewrote past-release references inside docs (e.g. "removed in v12.2.22"
  became "v12.3.35"); those were restored to the original versions — bump only
  header lines, never find-and-replace a version string.
- ~~HANDOVER.md:31-34 "GDS 4.1.3→6.0.0"~~; package.json now pins 6.3.0 (all five
  `@sovereignsquad/gds-*` as `file:vendor/gds/*-6.3.0.tgz`, v12.3.29). HANDOVER
  rewritten 2026-09-28 to say so.
- ~~README.md:219 / gds-adoption.json:3 "3.9.0 alignment"; runtime GDS is 6.2.0
  (only gds-compliance/eslint-config remain ^3.9.0).~~ FIXED (4782fb8, v12.2.1):
  gds-adoption.json:3 `gdsVersion` 6.3.0; README cites the 6.3.0 contracts;
  gds-compliance/eslint-config vendored at 6.3.0 too.
- docs/DOCUMENTATION.md:131 "12/12 E2E tests"; 23 across 7 spec files
  (self-corrected 1 line later at :132).
- lib/db/schemas.ts:108 "Future: partner data will sync via external API" — shipped.
- ~~docs/TRYON_ARCHITECTURE.md:53-58 lists `category` on leather_suits; replaced by
  `garmentType`/`sleeveStyle` (v2.25.0/2.26.0).~~ FIXED: docs/TRYON_ARCHITECTURE.md
  no longer mentions `category` (grep, 2026-09-28).

## 3. MISSING
- ~~`POST /api/internal/messmass/sso-session` (mints a camera session from a
  forwarded SSO token, the most security-sensitive internal route) absent from
  docs/MESSMASS_FANMASS_INTEGRATION.md.~~ FIXED (v12.2.21): documented at the end
  of that doc's §1.
- ~~`MESSMASS_BASE_URL` absent from that doc's env table (present in .env.example:61).~~
  FIXED (v12.2.21): in that doc's §7 env table.
- .env.example omits `TRYON_SETUP_SELECTION_SECRET`, all `TRYON_*` worker vars,
  `SSO_MONGODB_URI`, `SSO_CAMERA_CLIENT_ID`, and several URL vars.
- ~~ARCHITECTURE.md:263-278 "Main collections" omits organizations, tryon_setups,
  camera_setup_preferences, tryon_worker_heartbeats, tryon_moderation_events,
  landing_page_css_presets.~~ FIXED in the 2026-09-28 docs pass (12.3.37):
  ARCHITECTURE.md §8 now matches `COLLECTIONS` in lib/db/schemas.ts:33-54.
- Vercel cron (vercel.json:2-8) and the in-repo worker (npm run tryon:worker,
  writes Mongo directly, skips the webhook) documented nowhere.

## 4. CURRENT (verified, for the record)
- ARCHITECTURE.md:167-173 proxy/appAccess/x-camera-pathname — matches proxy.ts.
- docs/MESSMASS_FANMASS_INTEGRATION.md:94-106 fanmass media contract — matches
  app/api/internal/fanmass/events/[eventId]/media/route.ts:30-54.
- docs/TRYON_ARCHITECTURE.md:47-49 rerun re-moderation — matches
  lib/tryon/completion.ts:68-70,261-263.

## 5. Comment health
- Two conventions layered: legacy JSDoc on older modules, WHAT/WHY decision-log
  on newer/hard-won code (proxy.ts, session, callbacks) — the latter is high value.
- Zero TODO/FIXME/HACK; effectively zero commented-out code.
- Contradicting comments: ~~session.ts:5 ("encrypted"), :8 ("extends on each
  request" — getSession never touches cookies), :9 ("automatic token refresh" —
  refreshAccessToken has zero callers)~~ FIXED (camera#122/#126: the header now
  says "not encrypted", "getSession does NOT extend it", and no longer claims
  token refresh); the remaining session.ts:4 "30-day sliding expiration" vs
  :13-14 "fixed at creation … no sliding refresh" contradiction was fixed in the
  2026-09-28 docs pass (comment now says fixed 30-day expiration).
  Still open: lib/api/middleware.ts:104-114 (JSDoc for a
  function that doesn't exist), :36/:60 (`@param request` on functions that
  `void request`). ~~completion.ts:244 (see W8)~~ RESOLVED (12.2.22, see W8).
  ~~messmassClient.ts:8-11 (claims a `source!=='messmass'` guard that exists
  only on the update path)~~ RESOLVED (12.2.22, camera#126): the header now
  states that create (app/api/partners/route.ts) pushes unconditionally
  because a camera-created partner has no `source`, and that the
  `source !== 'messmass'` guard lives only on the update path
  (app/api/partners/[partnerId]/route.ts:133).

## 6. Obsoletion queue
- ~~Root one-offs: check-submissions.mjs, migrate.js, migrate.mjs,
  reset-playcounts.js — zero references.~~ REMOVED (070058e, camera#125).
- ~~`refreshAccessToken` (lib/auth/sso.ts:293-324) — zero callers.~~ REMOVED (070058e).
- ~~`GET /api/migrate/submissions`, `/api/test-db`, `/api/test-frames`,
  `/api/debug/{users,event-logos,submissions}` — prod-guarded leftovers.~~
  REMOVED (070058e); api-reference.md no longer lists them.
- ~~`app/admin/tryon-results` + `tryon-suits` pages are re-exported by
  `app/admin/tryon/{vetting,suits}` — two live URLs per surface; legacy links
  remain at identity/analytics pages.~~ RESOLVED (12.2.22, camera#125): the
  implementations now live at `app/admin/tryon/{vetting,suits}/page.tsx`; the
  legacy paths are server components that `redirect()` to the canonical URL
  (query string forwarded), so old bookmarks keep working. Docs that named
  `/admin/tryon-results` (TRYON_ADMIN_GUIDE, TRYON_ARCHITECTURE,
  TRYON_LOW_LEVEL_DESIGN, GDS_CAMERA_ADOPTION) updated.
- ~~WARP.DEV_AI_CONVERSATION.md.backup — committed backup file.~~ REMOVED (070058e).
- ~~`.claude/worktrees/imgbb-image-loading-b7e1ca/` — 59 MB full duplicate checkout,
  untracked but not gitignored (a stray `git add -A` would commit it); also
  poisons repo-wide greps.~~ RESOLVED: `.claude` gitignored in 070058e; the
  directory is no longer present in the checkout (verified 2026-09-08).
- ~~Stale planning docs: docs/GDS_3_4_3_*, GDS_3_5_ADOPTION_PLAN, ISSUE_AUDIT_2026-06-30,
  NEXT_AGENT_PROMPT, PLAN_SLIDESHOW_LAYOUT, TRYON_VETTING_WORKFLOW_PLAN.~~
  REMOVED (12.2.22, camera#125): all seven deleted; the links from README,
  GDS_CAMERA_ADOPTION, ROADMAP and DOCUMENTATION were removed or annotated.
- Dead env: SSO_REDIRECT_URI (sso.ts:6 says unused), FFF_HOSTNAMES /
  NEXT_PUBLIC_FFF_ORIGIN / FFF_SHARE_LINK_SECRET (zero readers; DOCUMENTATION.md:66
  says FunFitFan was removed).
- lib/tryon/env.ts:51 hardcodes `/Users/Shared/Projects/try-on/queue` as the
  shipped default queueRoot.

## 7. New findings (2026-09-28 fleet alignment audit)
- **publish-selfies was not scoped to its event** (FIXED 12.3.37, `ccd77d5`):
  `POST /api/internal/savetheworld/events/[eventId]/publish-selfies` built
  `{ ...eventMatch, $or: [imageClauses] }` where `eventMatch` is itself an
  `$or`, so the second key replaced it and the `updateMany` would have set
  `isShareVisible: true` across every event. Now `$and`-combined in
  lib/savetheworld/publishSelfies.ts (refuses to build without event keys) with
  lib/savetheworld/publishSelfies.test.ts. Never triggered in production
  (aggregate check 2026-09-28: 13 events, 11 with zero visible submissions).
- **Inventory drift kept CI red on `main` from `386d3fe` to `06f3029`** (FIXED
  12.3.37, `ccd77d5`): the publish-selfies route was added without regenerating
  `docs/_audit/*.json`, so `npm run inventory:check` failed on every push and on
  every Dependabot PR. Vercel deployed those commits anyway (it does not wait
  for CI). `docs/_audit/*.json` regenerated and the route added to
  api-reference.md.
- **shareOptIn contract change** (open — consent decision pending): the capture
  share checkbox defaults to checked since `d9488b5` (v12.3.36), where it was an
  explicit unchecked opt-in before; publish-selfies flips an explicit
  `isShareVisible: false` as well as missing values; the pledge wall treats a
  missing `isShareVisible` as visible (505 legacy submissions). The contract
  text in api-reference.md and the code comments in app/api/submissions/route.ts
  and app/api/internal/savetheworld/pledges/route.ts were updated to describe
  current behavior; whether that behavior is intended is an owner decision.
