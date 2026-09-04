# Architecture

**Version**: 12.2.21  
**Last Updated**: 2026-07-04

This document describes the current production architecture of Camera as implemented in the repository today.

## 1. Operating model

Camera is no longer just a flat event-photo tool. The system now behaves as:

- **Camera Core**
  - partners
  - visual resources
  - landing pages
  - galleries / submissions
  - slideshow systems
  - user and access management
- **Apps**
  - Events
  - Try-On App

## 2. Top-level layers

```text
Browser / Public Screens
  -> Next.js App Router pages and client components
  -> API routes / edge middleware
  -> business logic in lib/*
  -> MongoDB Atlas + imgbb + SSO
```

### Browser and page layer

- public capture, share, slideshow, and landing pages
- admin pages under `/admin`
- React client components for camera capture, admin forms, and slideshow playback

### API layer

- Next.js route handlers under `app/api/**`
- root edge proxy in `proxy.ts`
- shared API helpers in `lib/api/*`
- structured error logging in `lib/observability/*` (see §5)

### Domain / business logic

- auth and session management in `lib/auth/*`
- MongoDB access and schema helpers in `lib/db/*`
- slideshow generation in `lib/slideshow/*`
- partner-scoped access helpers in `lib/partners/*`
- try-on queue, moderation, analytics, and identity in `lib/tryon/*`
- transactional email (templates, per-event sender name) in `lib/email/*`
- event export logic in `lib/events/*`

### External services

- MongoDB Atlas
- imgbb
- external SSO service
- Resend (transactional email)
- optional Upstash Redis for shared rate limiting

## 3. Route model

### Public routes

- `/` — plain public landing page, no session logic (v2.19.0, PR #98). Never
  redirects or renders auth state; its only job is a CTA to `/admin/login`.
- `/capture/[eventId]` — event capture flow
- `/capture` — legacy generic capture flow
- `/share/[id]` — public submission share page
- `/slideshow/[slideshowId]` — public slideshow player
- `/slideshow-layout/[layoutId]` — public multi-cell slideshow layout
- `/landing/[slug]` — public landing pages

### Admin routes

- `/admin/login` — the single SSO sign-in entry point (client component;
  see §6). Not wrapped by the admin layout's own auth gate.
- `/admin`
- `/admin/partners/**`
- `/admin/events/**`
- `/admin/tryon/**`
- `/admin/frames/**`
- `/admin/logos/**`
- `/admin/slideshows`
- `/admin/landing-pages/**`
- `/admin/submissions`
- `/admin/users`

## 4. Admin information architecture

The admin UI is now structured around:

1. global operational inventory
2. partner workspaces
3. app surfaces

### Global inventory / superadmin surfaces

- dashboard
- users
- global frames
- global logos
- global galleries

### Partner workspace

Partner detail pages are the primary daily operational surface. They expose:

- partner overview
- partner resources
- partner events
- partner gallery context
- partner user assignments

### App surfaces

- Events inventory and event instance detail
- Try-On App workspace, live queue, garment catalog, and vetting queue

### Cross-cutting admin preferences

The first admin-preferences surface not scoped to a specific partner, event, or app: a top-level
"Settings" nav entry (`/admin/settings/card-display`) reads and writes a single global document
via `GET`/`PATCH /api/admin/settings/card-display`:

```
Admin browser -> GET/PATCH /api/admin/settings/card-display
  -> lib/admin/card-display-settings.ts (getCardDisplaySettings, DEFAULT_CARD_DISPLAY_SETTINGS)
  -> admin_settings collection, single document keyed by settingId:'card-display'
  -> read by every admin session rendering the Vetting/moderation card
```

Global, not per-admin-user -- one admin's change affects what every admin sees. Defaults to all
fields/actions visible; the settings only ever narrow what renders, never add new capability.

### Try-On hard contracts

- Queue processing and moderation are coordinated through `lib/db/schemas.ts`.
- Results from worker completion are intentionally published as `tryon_result` with `reviewStatus = pending_review` unless explicitly configured otherwise by event policy.
- Reruns always create a new job and require fresh human approval before being sent to the user.
- Moderation archive buckets are `approved`, `rejected`, and `service`; `greatest` is a derived approval+great view.
- Failed job states are not included in active queue SLA counts.
- Worker completion endpoint degrades gracefully on unreachable result image URLs; dimensions are stored as null and the result still enters the pending review queue.

## 5. Authorization architecture

Camera uses two layers of authorization.

### Layer A: SSO app access

Source: session cookie hydrated from the SSO callback.

- `session.appRole`
- `session.appAccess`

Purpose:

- determine whether the identity can use Camera at all
- determine whether the identity is a global app admin

### Layer B: partner-scoped app access

Source: `partner_user_access` in Camera MongoDB.

Fields:

- `partnerId`
- `userId` or `userEmail`
- `appKey`: `events`
- `role`: `viewer`, `manager`, `admin`
- `isActive`

Purpose:

- determine which partner workspaces a non-global-admin may access
- determine which app surfaces are visible and writable

### Current enforcement model

- edge middleware (`proxy.ts`) gates `/admin` on session presence/expiry
  only — it deliberately does **not** check `appAccess` there. The `v:2`
  session-pointer cookie caches `appAccess` at login time and never
  refreshes for the life of a 30-day session; gating on that cached value at
  the edge caused a real infinite-reload bug when it went stale relative to
  the live database value (v2.19.0, PR #101). `appAccess` denial is enforced
  once, by the layout below, from a live read.
- admin layout (`app/admin/layout.tsx`) resolves global admin vs
  partner-scoped access from a live `getSession()`/`getAdminNavigationAccess()`
  read, and is the sole place that redirects on `appAccess === false`
- global admins retain bypass
- global inventory pages remain global-admin-only
- partner/app pages enforce partner-scoped access where implemented
- all API routes use withErrorHandler to catch uncaught exceptions and return typed 4xx/5xx responses

Reference:
- [docs/AUTHORIZATION.md](docs/AUTHORIZATION.md)

### Observability

- `lib/observability/logger.ts` emits single-line JSON records
  (`level`/`event`/`message`/`digest`/`stack`/`context`) to stdout/stderr —
  ingestible and alertable by Vercel or any log drain, with no external SDK.
- `withErrorHandler`, `safeAsync`, and `dbOperation` report through it
  (`api.error`, `db.operation_failed`, …) instead of ad-hoc `console.error`.
- The global client error boundary (`app/error.tsx`) beacons crashes to
  `POST /api/observability/client-error`, which re-emits them as server-side
  records keyed by the digest the user sees — so client/RSC render crashes reach
  the same alertable stream. This is the durable follow-up to the v2.14.0
  digest-4053814135 incident, which was invisible until logs were tailed by hand.

## 6. Middleware and routing behavior

Root edge proxy in [proxy.ts](proxy.ts) does three important jobs:

1. gate `/admin` by session presence/expiry (not `appAccess` — see §5); explicitly
   passes `/admin/login` through unchecked, since it's the redirect target and
   does its own session check
2. rescue OAuth callback parameters returned to the wrong path
3. resolve GO short links on `GO_SHORT_HOSTNAMES` to `/api/go-short/[slug]` capture redirects

`/admin/login` (`app/admin/login/page.tsx`) is a client component, not a
Server Component `redirect()`. A Server Component `redirect()` called after
an `await` (e.g. a session read) can only be delivered as an RSC "soft
redirect" digest rather than a real HTTP 3xx; when that digest's target
itself redirects cross-origin (to SSO), the client router doesn't reliably
follow the hop. `/admin/login` instead decides via `fetch('/api/auth/session')`
and navigates with `window.location.replace()` — a genuine top-level
navigation — matching messmass's equivalent page (v2.19.0, PR #100).

`app/admin/layout.tsx` wraps every route under `app/admin/`, `/admin/login`
included — Next.js has no way to exclude one child route from an ancestor
layout. The layout skips its own auth check when the edge-injected
`x-camera-pathname` request header (set by `proxy.ts`'s `passThroughWithPathname`)
is `/admin/login`, since that page already does its own session check and
doesn't want the authenticated `AdminShell` chrome (v2.19.0, PR #99).

## 7. Data architecture

The system uses mixed identifier semantics by design.

### Mongo `_id`

Used for:

- admin page URLs
- many CRUD route parameters
- direct document lookup

Examples:

- `/admin/events/[id]`
- `/admin/partners/[id]`
- `/share/[id]`

### UUID-style business identifiers

Used for:

- event-level matching in submissions and slideshows
- public slideshow and layout URLs
- partner external identity
- frame and logo identifiers

Examples:

- `event.eventId`
- `slideshows.slideshowId`
- `slideshow_layouts.layoutId`
- `partner.partnerId`
- `frame.frameId`

This is intentional. Do not collapse it into a single rule. See [docs/MONGODB_CONVENTIONS.md](docs/MONGODB_CONVENTIONS.md).

## 8. Main collections

Core collections:

- `partners`
- `events`
- `frames`
- `logos`
- `submissions`
- `slideshows`
- `slideshow_layouts`
- `landing_pages`
- `partner_user_access`
- `users_cache`
- `web_sessions`
- `leather_suits`
- `tryon_jobs`
- `admin_settings`

Schema definitions live in [lib/db/schemas.ts](lib/db/schemas.ts).

## 9. Submission pipeline

Primary path:

1. capture page collects image and optional onboarding data
2. client composites photo + frame where required
3. `POST /api/submissions`
4. server uploads raster to imgbb
5. server inserts Mongo submission document
6. share, gallery, and slideshow flows consume that record

Important implementation note:

- the persisted submission shape is leaner and more compatibility-driven than the broad TypeScript interfaces suggest
- consumers still rely on fields like `imageUrl`, `eventId`, `eventIds`, and metadata dimensions

## 10. Slideshow architecture

Public slideshow behavior is driven by:

- `lib/slideshow/playlist.ts`
- `app/api/slideshows/[slideshowId]/playlist/route.ts`
- `components/slideshow/SlideshowPlayerCore.tsx`

Key properties:

- fairness via `playCount`
- aspect-aware single or mosaic slides
- queue-based browser playback
- composite layouts through `slideshow_layouts`

Reference:
- [docs/SLIDESHOW_LOGIC.md](docs/SLIDESHOW_LOGIC.md)

## 11. API surface summary

Major API groups:

- auth: `/api/auth/**`
- partners: `/api/partners/**`
- events: `/api/events/**`
- frames: `/api/frames/**`
- logos: `/api/logos/**`
- submissions: `/api/submissions/**`
- slideshows: `/api/slideshows/**`
- slideshow layouts: `/api/slideshow-layouts/**`
- landing pages: `/api/landing-pages/**`
- admin users/submissions utilities: `/api/admin/**`
- event data exports: `/api/admin/events/[id]/export/emails` and `/api/admin/events/[id]/export/images` (manager-gated; CSV + ZIP, shared logic in `lib/events/event-export.ts`)
- go-short redirects: `/api/go-short/**`
- internal service-to-service: `/api/internal/messmass/**` (messmass provisions organisations/partners/events; messmass is master), `/api/internal/fanmass/**` (fanmass pulls events + media, read-only), `/api/internal/tryon/**` (try-on worker callbacks) — each gated by its own shared secret, not a user session. See [docs/MESSMASS_FANMASS_INTEGRATION.md](docs/MESSMASS_FANMASS_INTEGRATION.md).

The exact route list should be taken from `app/api/**/route.ts`, not from memory.

### Server/Client component boundary (RSC)

Pages are Server Components by default. A Server Component must not pass a component
*function* as a prop to a client component (e.g. `component={Link}` on a Mantine/GDS
`Button`/`Card`) — React Server Components cannot serialize a function across the
server→client boundary and the render throws "Functions cannot be passed directly to
Client Components" in production. In Server Components, use `component="a"` (a string) for
links, or render `<Link><Button/></Link>`. `component={Link}` is valid only inside
`'use client'` files. This class of crash surfaces as the global error boundary
(`app/error.tsx`) with a digest; read the real cause from Vercel runtime logs.

## 12. Deployment and operations

Expected environment shape:

- Next.js app deployed on Vercel (project `narimato/04_camera`, domain `camera.messmass.com`)
- MongoDB Atlas for persistence
- imgbb for raster hosting
- SSO host reachable over HTTPS
- optional Upstash Redis for shared rate limits

Production is currently shipped manually with `npx vercel@latest --prod` (git pushes do not
auto-deploy). Deploy/verify/auto-deploy-repair steps: [RUNBOOK.md](RUNBOOK.md).

**Branching model:** single long-lived branch `main` (production), plus short-lived
per-task branches (`feature/*`, `fix/*`, `chore/*`, `dependabot/*`, …) merged in via
PR and deleted; no `dev`/`preview` branch exists. Full policy in
[docs/BRANCHING.md](docs/BRANCHING.md).

Useful commands:

```bash
npm run type-check
npm run db:verify-uri
npm run db:ensure-indexes
npm run env:verify
```

## 13. Guided tour system

A from-scratch spotlight/backdrop product tour (no vendored GDS or third-party equivalent exists — see `docs/GDS_CAMERA_ADOPTION.md` "Approved exceptions"), shared by the admin panel and the public capture flow via one engine.

- `lib/tour/useTourController.ts` — step-sequencing hook: `start`/`next`/`back`/`skip`, registers with the root `OverlayManagerProvider` (`components/gds/CameraGdsProvider.tsx`) as a `popover` overlay so it coordinates with confirm dialogs/toasts instead of running an independent stack.
- `components/tour/TourOverlay.tsx` — presentational renderer: measures the target via `getBoundingClientRect()`, spotlights it with a `box-shadow` cutout, positions a `role="dialog"` tooltip. Polls briefly (up to ~3s) for a target that hasn't mounted yet before concluding it genuinely won't appear and auto-skipping the step — needed because some targets (e.g. the capture flow's shutter button) only exist once an async operation (camera stream) resolves; without the poll, a step whose target briefly doesn't exist yet would silently skip instead of waiting for it.
- `components/tour/TourReplayButton.tsx` — clears the tour's `localStorage` key and restarts it.
- `lib/tour/storage.ts` — `camera-tour:<tourId>` keys, plain `localStorage`, mirrors `components/landing/LandingPageCookieConsent.tsx`'s existing pattern (no new state framework).
- `lib/tour/config/adminTourSteps.tsx`, `lib/tour/config/captureTourSteps.tsx` — per-surface step lists.

**Targeting convention**: add `data-tour-id="<surface>-<element>"` to any element a tour should spotlight. `components/admin/SemanticNavLink.tsx` takes an optional `tourId` prop for this; elsewhere it's a plain attribute on the target (Mantine/GDS components generally forward unknown props to their root DOM node). Reuse an existing `aria-label` selector instead of adding a redundant `data-tour-id` where one already uniquely identifies the target (e.g. `[aria-label="Capture photo"]` on the camera shutter).

**Admin** (`admin:v1`) mounts once in `components/admin/AdminChrome.tsx`, auto-starting on first visit, filtered by the same `navigationAccess` the layout already computes (a partner-only admin sees a shorter tour than a global admin). **Capture** (`capture:select-frame:v1` / `capture:photo:v1` / `capture:preview:v1`) is three phase-scoped mini-tours rather than one linear tour in `app/capture/[eventId]/page.tsx`, because the underlying DOM is conditionally mounted per flow `step` — there's no single moment all targets coexist. Each mini-tour auto-starts when its phase becomes active and self-skips steps whose target will never exist for the current event (e.g. the frame-picker step for a single-frame event, which auto-selects and skips straight past `select-frame`).

## 14. Canonical references

- [README.md](README.md)
- [docs/BRANCHING.md](docs/BRANCHING.md)
- [TECH_STACK.md](TECH_STACK.md)
- [docs/AUTHORIZATION.md](docs/AUTHORIZATION.md)
- [docs/MONGODB_CONVENTIONS.md](docs/MONGODB_CONVENTIONS.md)
- [docs/SLIDESHOW_LOGIC.md](docs/SLIDESHOW_LOGIC.md)
- [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md)
- [docs/MESSMASS_FANMASS_INTEGRATION.md](docs/MESSMASS_FANMASS_INTEGRATION.md)
