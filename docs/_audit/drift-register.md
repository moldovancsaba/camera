# camera drift register — fleet audit P3, first edition

Generated 2026-08-19 against HEAD `9dff0ae` (audit at code `97c1f67`) by the
fleet documentation audit (camera#118; method in messmass#344). Every claim
carries file:line evidence. Verdicts: WRONG / STALE / MISSING / CURRENT.

## 0. Behavior findings escalated out of the docs audit (see camera#119)
- **`GET /api/internal/tryon/sync` trusts a spoofable header**: when
  `x-camera-tryon-secret` is absent the only gate is `x-vercel-cron: 1`
  (app/api/internal/tryon/sync/route.ts:44-46), which any caller can set —
  an unauthenticated public trigger for job→submission materialization.
- **`PATCH /api/submissions/[submissionId]` is effectively unauthenticated**:
  `await optionalAuth(request)` result is discarded
  (app/api/submissions/[submissionId]/route.ts:149); anyone with a submission
  ObjectId can write `userInfo.name`/`userInfo.email` and finalize.
- **Session cookies are neither encrypted nor signed** despite
  lib/auth/session.ts:5 claiming "encrypted": the cookie holds plain
  `JSON.stringify(session)` (:170), including access+refresh tokens in
  cookie-only mode. `SESSION_SECRET` is used only for OAuth-state HMAC.
- **`POST /api/upload-logo`** is `requireAuth` only — any `appRole:'user'`
  can upload, while the sibling `POST /api/logos` is `requireAdmin`.
- **`GET /api/migrate/submissions`** runs a destructive `updateMany` behind
  only the production guard (reachable on any non-prod deploy);
  `GET /api/debug/users` dumps user emails/names, production-guard only.
- Sync-route bug: `?jobId=` path is dead — it requires `ObjectId.isValid()`
  (sync/route.ts:75-79) but job ids are `job_<stamp>_<hex>` (lib/tryon/hash.ts:25-28),
  never valid ObjectIds, so single-job sync always 400s.

## 1. WRONG (highest priority)
- **W1/W2 "Camera never calls out"**: docs/MESSMASS_FANMASS_INTEGRATION.md:20,141-143
  and README.md:262-263 claim camera is inbound-only. False:
  lib/messmassClient.ts:43 (`POST {MESSMASS_BASE_URL}/api/integrations/camera/sso-session`)
  and :71 (`/partners`), called from app/api/auth/callback/route.ts:44 and
  app/api/partners/route.ts:136, [partnerId]/route.ts:123.
- **W3 proxy appAccess**: docs/AUTHORIZATION.md:117-121 says proxy.ts rejects
  when `appAccess===false`; proxy.ts:89-97 + lib/auth/middleware-session-gate.ts:26-56
  read only `expiresAt`/`sid`. ARCHITECTURE.md:167-173 documents it correctly —
  the two canonical docs contradict each other.
- **W4** internal-route count: doc says 6 routes / 2 GETs; there are 3 GETs and
  5 POSTs across 7 files. Rate-limit values (120/60) are correct.
- **W5** `.env.example:66` points at `middleware.ts` — renamed to proxy.ts (Next 16).
- **W6 branching policy**: docs/BRANCHING.md:27,36 (echoed README.md:146-150,
  ARCHITECTURE.md:359-361, HANDOVER.md:11-16) say "only main/preview/dev";
  `git branch -a` shows 34 refs and neither `dev` nor `preview` exists.
- **W7** docs/DOCUMENTATION.md:130 cites `.github/workflows/gds-release-gate.yml`;
  no `.github/` exists (README.md:210 correctly says workflows were removed).
- **W8** lib/tryon/completion.ts:244 error says "direct i.ibb.co" but the
  validator it guards (lib/imgbb/url.ts:11-27) accepts any `*.ibb.co`.

## 2. STALE
- Version headers frozen fleet-behind: README/ARCHITECTURE/TECH_STACK :3 = 2.17.0,
  AUTHORIZATION/TRYON_*/MONGODB_CONVENTIONS/SLIDESHOW/EVENT_EXPORTS = 2.16.0,
  MESSMASS_FANMASS_INTEGRATION = 2.18.0; package.json = 2.26.0.
  docs/DOCUMENTATION.md:102 mandates headers match package.json — the canonical
  set violates it. HANDOVER.md:3 = 2.23.0 (3 releases behind).
- HANDOVER.md:31-34 "GDS 4.1.3→6.0.0"; package.json pins 6.2.0.
- README.md:219 / gds-adoption.json:3 "3.9.0 alignment"; runtime GDS is 6.2.0
  (only gds-compliance/eslint-config remain ^3.9.0).
- docs/DOCUMENTATION.md:131 "12/12 E2E tests"; 23 across 7 spec files
  (self-corrected 1 line later at :132).
- lib/db/schemas.ts:67 "Future: partner data will sync via external API" — shipped.
- docs/TRYON_ARCHITECTURE.md:53-58 lists `category` on leather_suits; replaced by
  `garmentType`/`sleeveStyle` (v2.25.0/2.26.0).

## 3. MISSING
- `POST /api/internal/messmass/sso-session` (mints a camera session from a
  forwarded SSO token, the most security-sensitive internal route) absent from
  docs/MESSMASS_FANMASS_INTEGRATION.md.
- `MESSMASS_BASE_URL` absent from that doc's env table (present in .env.example:61).
- .env.example omits `TRYON_SETUP_SELECTION_SECRET`, all `TRYON_*` worker vars,
  `SSO_MONGODB_URI`, `SSO_CAMERA_CLIENT_ID`, and several URL vars.
- ARCHITECTURE.md:263-278 "Main collections" omits organizations, tryon_setups,
  camera_setup_preferences, tryon_worker_heartbeats, tryon_moderation_events,
  landing_page_css_presets.
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
- Contradicting comments: session.ts:5 ("encrypted"), :8 ("extends on each
  request" — getSession never touches cookies), :9 ("automatic token refresh" —
  refreshAccessToken has zero callers), middleware.ts:104-114 (JSDoc for a
  function that doesn't exist), :36/:60 (`@param request` on functions that
  `void request`), completion.ts:244 (see W8), messmassClient.ts:8-11 (claims a
  `source!=='messmass'` guard that exists only on the update path).

## 6. Obsoletion queue
- Root one-offs: check-submissions.mjs, migrate.js, migrate.mjs,
  reset-playcounts.js — zero references.
- `refreshAccessToken` (lib/auth/sso.ts:293-324) — zero callers.
- `GET /api/migrate/submissions`, `/api/test-db`, `/api/test-frames`,
  `/api/debug/{users,event-logos,submissions}` — prod-guarded leftovers.
- `app/admin/tryon-results` + `tryon-suits` pages are re-exported by
  `app/admin/tryon/{vetting,suits}` — two live URLs per surface; legacy links
  remain at identity/analytics pages.
- WARP.DEV_AI_CONVERSATION.md.backup — committed backup file.
- `.claude/worktrees/imgbb-image-loading-b7e1ca/` — 59 MB full duplicate checkout,
  untracked but not gitignored (a stray `git add -A` would commit it); also
  poisons repo-wide greps.
- Stale planning docs: docs/GDS_3_4_3_*, GDS_3_5_ADOPTION_PLAN, ISSUE_AUDIT_2026-06-30,
  NEXT_AGENT_PROMPT, PLAN_SLIDESHOW_LAYOUT, TRYON_VETTING_WORKFLOW_PLAN.
- Dead env: SSO_REDIRECT_URI (sso.ts:6 says unused), FFF_HOSTNAMES /
  NEXT_PUBLIC_FFF_ORIGIN / FFF_SHARE_LINK_SECRET (zero readers; DOCUMENTATION.md:66
  says FunFitFan was removed).
- lib/tryon/env.ts:51 hardcodes `/Users/Shared/Projects/try-on/queue` as the
  shipped default queueRoot.
