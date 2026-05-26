# Camera GDS Adoption

**Version**: 2.10.0  
**Last Updated**: 2026-05-26

## SSOT statement

[sovereignsquad/general-design-system](https://github.com/sovereignsquad/general-design-system) (GDS **v2.4.3**) is the single source of truth for design, UI, and UX across the portfolio.

This file and other Camera docs describe only **implementation adapters**, migration state, validation commands, and approved exceptions. If a Camera-local UI document conflicts with the GDS repository, **the GDS repository wins**.

Local checkout path (when available): `/Users/Shared/Projects/GENERAL_DESIGN_SYSTEM`

## Purpose

Camera is the reference implementation of the portfolio GDS on **Mantine 9**. App, admin, and public surfaces now consume **local GDS entrypoints only**. The remaining exceptions are composition-level surfaces such as capture, slideshow playback, and user-authored landing-page CSS, not parallel runtime UI systems.

## Root runtime

| Concern | Camera adapter |
|---------|----------------|
| Theme | `lib/gds/theme.ts` (`cameraMantineTheme`) |
| Root provider | `components/gds/CameraGdsProvider.tsx` |
| Notifications | `@mantine/notifications` in provider |
| Modals / confirm | `@mantine/modals` + `lib/gds/confirm-destructive.tsx` (no separate CSS import in Mantine 9) |
| Adoption manifest | `gds-adoption.json` |

## Pattern adapter inventory

| GDS pattern family | Camera adapter | Status |
|--------------------|----------------|--------|
| App shell (admin) | `components/gds/AdminShell.tsx` | Active |
| Semantic navigation link | `components/gds/SemanticNavLink.tsx` | Active |
| Page header | `components/gds/WorkspaceHeader.tsx` (extends SSOT `PageHeader` with eyebrow + status) | Active |
| Workspace header | `components/gds/WorkspaceHeader.tsx` | Active |
| Metric strip | `components/gds/StatsStrip.tsx` | Active |
| Info card | `components/gds/InfoCard.tsx` | Active |
| Action entry grid | `components/gds/ActionCardGrid.tsx` | Active |
| Data toolbar | `components/gds/DataToolbar.tsx` | Active — Events + Partners lists |
| Responsive data view | `components/gds/ResponsiveDataView.tsx` | Active — Events + Partners lists |
| Data table | `components/gds/DataTable.tsx` | Active |
| Empty state | `components/gds/EmptyState.tsx` | Active |
| Access summary | `components/gds/AccessSummary.tsx` | Active |
| Status badge | `components/gds/StatusBadge.tsx` | Active |
| State block | `components/gds/StateBlock.tsx` | Active — reference: Events list + edit |
| Form section | `components/gds/FormSection.tsx` | Active — Event edit/new, Frame edit |
| Editor scaffold | `components/gds/EditorScaffold.tsx` | Active — Event edit, Partner edit/new |
| Upload dropzone | `components/gds/UploadDropzone.tsx` | Active — Frame, Logo, Landing Page uploads |
| Media card | `components/gds/MediaCard.tsx` | Active — Frame, Logo, Event, Landing Page previews |
| Destructive confirm | `lib/gds/confirm-destructive.tsx` | Active — delete/remove admin actions |
| Public shell | `components/gds/PublicShell.tsx` | Active — home, profile, share |
| Public surface shell | `components/gds/PublicSurfaceShell.tsx` | Active — implementation adapter behind `PublicShell` |
| Try-On app workspace | `app/admin/tryon/**` composed from local GDS primitives | Active |
| Auth / public capture shell | `app/capture/**`, `components/capture/**`, `components/camera/**` via local GDS entrypoints and capture-specific composition | Active |
| Slideshow playback | `components/slideshow/**` | **Exception** (media-first) |
| Landing page editor CSS | `components/admin/LandingPageEditor.tsx` | **Exception** (editor preview) |

## Approved exceptions

| Surface | Reason | Removal condition |
|---------|--------|-------------------|
| Event capture flow (`app/capture/**`) | Complex camera/composite UX still uses legacy button/token layer | Replace with Mantine public capture shell + controls |
| `app/globals.css` `--app-btn-*` / `--app-panel-*` | Legacy token layer remains for capture and residual public helpers | Phase out when capture migrates to Mantine |
| Landing page custom CSS | User-authored experience content | Admin chrome stays Mantine; guest CSS remains editor-owned |
| Slideshow player | Full-screen media playback | Surrounding admin config uses Mantine only |

## Core rules

1. Mantine is the mandatory runtime UI foundation for Camera.
2. Shared admin patterns must exist in `components/gds` before they are repeated across pages.
3. New admin screens consume GDS primitives first — no page-local shells, toolbars, or state blocks.
4. Tailwind / `globals.css` tokens are **not** authority for `/admin/**`.
5. No file outside `components/gds/**` or `lib/gds/**` may import `@mantine/*` directly.
6. Business logic and route behavior stay stable while UI migrates underneath.

## Migration order

1. ~~Theme and provider wiring~~ (done)
2. ~~Admin shell~~ (done)
3. Inventory tables + toolbar + responsive list — complete at local-adapter level
4. Workspaces — complete at local-adapter level; refinements continue
5. Forms and editors — active; core editors use GDS scaffolds and sections
6. Statuses, permissions, enablement language — active
7. Landing-page editor alignment — active
8. Public capture shell migration — active; capture uses local GDS entrypoints with capture-specific composition
9. Consume or align with `@gds/*` packages when Mantine major versions match — **blocked**

## Shared package alignment

Direct package consumption from `/Users/Shared/Projects/GENERAL_DESIGN_SYSTEM/packages/*` is currently blocked in Camera.

Current state:

- Camera runtime: Mantine `9.2.1`, React `19.2.0`
- Shared `@gds/*` packages: version `2.4.3`, Mantine `^7.9.0`, React `^18.2.0 || ^19.0.0`

Required rule until the SSOT packages are upgraded:

- Camera must align to the **contracts and patterns** from the GDS repository
- Camera must not import the shared `@gds/*` packages directly until Mantine / React majors match

## Formal compliance path

Camera now declares its governed local adapter state in [gds-adoption.json](/Users/Shared/Projects/venturecogroup/camera/gds-adoption.json).

Current compliance position:

- SSOT repo/version is declared
- local adapters and approved exceptions are enumerated
- direct shared-package consumption remains intentionally blocked by the Mantine-major mismatch
- Camera is now governed at the import boundary: no direct Mantine imports exist outside the GDS layer
- remaining exception surfaces are composition-specific, not parallel UI foundations

## What must not happen

- No parallel second admin shell
- No page-specific table/toolbar/state pattern when a GDS primitive exists
- No new `--app-panel-*` styling under `app/admin/**`
- No raw `alert()` for admin feedback — use notifications or modals
- No direct copying of Mantine UI demos without a GDS contract

## Validation

```bash
npm run type-check
npm run lint
```

## References

- [docs/GDS_COMPONENT_RULES.md](/Users/Shared/Projects/venturecogroup/camera/docs/GDS_COMPONENT_RULES.md)
- [GDS FOUNDATION](https://github.com/sovereignsquad/general-design-system/blob/main/FOUNDATION.md)
- [GDS COMPONENTS_AND_PATTERNS](https://github.com/sovereignsquad/general-design-system/blob/main/COMPONENTS_AND_PATTERNS.md)
- [GDS GOVERNANCE_AND_ADOPTION](https://github.com/sovereignsquad/general-design-system/blob/main/GOVERNANCE_AND_ADOPTION.md)
- [GDS COMPATIBILITY_AND_RELEASES](https://github.com/sovereignsquad/general-design-system/blob/main/COMPATIBILITY_AND_RELEASES.md)
