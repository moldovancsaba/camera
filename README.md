# Camera

**Version**: 2.10.0  
**Last Updated**: 2026-06-06  
**Status**: Production system

Camera is a Next.js platform for branded photo capture, event galleries, slideshow playback, partner operations, and reusable shared resources on the same identity, media, and MongoDB foundations.

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
  - Events
  - Try-On App

The admin UX is organized around that model:

- global inventory and superadmin tools
- partner workspaces for day-to-day operations
- app-specific surfaces for Events and Try-On

## Public surfaces

- `/` — Camera home and SSO entry
- `/capture/[eventId]` — event capture flow
- `/capture` — legacy global capture flow
- `/share/[id]` — public submission share page
- `/slideshow/[slideshowId]` — public slideshow player
- `/slideshow-layout/[layoutId]` — public composite slideshow layout player
- `/landing/[slug]` — public landing page surface

## Admin surfaces

- `/admin` — global dashboard for global admins
- `/admin/partners` — partner workspace index
- `/admin/events` — Events inventory
- `/admin/tryon` — Try-On App workspace
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

## Authorization model

Camera has two authorization layers.

1. **Global app access from SSO**
   - `session.appRole`
   - `session.appAccess`
2. **Partner-scoped app access in Camera**
   - `partner_user_access`
   - `appKey`: `events`
   - `role`: `viewer`, `manager`, or `admin`

Current operational rules:

- global `admin` and `superadmin` remain full bypass
- partner-scoped users can access only their assigned partner/app surfaces
- global inventory pages remain global-admin-only

See [docs/AUTHORIZATION.md](/Users/Shared/Projects/camera/docs/AUTHORIZATION.md).

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

See [TECH_STACK.md](/Users/Shared/Projects/camera/TECH_STACK.md).

## Data model highlights

- `partners` — tenant and resource ownership anchor
- `events` — event app instances; event URLs use Mongo `_id`, slideshow matching uses event UUID `eventId`
- `frames`, `logos` — shared and scoped visual resources
- `submissions` — composed images and capture metadata
- `slideshows` — public player configs
- `slideshow_layouts` — multi-cell videowall configs
- `landing_pages` — reusable experience surfaces
- `partner_user_access` — partner-scoped app assignments
- `leather_suits` — selectable try-on garment catalog (legacy collection and API names are preserved)
- `tryon_jobs` — async local try-on queue and worker lifecycle

See [docs/MONGODB_CONVENTIONS.md](/Users/Shared/Projects/camera/docs/MONGODB_CONVENTIONS.md) and [ARCHITECTURE.md](/Users/Shared/Projects/camera/ARCHITECTURE.md).

## Important conventions

- Treat `package.json` as the canonical version source.
- Do not assume `eventId` always means the same thing everywhere.
  - Admin URLs typically use Mongo `_id`
  - Public slideshow/submission matching uses the event UUID field
- App authorization must use `session.appRole`, not `session.user.role`.
- Partner-scoped authorization must be checked deliberately; it does not replace global app-role checks.

## Design system

Camera admin UI follows the portfolio [General Design System](https://github.com/sovereignsquad/general-design-system) through the published `@doneisbetter/*` package line. Local adapter details, migration state, exceptions, and the formal adoption manifest: [docs/GDS_CAMERA_ADOPTION.md](/Users/Shared/Projects/camera/docs/GDS_CAMERA_ADOPTION.md) and [gds-adoption.json](/Users/Shared/Projects/camera/gds-adoption.json).

Reusable exception guidance:

- [docs/GDS_EXCEPTION_STANDARD.md](/Users/Shared/Projects/camera/docs/GDS_EXCEPTION_STANDARD.md) defines the general exception model that Camera uses and that other GDS consumers can adopt

Current package note:

- Camera is aligned to the GDS **3.4.3 contracts**
- Camera now consumes the `@doneisbetter/*` package line at the provider/theme/compliance boundary
- Camera now pins the temporary supported GitHub release-asset tarballs for `@doneisbetter/*` because npm publication is not live yet
- Camera now runs on Mantine `8.3.x`, matching the current GDS peer contract
- Camera no longer carries the old local `AppButton` or `components/gds/ui` barrel authority; leaf controls import Mantine directly under the GDS runtime where needed
- public landing pages keep an explicit creator-CSS exception so pages like `/landing/*` can preserve custom themed presentation independent of the admin GDS chrome

## Try-on pipeline

Camera can optionally enqueue asynchronous try-on jobs after a capture is saved.

- public capture flows read active suits from `GET /api/tryon/suits`
- `POST /api/submissions` remains the primary save path and can optionally create a linked `tryon_jobs` record
- the official local worker in the try-on worker repository polls Atlas, runs the try-on processor, uploads the result to imgbb, and calls Camera’s signed completion endpoint
- `/admin/tryon` is the operator workspace for queue, catalog, and moderation
- `/admin/tryon/queue` shows live queue state directly from `tryon_jobs`
- `/admin/tryon/suits` manages the selectable garment catalog as Camera-hosted uploaded garment assets (legacy route name remains `/suits`)
- `/admin/tryon/vetting` reviews generated outputs before publication
- only approved generated results become visible on share pages and slideshow playlists
- rerun actions always return to pending review before any result can be sent to users

Operational docs:

- [docs/TRYON_ARCHITECTURE.md](/Users/Shared/Projects/camera/docs/TRYON_ARCHITECTURE.md)
- [docs/TRYON_OPERATIONS.md](/Users/Shared/Projects/camera/docs/TRYON_OPERATIONS.md)

## Documentation map

Canonical docs:

- [ARCHITECTURE.md](/Users/Shared/Projects/camera/ARCHITECTURE.md)
- [TECH_STACK.md](/Users/Shared/Projects/camera/TECH_STACK.md)
- [docs/GDS_CAMERA_ADOPTION.md](/Users/Shared/Projects/camera/docs/GDS_CAMERA_ADOPTION.md)
- [docs/GDS_COMPONENT_RULES.md](/Users/Shared/Projects/camera/docs/GDS_COMPONENT_RULES.md)
- [docs/GDS_3_4_3_ALIGNMENT_PLAN.md](/Users/Shared/Projects/camera/docs/GDS_3_4_3_ALIGNMENT_PLAN.md)
- [docs/AUTHORIZATION.md](/Users/Shared/Projects/camera/docs/AUTHORIZATION.md)
- [docs/MONGODB_CONVENTIONS.md](/Users/Shared/Projects/camera/docs/MONGODB_CONVENTIONS.md)
- [docs/MONGODB_ATLAS.md](/Users/Shared/Projects/camera/docs/MONGODB_ATLAS.md)
- [docs/SLIDESHOW_LOGIC.md](/Users/Shared/Projects/camera/docs/SLIDESHOW_LOGIC.md)
- [docs/DOCUMENTATION.md](/Users/Shared/Projects/camera/docs/DOCUMENTATION.md)
- [docs/TRYON_LOW_LEVEL_DESIGN.md](/Users/Shared/Projects/camera/docs/TRYON_LOW_LEVEL_DESIGN.md)
- [docs/TRYON_ADMIN_GUIDE.md](/Users/Shared/Projects/camera/docs/TRYON_ADMIN_GUIDE.md)
- [docs/TRYON_ANALYTICS.md](/Users/Shared/Projects/camera/docs/TRYON_ANALYTICS.md)

Tracker handover:

- GitHub issue and Projects-board handoff status is documented in [docs/DOCUMENTATION.md](/Users/Shared/Projects/camera/docs/DOCUMENTATION.md) under `GitHub tracker handover`.

Historical or planning-heavy docs should not be treated as runtime truth unless they were refreshed recently:

- `RELEASE_NOTES.md`
- `ROADMAP.md`
- `TASKLIST.md`
- `LEARNINGS.md`
- `CODE_AUDIT.md`
