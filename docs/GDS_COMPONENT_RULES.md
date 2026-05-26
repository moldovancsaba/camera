# Camera GDS Component Rules

## Goal

These rules define how Mantine-backed GDS primitives should be introduced and used inside Camera.

Current SSOT alignment target:

- GDS version: `2.4.3`
- Camera aligns to the shared contracts locally until direct package consumption is possible

Compliance artifact:

- [gds-adoption.json](/Users/Shared/Projects/venturecogroup/camera/gds-adoption.json) is the machine-readable declaration of Camera's active contract coverage, exceptions, and migration state.

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
5. Files outside `components/gds/**` and `lib/gds/**` must not import `@mantine/*` directly.

## Current Admin Primitive Direction

### `AdminShell`

Use for:

- all `/admin/**` surfaces that need the standard sidebar/header/frame

Do not use for:

- public capture, share, or slideshow flows

### `WorkspaceHeader`

Use for:

- Partner, Event, and major resource overview pages

Do not use for:

- tiny edit subpages that only need a compact title row

### `SemanticNavLink`

Use for:

- admin navigation items with semantic active/inactive states

Do not use for:

- public navigation or inline text links inside content

### `InfoCard`

Use for:

- concise explanatory or orientation cards in dashboards, workspace overviews, and inventory intros

Do not use for:

- dense metric output that belongs in `StatsStrip`
- long-form content sections

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

### `DataToolbar`

Use for:

- list page search, filters, clear/reset, and secondary navigation actions

Do not use for:

- inline forms inside modals or one-off filter popovers without a list context

### `ResponsiveDataView`

Use for:

- any admin table that must remain usable on mobile (pair with card/list `mobile` slot)

Do not use for:

- single-column forms or dashboards without tabular data

### `StateBlock`

Use for:

- loading, empty, error, and permission states on admin pages

Do not use for:

- transient toast feedback (use notifications) or field-level validation (use input error props)

### `AccessSummary`

Use for:

- permission and scope summaries
- partner- or user-level access snapshots

Do not use for:

- editable permission matrices
- full audit trails

### `FormSection`

Use for:

- grouped admin form fields with a title and optional description

Do not use for:

- entire multi-step wizards without section boundaries

### `EditorScaffold`

Use for:

- edit/create pages that need breadcrumbs, a consistent header, and a centered editing column

Do not use for:

- dashboards, list pages, or non-editor workspaces

### `UploadDropzone`

Use for:

- admin upload flows for media, overlays, logos, and editor-owned assets

Do not use for:

- tiny inline single-file inputs where drag/drop would add more chrome than value

### `MediaCard`

Use for:

- image and asset previews with optional contextual actions

Do not use for:

- large gallery grids that belong to dedicated gallery/list patterns

### `PublicShell`

Use for:

- home, profile, share, and other non-capture public surfaces that need the shared page shell

Do not use for:

- full-screen camera capture or slideshow playback flows

### `confirmDestructive` (`lib/gds/confirm-destructive.tsx`)

Use for:

- irreversible delete/disable actions in client components

Do not use for:

- non-destructive confirmations (use `modals.openConfirmModal` with neutral confirm color)

## Migration Guidance

When touching an admin screen:

1. check whether a GDS primitive already exists
2. use it if it fits
3. improve the primitive if the gap is generic
4. only build a new local composition if the need is domain-specific

The default response to repeated UI structure should be to strengthen the GDS, not to duplicate more layout code.
