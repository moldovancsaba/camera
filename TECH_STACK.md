# Tech Stack

**Version**: 12.3.38  
**Last Updated**: 2026-09-28

This document records the current technical stack in use and the parts of the product each technology supports.

## Core application

### Next.js 16

- App Router architecture
- server components for page/data composition
- client components for interactive admin, capture, and slideshow surfaces
- route handlers for REST-style APIs
- root middleware for auth and host-based rewrites

### React 19

- client interactivity
- slideshow player state
- admin forms and resource managers
- capture flow orchestration

### TypeScript 5.9

- strict mode
- schema and route typing
- shared domain types across admin, public pages, and APIs

### Tailwind CSS 4

- utility-first styling
- shared admin UI styling
- branded public flows
- dark-mode support where used

## Runtime and infrastructure

### Node.js

- `package.json` `engines.node`: `>=24.0.0 <25.0.0`; `.nvmrc`: `24`; CI (`.github/workflows/ci.yml`) uses Node 24 via `.nvmrc`
- the Vercel project setting still shows Node 22.x, but builds run on 24 because `engines.node` overrides it (per the build log) — set the dashboard to 24.x

### MongoDB Atlas

Primary persistence layer for:

- partners
- events
- frames and logos
- submissions
- slideshows and slideshow layouts
- landing pages
- partner-scoped access assignments
- server-side web session storage

### Vercel Blob (primary) and imgbb (mirror)

Every image upload goes through `lib/imgbb/upload.ts` (name kept for callers):
Vercel Blob (`@vercel/blob`) is the required primary store since v12.2.14
(`f799da5`); imgbb is uploaded concurrently as a best-effort mirror and never
fails the call. Photos stored before v12.2.14 still carry `i.ibb.co` URLs.

Used for:

- uploaded admin media
- composed submission rasters
- slideshow failover/background images where configured

### External SSO

Used for:

- OAuth2/OIDC + PKCE login
- app-level permission lookup
- Camera session creation and refresh flow

### Upstash Redis (optional)

Used only when configured for:

- shared rate limiting across instances

Without it, rate limits fall back to in-memory per-instance behavior.

## Frontend capability areas

### Camera / capture

- browser `getUserMedia`
- Canvas-based compositing
- event-specific onboarding pages
- upload/save/share flow

### Slideshows

- playlist generation on the server
- queue-driven playback in the browser
- single-image and mosaic slide layouts
- multi-cell videowall composition

### Admin

- partner workspace operations
- global inventory pages
- Events App management
- Try-On App management
- partner user assignment UI

## Key library choices

### `mongodb`

- primary database driver
- direct collection access
- server-side index management via scripts

### `axios`

- outbound HTTP requests where used, especially external service integrations

### `sharp`

- server-side image inspection (e.g. extracting uploaded logo dimensions)

### `archiver`

- streams the per-event image ZIP export (`/api/admin/events/[id]/export/images?format=zip`)
  as a Node stream converted to a web `ReadableStream`, capped at 500 files

### `resend`

- transactional email delivery (submission notifications and try-on result emails)
- per-event template overrides and sender-name settings; defaults in `lib/email/submission-template-defaults.ts`

### `@sovereignsquad/gds-*` and Mantine 8.3

- `gds-core` / `gds-admin` / `gds-theme` 6.3.0 provide the design-system runtime, admin primitives, and theming; all five `@sovereignsquad/gds-*` packages install from vendored release tarballs (`vendor/gds/*.tgz`, `file:` specs, since v12.3.29)
- `gds-compliance` and `gds-eslint-config` back the `gds:check` / `gds:validate-manifest` gate

### Local try-on worker integration

- Camera writes queue state to MongoDB Atlas
- the official worker lives in the separate try-on worker repository (cloned alongside this repo on operator machines)
- Camera finalizes generated assets through signed internal callbacks instead of running the processor in-process

### `@vercel/blob`

- primary image storage (see Vercel Blob above)

### `@upstash/ratelimit` and `@upstash/redis`

- optional shared rate-limiter backend

## Build and quality tools

- `eslint` 9
- `eslint-config-next` 16
- `tsx`
- `tsc --noEmit`
- `playwright` — E2E suite (24 tests across 8 spec files) run serially against a dedicated test database; `npm run test:e2e:safe` preflights env + the disposable-DB guard

## Hosting and deployment

- Vercel (project `narimato/04_camera`); production domain `camera.messmass.com`
- Next: `package.json` `^16.2.11`, lockfile resolves `16.3.2` (2 critical Dependabot
  advisories open on it as of 2026-09-28; the Dependabot PR to `16.3.3` is open)
- every push to `main` auto-deploys via the Vercel Git integration; the deploy does not wait
  for GitHub Actions CI; see [RUNBOOK.md](RUNBOOK.md)

## Useful scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run type-check
npm run db:ensure-indexes
npm run db:verify-uri
npm run env:verify
npm run test:e2e:safe
npm run verify:production-guards
```

## Current tradeoffs

### Strengths

- one repository for public, admin, and slideshow surfaces
- shared auth/session model
- flexible Mongo document model for evolving product areas
- low-ops media hosting and deployment model

### Known operational constraints

- submission/media lifecycle depends on Vercel Blob (imgbb only as mirror; older photos still served from `i.ibb.co`)
- some collection shapes are compatibility-driven and broader than the hot runtime path actually persists
- partner-scoped authorization is newer than the original global-admin model, so docs and code must be kept in sync deliberately

## Canonical dependency source

When versions change, `package.json` is the source of truth. This file should summarize the stack, not override it.
