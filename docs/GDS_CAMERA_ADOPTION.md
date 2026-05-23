# Camera GDS Adoption

## Purpose

Camera is the first reference implementation of the portfolio GDS on top of Mantine.

The objective is not to sprinkle Mantine components onto existing pages. The objective is to move Camera admin onto a repeatable system that can later be reused across projects.

## Core Rules

1. Mantine is the mandatory runtime UI foundation for new admin work.
2. Shared admin patterns must be implemented as GDS primitives before they are repeated across multiple pages.
3. New admin screens should consume GDS primitives first, not invent page-local layout systems.
4. Tailwind utility classes may remain during migration, but they are transitional in admin surfaces that are moving to the GDS layer.
5. Business logic and route behavior must remain stable while the UI foundation changes underneath.

## Current GDS Scope In Camera

The initial local GDS layer lives in `components/gds` and `lib/gds`.

Current foundation primitives:

- `CameraGdsProvider`
- `AdminShell`
- `WorkspaceHeader`
- `StatsStrip`
- `ActionCardGrid`

Current theme foundation:

- `lib/gds/theme.ts`

## Migration Order

The required execution order for Camera is:

1. theme and provider wiring
2. admin shell
3. inventory and audit tables
4. workspaces
5. forms and editors
6. statuses, permissions, and enablement language
7. landing-page editor alignment
8. cross-project extraction planning

## What Must Not Happen

- no parallel second admin shell
- no page-specific table pattern when a shared table is available
- no page-specific workspace header pattern when `WorkspaceHeader` fits
- no new local status badge language
- no direct copying of Mantine demo layouts into production without adaptation into the GDS contract

## Extraction Intent

Camera is still the proving ground. Stable primitives should stay local until they are proven across enough screens. After that, the extraction candidate set should move toward a shared package structure for portfolio reuse.
