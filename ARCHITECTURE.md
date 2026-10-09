# Architecture

**Version**: 12.3.40  
**Last Updated**: 2026-09-28

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
  -> MongoDB Atlas + Vercel Blob (imgbb mirror) + SSO
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
- Vercel Blob (primary image store since v12.2.14) and imgbb (best-effort mirror), both via `lib/imgbb/upload.ts`
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

### Contextual menus (issue 426)

Inside an event or a partner the sidebar shows that item's own menu (`lib/adminNavigation.ts`, `components/admin/AdminChrome.tsx`), with "Back to the main menu" first; a test fails when a page
under `app/admin/events/[id]` or `app/admin/partners/[id]` is not an item of its menu. The **event** menu: Overview, Edit and pages, Vetting, **Gallery**, Queue, Analytics, Logos, Frames, Images,
Texts, Slideshows, Landing pages (and Emails with the e-mail epic). **The event gallery has its own page** (`app/admin/events/[id]/gallery/page.tsx`, the query in `lib/gallery/submissions.ts`, the component `components/admin/EventGallery.tsx`;
camera#488): the overview only counts the photos and links to it. **The event's frame on a gallery photo** (camera#488): `lib/gallery/frame.ts` picks the frames the event offers (its own complete frames, else the generated frame's images, as for guests) and `composeUploadWithFrame` (`lib/photo-vetting/compose.ts`) crops the photo to the frame's shape and lays the frame over it; used when an editor uploads with the option (`POST /api/admin/events/<id>/gallery-upload`, field `withFrame`) and for selected photos (`POST /api/admin/events/<id>/gallery-frame`, at most 25, only photos uploaded in the gallery without a frame; the plain upload is kept as `originalImageUrl`, `metadata.galleryFrame` marks it). Selecting several photos (Shift+click range, a dragged box, Select mode, Ctrl+A, Esc) is `lib/gallery/selection.ts`; the research is `docs/_research/GALLERY_MULTISELECT_RESEARCH.md`. The **partner** menu: Overview, Edit, Logos, Frames, Images, Pictures, Texts, Emails. The global **Settings** group:
Vetting card display, Journey defaults, Dictionary, Emails (the general level).

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

### Renderer runtime status and planned replacement

As of 2026-09-30, try-on is paused: current events have try-on disabled, the legacy local worker is stopped, and the try-on sync cron has been removed. Camera's `tryon_jobs`, derived results, and moderation remain retained product data. A planned image.direct integration will preserve Camera as queue/moderation authority and use a separate authenticated local-rendering execution service; it is not currently enabled and must not be inferred from the historical callback route. See [docs/IMAGE_DIRECT_INTEGRATION.md](docs/IMAGE_DIRECT_INTEGRATION.md).

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
- The giant-screen player beacons what it does (slides shown, playlist calls, preloads, the refill lock, a heartbeat, stalls) to
  `POST /api/observability/slideshow-diagnostic`, which only logs `camera.slideshow_diagnostic` (camera#476; `RUNBOOK.md`,
  "Slideshow diagnostics"), like the capture diagnostics (`/api/observability/capture-diagnostic`).

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

- `organizations`
- `partners`
- `events`
- `frames`
- `logos`
- `images` (the Images library: pictures the picture fields choose; docs/LIBRARIES.md)
- `submissions`
- `slideshows`
- `slideshow_layouts`
- `short_links` (tracked short links, one per placement of an event; docs/SHORT_LINKS.md)
- `short_link_hits` (their visit counts, one row per link, UTC day and kind of phone)
- `email_registrations` (who registered at an event: one row for each event and e-mail address, with whether the welcome e-mail went; docs/EMAIL_TEMPLATES.md)
- `landing_pages`
- `landing_page_css_presets`
- `partner_user_access`
- `users_cache`
- `web_sessions`
- `leather_suits`
- `tryon_jobs`
- `tryon_worker_heartbeats`
- `tryon_moderation_events`
- `tryon_setups`
- `camera_setup_preferences`
- `admin_settings`

Schema definitions live in [lib/db/schemas.ts](lib/db/schemas.ts).

**Libraries.** `frames` and `logos` form three levels, Global -> Partner -> Event, one way only (camera#361): an item is global unless it carries `scope`
`partner` or `event`; a partner's library is `Partner.library` plus its own uploads; an event takes items from its partner's library or uploads its own
(`Event.frames[]`, `Event.logos[]`). See [docs/LIBRARIES.md](docs/LIBRARIES.md); the code is in `lib/library/`. `images` has the same three levels but is
not assigned to an event: a picture field keeps the plain address of one picture, chosen with the picture picker (`components/admin/library/ImagePicker.tsx`).

**Settings and levels added in October 2026** (the model is in [docs/BUILDING_BRICKS.md](docs/BUILDING_BRICKS.md)): `admin_settings` also holds `dictionary` (the global wordings, [docs/TEXT_LEVELS.md](docs/TEXT_LEVELS.md))
and `email-legal` (the general legal part of the e-mails); `Partner.texts`, `Partner.pictures`, `Partner.uiLanguage`, `Partner.emailLegal`; `Event.texts`, `Event.uiLanguage` (an event that
sets none follows its partner), `activity_log` and `activity_exports` (the activity log and its weekly CSV, `lib/activity/*`, RUNBOOK), `Event.emailLegal`, `Event.frameSelection`, `Event.acceptanceOnWhoAreYou` (the consent page as one checkbox on the Who-are-you page, `lib/events/acceptance.ts`, docs/JOURNEY_DEFAULT_PAGES.md), `Event.welcomeScreen`, `Event.slotSnapshots` (the last-known-good copy of the slots an event uses),
`Event.frameDesign` (the generated frame: snapshot, messages, `messageFrames`, `darkArea`, one image per message and design).

## 9. Submission pipeline

Primary path:

1. capture page collects image and optional onboarding data
2. client composites photo + frame where required
3. `POST /api/submissions`
4. server uploads raster via `lib/imgbb/upload.ts` (Vercel Blob primary, imgbb best-effort mirror)
5. server inserts Mongo submission document
6. share, gallery, and slideshow flows consume that record

Important implementation note:

- the persisted submission shape is leaner and more compatibility-driven than the broad TypeScript interfaces suggest
- consumers still rely on fields like `imageUrl`, `eventId`, `eventIds`, and metadata dimensions

Step 6 of the pipeline is also where the e-mails start: a saved photo may send "arrived" (`lib/email/triggers.ts`, after the answer is sent, once for each photo) and, when it is approved (at once without vetting, by a moderator with it), "approved" with the links;
a declined photo sends "declined" (section 16).

## 10. Slideshow architecture

Public slideshow behavior is driven by:

- `lib/slideshow/playlist.ts`
- `app/api/slideshows/[slideshowId]/playlist/route.ts`
- `components/slideshow/SlideshowPlayerCore.tsx`
- `lib/slideshow/queue.ts` (the queue rules of the player, pure and unit-tested)
- `lib/slideshow/resilience.ts` (deadlines for requests, retry backoff) and `lib/slideshow/preload.ts` (the picture preloader: deadline, at most 3 loads at a time, a late picture is kept, failures remembered for 2 minutes, prune); every wait of the player is bounded and the refill lock is always released (camera#476, S3). The preload is the request the screen uses (no `crossOrigin`, low priority in the background, the first 3 slides decoded ahead; S4a). The show starts on the first 2 slides and the screen design's picture; the rest of the first answer joins the queue as it loads (S5). The screen recovers from a stall by itself: next slide, then a capped reload (`lib/slideshow/watchdog.ts`), and keeps the display awake (S8). It reloads itself every 3 hours and when an admin asks (`lib/slideshow/reload.ts`, `POST /api/slideshows/<id>/reload`, `reloadRequestedAt` carried as `reloadToken` in the playlist answer; S8b). The screen is sent a screen-sized WebP of each photo, made once when the photo becomes public (`lib/submissions/screen-picture.ts`, `Submission.screenImageUrl`; S7). An optional crossfade (two picture layers, per-slideshow switch `crossfade`, off by default; S4b)
- `lib/slideshow/diagnostics.ts`, `components/slideshow/useSlideshowDiagnostics.ts`, `SlideshowDebugPanel.tsx`, `app/api/observability/slideshow-diagnostic/route.ts` (what the screen reports about itself: slides shown, playlist calls, preloads, the refill lock, heartbeat, stalls; logged only, `?debug=1` panel), `lib/slideshow/server-timing.ts` (`Server-Timing` of the playlist call)

Key properties:

- fairness via `playCount`
- aspect-aware single or mosaic slides
- queue-based browser playback: a refill sends `exclude` (the submission ids already queued) and appends only slides the queue does not hold, so the fixed-order screen never shows one photo for `bufferSize + 1` slides (camera#476); when the server has nothing new the loop continues from the seed (every slide received, in order). The player writes its queue in one place (`commitQueue`), the ref is the truth and the state only draws it
- composite layouts through `slideshow_layouts`
- the playlist call is lean (camera#476, S6): the pool query projects only what a slide needs before it sorts, and the inactive-accounts list is cached for a minute per instance (`lib/cache/ttl-once.ts`, `lib/db/sso.ts`)
- the research and the fix plan for the freeze: `docs/_research/SLIDESHOW_FREEZE_RESEARCH.md` (steps S1 to S8; S2 is this queue fix)

Reference:
- [docs/SLIDESHOW_LOGIC.md](docs/SLIDESHOW_LOGIC.md)

## 11. API surface summary

Major API groups:

- auth: `/api/auth/**`
- partners: `/api/partners/**`
- events: `/api/events/**`
- frames: `/api/frames/**` (the global library)
- emails: `/api/admin/emails/legal` (general legal part), `/api/admin/emails/preview` (the editor's preview), `/api/admin/emails/test` (a test e-mail to the editor), `/api/admin/events/[id]/emails` (an event's five e-mails), `/api/events/[eventId]/register` (welcome), `/api/partners/[partnerId]/email-legal`, `/api/events/[eventId]/email-legal`
- frame selection: `/api/admin/events/[id]/frame-selection`, `/api/admin/events/[id]/frame-design` (messages, their designs, the dark area)
- texts: `/api/admin/dictionary`, `/api/partners/[partnerId]/texts`, `/api/events/[eventId]/texts`
- libraries: `/api/partners/[partnerId]/library/**` and `/api/events/[eventId]/library/**` (docs/LIBRARIES.md)
- images: `/api/images/**` (the global Images library)
- logos: `/api/logos/**`
- submissions: `/api/submissions/**`
- slideshows: `/api/slideshows/**`
- slideshow layouts: `/api/slideshow-layouts/**`
- landing pages: `/api/landing-pages/**`
- admin users/submissions utilities: `/api/admin/**`
- event data exports: `/api/admin/events/[id]/export/emails` and `/api/admin/events/[id]/export/images` (manager-gated; CSV + ZIP, shared logic in `lib/events/event-export.ts`)
- go-short redirects: `/api/go-short/**`
- internal service-to-service: `/api/internal/messmass/**` (messmass provisions organisations/partners/events; messmass is master), `/api/internal/fanmass/**` (fanmass pulls events + media, read-only), `/api/internal/tryon/**` (try-on worker callbacks), `/api/internal/savetheworld/**` (savetheworld provisions partners/events, reads the pledge wall, bulk-publishes an event's selfies; `x-savetheworld-secret`), `/api/internal/email/send` (shared cross-app email via Resend; accepts the messmass or fanmass caller secret) — each gated by a shared secret, not a user session. See [docs/MESSMASS_FANMASS_INTEGRATION.md](docs/MESSMASS_FANMASS_INTEGRATION.md).

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

- Next.js app deployed on Vercel (project `narimato/04_camera`, domains `camera.messmass.com`, `go.messmass.com`)
- MongoDB Atlas for persistence
- Vercel Blob for raster hosting (primary since v12.2.14), imgbb as best-effort mirror
- SSO host reachable over HTTPS
- optional Upstash Redis for shared rate limits

Every push to `main` auto-deploys to production via the Vercel Git integration; the
deploy is not gated on GitHub Actions CI, so run `npm run release:check` before pushing.
Deploy/verify steps: [RUNBOOK.md](RUNBOOK.md).

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

## 14. Levels: slots, texts and the legal part

Everything an event shows is one of five bricks (Words, Picture, Look, Link, Switch) chosen **at the place of use**, with the default coming from above (docs/BUILDING_BRICKS.md). One rule for
every level (global, partner, event): **an event follows its partner and the partner follows the global level each time it is read; nothing is copied down; what a level sets is its own and is
never overridden by a later change above.** Implemented for the logo slots (`lib/slots/*`), the text levels (`lib/i18n/overrides.ts`: the code dictionary, the Dictionary, a partner's Texts, an
event's Texts), the partner's default pictures (`lib/events/partner-pictures.ts`), the partner's default language (`eventLanguage`) and the legal part of the e-mails (`lib/email/legal*.ts`).

## 15. Frames, layouts and messages at an event

([docs/FRAME_LAYOUT_SELECTION_PLAN.md](docs/FRAME_LAYOUT_SELECTION_PLAN.md), [docs/DEFAULT_FRAME_PLAN.md](docs/DEFAULT_FRAME_PLAN.md), [docs/LIBRARIES.md](docs/LIBRARIES.md).)

- **Layouts** are the designs of the event: library frames with a message area (text-free, carrying messages), the generated layout (logo, teams, bar, message from the messmass snapshot) and
  complete frames the event uploads. `Event.frameDesign.messageFrames[message]` is one frame id or a list: a message can be written on several designs; `lib/frame/variants.ts` draws one
  image for each message and design (at most 40, reused by key). `Event.frameSelection` says how users get the layout and the message, each `editor`, `random` or `user`
  (`lib/frame/selection*.ts`, panel on the event's Frames page, `GET`/`PUT /api/admin/events/<id>/frame-selection`).
- **Frame slots** (issue 502, [docs/FRAME_SLOTS_PLAN.md](docs/FRAME_SLOTS_PLAN.md)): the generated layout can be composed from up to twelve optional slots, six text and six picture, at the six positions (top and
  bottom, left, centre and right). `Event.frameDesign.slots` (`lib/frame/slots.ts`: the model, `DEFAULT_SLOTS`, the defensive `parseSlots`, `resolveSlotPictures`) says what each shows; an event without
  `slots` is drawn by the old generated layout, untouched. `lib/frame/slot-layout.ts` is the geometry and the text fitting (pure; the default slots give the same numbers as `layoutFrame`, tested), `renderSlotFrame` in
  `lib/frame/render.ts` draws (the default slots are pixel-identical to the generated frame, tested with the real canvas), `lib/frame/variants.ts` uses it for a message that chose no library frame (precedence: a library frame the
  message chose, the older base picture, slots, the generated layout), the key of an image holds the slots only when the event has them. A picture slot can hold up to six pictures and say which message uses which
  (blue and pink strips). `PUT /api/admin/events/<id>/frame-slots` saves (slots equal to the default are stored as none) and draws the images, `POST .../frame-slots/preview` draws the draft as a picture with the notes
  (a text that is cut, slots that overlap); the editor is `components/admin/FrameSlotsEditor.tsx` (generic, wired by an adapter), on the event's Frames page as `FrameSlotsPanel`.
  **Defaults** (segment 5, owner answer 220; the brick rule "own, else the partner's, else the general default, else built-in", no copy): `Partner.defaultFrameSlots` and the setting `frame-slots-default` (`lib/frame/slots-inherit.ts`); `generateFrameVariants` draws an event with no slots of its own with what it follows, and never stores that on the event; the key of an image holds the slots, so a changed default redraws only what changed. `GET`/`PUT`/`POST /api/partners/<id>/frame-slots` and `/api/admin/frame-slots` (global admins) read, save, preview and redraw one follower at a time (`lib/frame/default-slots.ts`); the editors are `DefaultSlotsPanel` on the partner's Frames page and the Settings page Frame slots. Slots an event saves that equal what it follows are stored as none.
- **Broken pictures** (owner rule 2026-10-09, CLAUDE.md section 9): `lib/media/broken.ts` asks a picture's own host (`checkPicture`), records `Submission.mediaHealth`, and the one visibility rule
  (`lib/submissions/visibility.ts`), the playlist, the gallery filter and greatest hits leave a broken photo out. The screens report a picture that failed (`POST /api/media/broken`, public, rate limited, the server
  checks for itself); the admin checks them all (`GET`/`POST /api/admin/media-health`, card on the Slideshows page, `scripts/scan-broken-pictures.ts`).
  **The other pictures** (issue 514): `lib/media/pictures.ts` + collection `picture_health` (one row per address: `broken`, `reason`, `checkedAt`, `where`; index on `broken`). `collectPictureAddresses` walks events, partners, logos, library images, frames, landing pages and slideshows
  for picture fields on our image hosts; `scanPictures` checks the ones not checked in 6 days in bounded batches (an unclear answer records the try, so the loop ends); `brokenAddresses` (cached a minute) feeds `withoutBroken`/`pictureOrNull`, used by the guest event API
  (`audience=guest`, also drops a frame whose picture is gone), `loadEventTheme` (logo and e-mail footer: guest pages, e-mails, share page) and the slideshow playlist (a gone overlay plays the stage plain). The same admin card checks them (`POST /api/admin/media-health {kind:'items'}`) and
  lists the gone ones with where they are used; the daily cron `GET /api/internal/pictures-scan` (05:30 UTC, `CRON_SECRET`) checks photos and these pictures until its 40 seconds are used.
- **The capture flow** asks `lib/frame/choose.ts` (pure) for everything: the step (design, then message, then the camera), the designs and messages to offer (a message only on the designs it is
  written on), what a change of design keeps, and the draw of the image of a photo, which happens **when the camera step opens** so the live view and the move-and-zoom step show the dark area
  of that design. An event with no saved selection keeps the random image at every shutter press.
- **The dark area** is one method for every event (`lib/frame/dark-area.ts`): the boxes of the layers of the image (a frame's own layers, or the mask of the generated frame when
  `frameDesign.darkArea` is `generated`) and, for a complete own frame, its 50 % black silhouette in the live view and the move-and-zoom step; a vetted event never shows the real frame.

## 16. E-mails to the user

([docs/EMAIL_FORMAT_PLAN.md](docs/EMAIL_FORMAT_PLAN.md), [docs/EMAIL_TEMPLATES.md](docs/EMAIL_TEMPLATES.md).)

- **One composer.** `lib/email/compose.ts` makes the subject, the themed HTML and the plain-text part from a subject template, a message template, the legal part and the values of the
  variables; the sender (`lib/email/submission-notification.ts`, through Resend) and the editor's preview (`POST /api/admin/emails/preview`) both call it.
- **Five types** (`lib/email/types.ts`): welcome, arrived, approved, declined, follow up, each with a switch (a stored choice wins; an event with none follows the default: approved and declined on, the others off), a subject and a message, stored in `Event.notifications.types`; `PATCH /api/events/<id>` keeps only what the editor chose (`lib/email/notification-settings.ts`). Approved is the old after-save e-mail and the vetted "photo approved" e-mail; declined is the old "not approved" e-mail.
- **The words** are written in a small safe markup (`lib/email/rich.ts`): paragraphs, titles, small and large text, bold, italic, labelled links, and a paragraph that is only a picture (optionally a link; the picture must pass `allowedImage`, the app's own storage, else it is left out and reported in `warnings.refusedPictures`); nothing else is markup and HTML is escaped. The
  **variables** (`lib/email/variables.ts`: name, event, partner, home, visitor, teams, date, location, eventlink, link, terms) are filled after the text is read, so a value is never markup; one with
  no value is left out. `{eventlink}` and the "take another photo" link use the event's own short link when it has a URL slug (`lib/email/event-link.ts`).
- **The legal part** is one slot with three levels per language (general, partner, event; `lib/email/legal-rules.ts`, stores in `lib/email/legal.ts`, routes `/api/admin/emails/legal`,
  `/api/partners/<id>/email-legal`, `/api/events/<id>/email-legal`), drawn as small print after the button.
- **Triggers** (`lib/email/triggers.ts`): **welcome** when somebody registers (`POST /api/events/<id>/register`, called by the capture page once the user is identified and only when the event has welcome on; one row for each event and address in `email_registrations`, claimed before the send so it goes once), **arrived** when a photo is submitted (`dispatchArrivedEmail` after `POST /api/submissions`, and at the finalize call when the address is known only then; `metadata.arrivedEmailSentAt`). **Follow up** has its text and switch but no trigger and no job yet.
- **Event page:** `Emails` in the event menu (`/admin/events/<id>/emails`, route `GET`/`PUT /api/admin/events/<id>/emails`, view in `lib/email/event-emails.ts`, merge of the stored settings in `lib/email/notification-settings.ts`): the five types, the sender and terms, the two try-on e-mails and the event's legal part. The e-mail fields are no longer in the event form or the new-event form.
- **Test e-mail** (`POST /api/admin/emails/test`): the e-mail as drawn, sent through the same sender to the signed-in editor's own address only.
- **Editors:** the toolbar editor (`components/admin/kit/EmailTextEditor.tsx`, pure operations in `lib/email/editor-ops.ts`) with the live preview (`EmailPreview.tsx`); pages `Emails` at the general
  level (`/admin/settings/emails`) and at the partner level (`/admin/partners/<id>/emails`).

## 17. Canonical references

- [README.md](README.md)
- [docs/BRANCHING.md](docs/BRANCHING.md)
- [TECH_STACK.md](TECH_STACK.md)
- [docs/AUTHORIZATION.md](docs/AUTHORIZATION.md)
- [docs/MONGODB_CONVENTIONS.md](docs/MONGODB_CONVENTIONS.md)
- [docs/SLIDESHOW_LOGIC.md](docs/SLIDESHOW_LOGIC.md)
- [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md)
- [docs/MESSMASS_FANMASS_INTEGRATION.md](docs/MESSMASS_FANMASS_INTEGRATION.md)
- [docs/BUILDING_BRICKS.md](docs/BUILDING_BRICKS.md), [docs/TEXT_LEVELS.md](docs/TEXT_LEVELS.md), [docs/LIBRARIES.md](docs/LIBRARIES.md)
- [docs/STORAGE_ARCHITECTURE.md](docs/STORAGE_ARCHITECTURE.md) (where every picture lives, the copies, and the plan so that none is ever lost; recommendation of 2026-10-09, not built yet)
- [docs/FRAME_LAYOUT_SELECTION_PLAN.md](docs/FRAME_LAYOUT_SELECTION_PLAN.md), [docs/DEFAULT_FRAME_PLAN.md](docs/DEFAULT_FRAME_PLAN.md)
- [docs/EMAIL_FORMAT_PLAN.md](docs/EMAIL_FORMAT_PLAN.md), [docs/EMAIL_TEMPLATES.md](docs/EMAIL_TEMPLATES.md)
