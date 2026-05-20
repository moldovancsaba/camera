# Tech Stack

**Version**: 2.9.0  
**Last Updated**: 2026-05-20

This document records the current technical stack in use and the parts of the product each technology supports.

## Core application

### Next.js 16

- App Router architecture
- server components for page/data composition
- client components for interactive admin, capture, slideshow, and workout surfaces
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

- supported by package `engines`: 18.x, 20.x, 22.x

### MongoDB Atlas

Primary persistence layer for:

- partners
- events
- frames and logos
- submissions
- slideshows and slideshow layouts
- landing pages
- partner-scoped access assignments
- Gym / FFF settings and workout data
- server-side web session storage

### imgbb

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
- Gym App settings and training content
- partner user assignment UI

### Gym / FFF

- virtual event bootstrap
- workout lesson catalog
- session logging
- selfie capture and share

## Key library choices

### `mongodb`

- primary database driver
- direct collection access
- server-side index management via scripts

### `axios`

- outbound HTTP requests where used, especially external service integrations

### `@upstash/ratelimit` and `@upstash/redis`

- optional shared rate-limiter backend

## Build and quality tools

- `eslint` 9
- `eslint-config-next` 16
- `tsx`
- `tsc --noEmit`

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
```

## Current tradeoffs

### Strengths

- one repository for public, admin, slideshow, and Gym surfaces
- shared auth/session model
- flexible Mongo document model for evolving product areas
- low-ops media hosting and deployment model

### Known operational constraints

- submission/media lifecycle depends on imgbb
- some collection shapes are compatibility-driven and broader than the hot runtime path actually persists
- partner-scoped authorization is newer than the original global-admin model, so docs and code must be kept in sync deliberately

## Canonical dependency source

When versions change, `package.json` is the source of truth. This file should summarize the stack, not override it.
