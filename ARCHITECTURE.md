# Architecture

**Version**: 2.9.0  
**Last Updated**: 2026-05-20

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
  - Events App
  - Gym App

Gym is not a separate stack. It runs on top of the same session, media, and MongoDB infrastructure as the Events App.

## 2. Top-level layers

```text
Browser / Public Screens
  -> Next.js App Router pages and client components
  -> API routes / edge middleware
  -> business logic in lib/*
  -> MongoDB Atlas + imgbb + SSO
```

### Browser and page layer

- public capture, share, slideshow, landing, workout, and FFF pages
- admin pages under `/admin`
- React client components for camera capture, admin forms, slideshow playback, and Gym flows

### API layer

- Next.js route handlers under `app/api/**`
- root edge proxy in `proxy.ts`
- shared API helpers in `lib/api/*`

### Domain / business logic

- auth and session management in `lib/auth/*`
- MongoDB access and schema helpers in `lib/db/*`
- slideshow generation in `lib/slideshow/*`
- Gym / FFF bootstrap and workflow helpers in `lib/funfitfan/*` and `lib/gym/*`
- partner-scoped access helpers in `lib/partners/*`

### External services

- MongoDB Atlas
- imgbb
- external SSO service
- optional Upstash Redis for shared rate limiting

## 3. Route model

### Public routes

- `/` — Camera home
- `/capture/[eventId]` — event capture flow
- `/capture` — legacy generic capture flow
- `/share/[id]` — public submission share page
- `/slideshow/[slideshowId]` — public slideshow player
- `/slideshow-layout/[layoutId]` — public multi-cell slideshow layout
- `/landing/[slug]` — public landing pages
- `/workout`, `/workout/training/[trainingId]`, `/workout/session/**` — Gym workout flow
- FFF host routes rewritten by middleware to internal `/fff/**`

### Admin routes

- `/admin`
- `/admin/partners/**`
- `/admin/events/**`
- `/admin/gym/**`
- `/admin/frames/**`
- `/admin/logos/**`
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
- Gym relationship when relevant

### App surfaces

- Events App inventory and event instance detail
- Gym App settings and training content

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
- `appKey`: `events` or `gym`
- `role`: `viewer`, `manager`, `admin`
- `isActive`

Purpose:

- determine which partner workspaces a non-global-admin may access
- determine which app surfaces are visible and writable

### Current enforcement model

- edge middleware allows any valid session with `appAccess !== false` into `/admin`
- admin layout resolves global admin vs partner-scoped access
- global admins retain bypass
- global inventory pages remain global-admin-only
- partner/app pages enforce partner-scoped access where implemented

Reference:
- [docs/AUTHORIZATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/AUTHORIZATION.md)

## 6. Middleware and routing behavior

Root edge proxy in [proxy.ts](/Users/Shared/Projects/venturecogroup/camera/proxy.ts) does four important jobs:

1. gate `/admin` by valid serialized session state
2. rescue OAuth callback parameters returned to the wrong path
3. rewrite FFF host public URLs to internal `/fff/*`
4. resolve GO short links to capture redirects

Important consequence:

- the public Gym/FFF experience can present clean URLs on a dedicated host while still living inside this repository

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

This is intentional. Do not collapse it into a single rule. See [docs/MONGODB_CONVENTIONS.md](/Users/Shared/Projects/venturecogroup/camera/docs/MONGODB_CONVENTIONS.md).

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

Gym / FFF collections:

- `gym_lessons`
- `gym_workout_sessions`
- `fff_settings`
- `fff_user_profiles`

Schema definitions live in [lib/db/schemas.ts](/Users/Shared/Projects/venturecogroup/camera/lib/db/schemas.ts).

## 9. Submission pipeline

Primary path:

1. capture page collects image and optional onboarding data
2. client composites photo + frame where required
3. `POST /api/submissions`
4. server uploads raster to imgbb
5. server inserts Mongo submission document
6. share, gallery, slideshow, and Gym/FFF flows consume that record

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
- [docs/SLIDESHOW_LOGIC.md](/Users/Shared/Projects/venturecogroup/camera/docs/SLIDESHOW_LOGIC.md)

## 11. Gym / FFF architecture

FFF bootstrap in [lib/funfitfan/bootstrap.ts](/Users/Shared/Projects/venturecogroup/camera/lib/funfitfan/bootstrap.ts) ensures:

- dedicated Gym/FFF partner exists
- default frame and sport-activity settings exist
- each signed-in member gets a virtual event and slideshow context

This means Gym can reuse:

- Camera submissions
- slideshow player
- frames
- partner defaults
- shared SSO session state

## 12. API surface summary

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
- admin Gym: `/api/admin/gym/**`
- public Gym: `/api/gym/**`
- admin users/submissions utilities: `/api/admin/**`
- FFF bootstrap and hashtags: `/api/fff/**`

The exact route list should be taken from `app/api/**/route.ts`, not from memory.

## 13. Deployment and operations

Expected environment shape:

- Next.js app deployed on Vercel or equivalent
- MongoDB Atlas for persistence
- imgbb for raster hosting
- SSO host reachable over HTTPS
- optional Upstash Redis for shared rate limits

Useful commands:

```bash
npm run type-check
npm run db:verify-uri
npm run db:ensure-indexes
npm run env:verify
```

## 14. Canonical references

- [README.md](/Users/Shared/Projects/venturecogroup/camera/README.md)
- [TECH_STACK.md](/Users/Shared/Projects/venturecogroup/camera/TECH_STACK.md)
- [docs/AUTHORIZATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/AUTHORIZATION.md)
- [docs/MONGODB_CONVENTIONS.md](/Users/Shared/Projects/venturecogroup/camera/docs/MONGODB_CONVENTIONS.md)
- [docs/SLIDESHOW_LOGIC.md](/Users/Shared/Projects/venturecogroup/camera/docs/SLIDESHOW_LOGIC.md)
- [docs/DOCUMENTATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/DOCUMENTATION.md)
