# Camera GDS Component Rules

## Goal

These rules define how Mantine-backed GDS primitives should be introduced and used inside Camera.

## Primitive Categories

### Foundation

Foundation components establish the system language and should be broadly reusable.

Examples:

- provider
- theme
- shell
- headers
- stats
- forms
- tables
- badges

### Domain Compositions

Domain compositions are Camera-specific assemblies built from foundation primitives.

Examples:

- Partner workspace
- Event workspace
- Gym workspace
- Landing page manager/editor
- submission review panels

## Acceptance Criteria For A New Primitive

Every new GDS primitive should define:

1. what problem it solves
2. where it should be used
3. where it should not be used
4. loading behavior
5. empty behavior if relevant
6. error behavior if relevant
7. responsive behavior
8. accessibility expectations

## Usage Rules

1. Prefer GDS primitives over direct Mantine composition in admin pages.
2. Use direct Mantine composition when building or refining a primitive, not when bypassing one.
3. Keep domain-specific logic out of foundation primitives.
4. Keep visual tokens inside the Mantine theme or documented system-level props rather than scattered per page.

## Current Admin Primitive Direction

### `AdminShell`

Use for:

- all `/admin/**` surfaces that need the standard sidebar/header/frame

Do not use for:

- public capture, share, slideshow, or workout flows

### `WorkspaceHeader`

Use for:

- Partner, Event, Gym, and major resource overview pages

Do not use for:

- tiny edit subpages that only need a compact title row

### `StatsStrip`

Use for:

- summary metrics
- operational overview counts

Do not use for:

- vanity metrics with no user action

### `ActionCardGrid`

Use for:

- top-level workspace actions
- inventory/management entry points

Do not use for:

- long data lists that should be tables

## Migration Guidance

When touching an admin screen:

1. check whether a GDS primitive already exists
2. use it if it fits
3. improve the primitive if the gap is generic
4. only build a new local composition if the need is domain-specific

The default response to repeated UI structure should be to strengthen the GDS, not to duplicate more layout code.
