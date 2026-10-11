# Tech Stack

**Version**: 12.3.42  
**Last Updated**: 2026-10-11

This document records the current technical stack in use and the parts of the product each technology supports.

## Core application

### Next.js 16

- App Router architecture
- server components for page/data composition
- client components for interactive admin, capture, and slideshow surfaces
- route handlers for REST-style APIs
- root proxy (`proxy.ts`, the Next 16 name of middleware) for the session gate and host-based rewrites

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
- the Vercel project setting was recorded as Node 22.x on 2026-10-05 and is still an open owner item ([camera#182](https://github.com/moldovancsaba/camera/issues/182)); builds run on 24 because `engines.node` overrides it (per the build log). The setting lives in the Vercel dashboard only, so the repo cannot confirm it today: set it to 24.x and close the issue

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
- Camera session creation (a fixed 30-day session; there is no token refresh, the tokens are only revoked at logout)

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

### `@napi-rs/canvas`

- server-side drawing of generated frames, the default stage and the welcome page screen picture (`lib/frame/*`, `lib/screen/*`); listed in `serverExternalPackages` in `next.config.ts` because it is a native module

### `qrcode`

- the QR code drawn on the welcome page screen picture and on the giant-screen stage (`lib/screen/welcome-screen.ts`, `lib/slideshow/screen-design.ts`)

### `archiver`

- streams the per-event image ZIP export (`/api/admin/events/[id]/export/images?format=zip`)
  as a Node stream converted to a web `ReadableStream`, capped at 500 files; the archive is built in
  `lib/events/image-zip.ts` (`ZipArchive` of archiver 8, an ES module with no default export), which
  `lib/events/image-zip.test.ts` checks byte for byte

### `resend`

- transactional email delivery (submission notifications)
- per-event template overrides and sender-name settings; defaults in `lib/email/submission-template-defaults.ts`

### `@sovereignsquad/gds-*` and Mantine 8.3

- `gds-core` / `gds-admin` / `gds-theme` 6.8.0 provide the design-system runtime, admin primitives, and theming; all five `@sovereignsquad/gds-*` packages install from vendored release tarballs (`vendor/gds/*.tgz`, `file:` specs, since v12.3.29)
- `gds-compliance` and `gds-eslint-config` back the `gds:check` / `gds:validate-manifest` gate

### Try-on (removed)

- There is no try-on renderer or worker in this stack. The integration was switched off on 2026-09-30 and has been removed from the app (issue 557) except the guest path (the garment selector on the capture page and the try-on fields of `POST /api/submissions`), which the last phase deletes after the match of 2026-10-16; what existed and what a rebuild as an add-on needs is in [docs/TRYON_REMOVED.md](docs/TRYON_REMOVED.md), the old code at git tag `tryon-integration-final`.
- The try-on data it left in MongoDB Atlas stays, unreferenced.

### `@vercel/blob`

- primary image storage (see Vercel Blob above)

### `@upstash/ratelimit` and `@upstash/redis`

- optional shared rate-limiter backend

## Build and quality tools

- `eslint` 9
- `eslint-config-next` 16
- `tsx`
- `tsc --noEmit`
- `playwright` — E2E suite (18 tests across 4 spec files, listed with `npx playwright test --list` on 2026-10-11) run serially against a dedicated test database; `npm run test:e2e:safe` preflights env + the disposable-DB guard

## Hosting and deployment

- Vercel (project `narimato/04_camera`); production domain `camera.messmass.com`
- Next: `package.json` `^16.3.8`, lockfile resolves `16.3.8`; `npm audit --omit=dev` reports
  no advisory on the production tree (2026-10-11), see [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)
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

## Installed versions

Read with `npm ls --depth=0` on 2026-10-11 (Node 24.19, npm 10.9); `package.json` and
`package-lock.json` are the source of truth, this table only makes drift visible.

| Part | Installed | Declared in |
|------|-----------|-------------|
| Node.js | 24.x | `engines.node` `>=24.0.0 <25.0.0`, `.nvmrc` `24` |
| Next.js | 16.3.8 | `^16.3.8` |
| React, React DOM | 19.2.0 | `19.2.0` (exact) |
| TypeScript | 5.9.3 | `^5.9.3` |
| Tailwind CSS | 4.3.3 | `^4` |
| Mantine (core, dates, hooks, modals, notifications) | 8.3.18 | `^8.3.x` |
| GDS (`gds-core`, `gds-admin`, `gds-theme`, `gds-compliance`, `gds-eslint-config`) | 6.8.0 | `file:vendor/gds/*-6.8.0.tgz`, `gdsVersion` in `gds-adoption.json` |
| ESLint | 9.39.5 | `^9.39.5` |
| MongoDB driver | 6.21.0 | `^6.8.0` |
| Playwright | 1.61.1 | `^1.60.0` |

`@types/node` is on the 20 line (20.19.43) while the runtime is Node 24; it is a known gap listed in the
dependency audit.

## Dependency health

[docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) is the audit of 2026-10-11: advisories and why each is or is
not a problem, what was removed, updated and left alone, deprecated packages, the major updates not done
(with effort and risk), and the commands to repeat it.

## Canonical dependency source

When versions change, `package.json` is the source of truth. This file should summarize the stack, not override it.
