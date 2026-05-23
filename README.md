# Camera

**Version**: 2.9.0  
**Last Updated**: 2026-05-20  
**Status**: Production system

Camera is a Next.js platform for branded photo capture, event galleries, slideshow playback, partner operations, and Gym/FFF experiences that reuse the same identity, media, and MongoDB foundations.

## Product model

Camera now operates as a small platform with shared resources plus app surfaces.

- **Camera Core**
  - Partners
  - Frames
  - Logos
  - Landing Pages
  - Slideshows
  - Slideshow Layouts
  - Galleries / Submissions
  - Global Users and partner-scoped access assignments
- **Apps**
  - Events App
  - Gym App

The admin UX is organized around that model:

- global inventory and superadmin tools
- partner workspaces for day-to-day operations
- app-specific surfaces for Events and Gym

## Public surfaces

- `/` — Camera home and SSO entry
- `/capture/[eventId]` — event capture flow
- `/capture` — legacy global capture flow
- `/share/[id]` — public submission share page
- `/slideshow/[slideshowId]` — public slideshow player
- `/slideshow-layout/[layoutId]` — public composite slideshow layout player
- `/landing/[slug]` — public landing page surface
- `/workout` and `/workout/**` — Gym workout flow
- `/fff/**` internally, with host-based rewrites for the public FFF/Gym experience

## Admin surfaces

- `/admin` — global dashboard for global admins
- `/admin/partners` — partner workspace index
- `/admin/events` — Events App inventory
- `/admin/gym` — Gym App operations
- `/admin/frames`, `/admin/logos`, `/admin/submissions`, `/admin/users` — global inventory / audit pages

## Core behavior

### Capture and submissions

1. User opens an event capture page.
2. Optional custom pages collect guest data, consent, or CTA actions.
3. Browser captures or uploads an image.
4. Client-side compositing applies the selected frame where applicable.
5. `POST /api/submissions` uploads the final raster to imgbb and stores metadata in MongoDB.
6. Submission becomes available to share pages, galleries, and slideshow playlists.

### Slideshows

- Public slideshows are backed by `slideshows` documents and `slideshowId` URLs.
- Playlist generation reads event-linked submissions, applies fairness via `playCount`, and builds single-image or mosaic slides.
- Composite layouts mount multiple slideshow players in one screen using `slideshow_layouts`.

### Gym / FFF

- Gym uses the same SSO session, Atlas database, frames, submissions, and slideshow machinery as the rest of Camera.
- FunFitFan bootstrap creates a dedicated partner plus per-user virtual event/slideshow context.
- Workout content is stored in `gym_lessons`; logged workout sessions are stored in `gym_workout_sessions`.

## Authorization model

Camera has two authorization layers.

1. **Global app access from SSO**
   - `session.appRole`
   - `session.appAccess`
2. **Partner-scoped app access in Camera**
   - `partner_user_access`
   - `appKey`: `events` or `gym`
   - `role`: `viewer`, `manager`, or `admin`

Current operational rules:

- global `admin` and `superadmin` remain full bypass
- partner-scoped users can access only their assigned partner/app surfaces
- global inventory pages remain global-admin-only

See [docs/AUTHORIZATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/AUTHORIZATION.md).

## Quick start

```bash
npm install
npm run dev
npm run type-check
```

Optional smoke coverage:

```bash
npm run test:e2e
```

Notes:

- Playwright smoke tests use development-only bootstrap/login routes.
- Set `PLAYWRIGHT_START_WEB_SERVER=true` if you want the test runner to launch `next dev` automatically.

Default local URL:

```text
http://localhost:3000
```

## Runtime stack

- Next.js 16 App Router
- React 19
- TypeScript 5.9
- Tailwind CSS 4
- MongoDB Atlas
- SSO OAuth2/OIDC + PKCE
- imgbb for raster hosting
- optional Upstash Redis for shared rate limits

See [TECH_STACK.md](/Users/Shared/Projects/venturecogroup/camera/TECH_STACK.md).

## Data model highlights

- `partners` — tenant and resource ownership anchor
- `events` — event app instances; event URLs use Mongo `_id`, slideshow matching uses event UUID `eventId`
- `frames`, `logos` — shared and scoped visual resources
- `submissions` — composed images and capture metadata
- `slideshows` — public player configs
- `slideshow_layouts` — multi-cell videowall configs
- `landing_pages` — reusable experience surfaces
- `partner_user_access` — partner-scoped app assignments
- `gym_lessons`, `gym_workout_sessions`, `fff_settings`, `fff_user_profiles` — Gym/FFF domain data

See [docs/MONGODB_CONVENTIONS.md](/Users/Shared/Projects/venturecogroup/camera/docs/MONGODB_CONVENTIONS.md) and [ARCHITECTURE.md](/Users/Shared/Projects/venturecogroup/camera/ARCHITECTURE.md).

## Important conventions

- Treat `package.json` as the canonical version source.
- Do not assume `eventId` always means the same thing everywhere.
  - Admin URLs typically use Mongo `_id`
  - Public slideshow/submission matching uses the event UUID field
- App authorization must use `session.appRole`, not `session.user.role`.
- Partner-scoped authorization must be checked deliberately; it does not replace global app-role checks.

## Documentation map

Canonical docs:

- [ARCHITECTURE.md](/Users/Shared/Projects/venturecogroup/camera/ARCHITECTURE.md)
- [TECH_STACK.md](/Users/Shared/Projects/venturecogroup/camera/TECH_STACK.md)
- [docs/GDS_CAMERA_ADOPTION.md](/Users/Shared/Projects/venturecogroup/camera/docs/GDS_CAMERA_ADOPTION.md)
- [docs/GDS_COMPONENT_RULES.md](/Users/Shared/Projects/venturecogroup/camera/docs/GDS_COMPONENT_RULES.md)
- [docs/AUTHORIZATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/AUTHORIZATION.md)
- [docs/MONGODB_CONVENTIONS.md](/Users/Shared/Projects/venturecogroup/camera/docs/MONGODB_CONVENTIONS.md)
- [docs/MONGODB_ATLAS.md](/Users/Shared/Projects/venturecogroup/camera/docs/MONGODB_ATLAS.md)
- [docs/SLIDESHOW_LOGIC.md](/Users/Shared/Projects/venturecogroup/camera/docs/SLIDESHOW_LOGIC.md)
- [docs/DOCUMENTATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/DOCUMENTATION.md)

Tracker handover:

- GitHub issue and Projects-board handoff status is documented in [docs/DOCUMENTATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/DOCUMENTATION.md) under `GitHub tracker handover`.

Historical or planning-heavy docs should not be treated as runtime truth unless they were refreshed recently:

- `RELEASE_NOTES.md`
- `ROADMAP.md`
- `TASKLIST.md`
- `LEARNINGS.md`
- `CODE_AUDIT.md`
