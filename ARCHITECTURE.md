# Architecture

**Version**: 2.10.0  
**Last Updated**: 2026-05-26

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

### Domain / business logic

- auth and session management in `lib/auth/*`
- MongoDB access and schema helpers in `lib/db/*`
- slideshow generation in `lib/slideshow/*`
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

### Admin routes

- `/admin`
- `/admin/partners/**`
- `/admin/events/**`
- `/admin/tryon/**`
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

### App surfaces

- Events App inventory and event instance detail
- Try-On App workspace, live queue, leather jersey catalog, and vetting queue

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

- edge middleware allows any valid session with `appAccess !== false` into `/admin`
- admin layout resolves global admin vs partner-scoped access
- global admins retain bypass
- global inventory pages remain global-admin-only
- partner/app pages enforce partner-scoped access where implemented

Reference:
- [docs/AUTHORIZATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/AUTHORIZATION.md)

## 6. Middleware and routing behavior

Root edge proxy in [proxy.ts](/Users/Shared/Projects/venturecogroup/camera/proxy.ts) does three important jobs:

1. gate `/admin` by valid serialized session state
2. rescue OAuth callback parameters returned to the wrong path
3. resolve GO short links on `GO_SHORT_HOSTNAMES` to `/api/go-short/[slug]` capture redirects

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
- `leather_suits`
- `tryon_jobs`

Schema definitions live in [lib/db/schemas.ts](/Users/Shared/Projects/venturecogroup/camera/lib/db/schemas.ts).

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
- [docs/SLIDESHOW_LOGIC.md](/Users/Shared/Projects/venturecogroup/camera/docs/SLIDESHOW_LOGIC.md)

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
- go-short redirects: `/api/go-short/**`

The exact route list should be taken from `app/api/**/route.ts`, not from memory.

## 12. Deployment and operations

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

## 13. Canonical references

- [README.md](/Users/Shared/Projects/venturecogroup/camera/README.md)
- [TECH_STACK.md](/Users/Shared/Projects/venturecogroup/camera/TECH_STACK.md)
- [docs/AUTHORIZATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/AUTHORIZATION.md)
- [docs/MONGODB_CONVENTIONS.md](/Users/Shared/Projects/venturecogroup/camera/docs/MONGODB_CONVENTIONS.md)
- [docs/SLIDESHOW_LOGIC.md](/Users/Shared/Projects/venturecogroup/camera/docs/SLIDESHOW_LOGIC.md)
- [docs/DOCUMENTATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/DOCUMENTATION.md)
