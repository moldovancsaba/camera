# Camera GDS Adoption

**Version**: 2.9.0  
**Last Updated**: 2026-05-24

## SSOT statement

[general-design-system](https://github.com/moldovancsaba/general-design-system) (GDS **v2.2.0+**) is the single source of truth for design, UI, and UX across the portfolio.

This file and other Camera docs describe only **implementation adapters**, migration state, validation commands, and approved exceptions. If a Camera-local UI document conflicts with the GDS repository, **the GDS repository wins**.

Local checkout path (when available): `/Users/Shared/Projects/GENERAL_DESIGN_SYSTEM`

## Purpose

Camera is the reference implementation of the portfolio GDS on **Mantine 9**. Admin surfaces must use shared GDS contracts; public capture remains the only broad UI exception until fully migrated.

## Root runtime

| Concern | Camera adapter |
|---------|----------------|
| Theme | `lib/gds/theme.ts` (`cameraMantineTheme`) |
| Root provider | `components/gds/CameraGdsProvider.tsx` |
| Notifications | `@mantine/notifications` in provider |
| Modals / confirm | `@mantine/modals` + `lib/gds/confirm-destructive.tsx` (no separate CSS import in Mantine 9) |

## Pattern adapter inventory

| GDS pattern family | Camera adapter | Status |
|--------------------|----------------|--------|
| App shell (admin) | `components/gds/AdminShell.tsx` | Active |
| Page header | `components/gds/WorkspaceHeader.tsx` (extends SSOT `PageHeader` with eyebrow + status) | Active |
| Metric strip | `components/gds/StatsStrip.tsx` | Active |
| Action entry grid | `components/gds/ActionCardGrid.tsx` | Active |
| Data toolbar | `components/gds/DataToolbar.tsx` | Active — Events + Partners lists |
| Responsive data view | `components/gds/ResponsiveDataView.tsx` | Active — Events + Partners lists |
| Data table | `components/gds/DataTable.tsx` | Active |
| Empty state | `components/gds/EmptyState.tsx` | Active |
| Status badge | `components/gds/StatusBadge.tsx` | Active |
| State block | `components/gds/StateBlock.tsx` | Active — reference: Events list + edit |
| Form section | `components/gds/FormSection.tsx` | Active — Event edit/new, Frame edit |
| Destructive confirm | `lib/gds/confirm-destructive.tsx` | Active — delete/remove admin actions |
| Public surface shell | `components/gds/PublicSurfaceShell.tsx` | Active — home, profile, share |
| Auth / public capture shell | `app/capture/**`, `app/globals.css` | **Exception** (see below) |
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

1. Mantine is the mandatory runtime UI foundation for **new and migrated admin work**.
2. Shared admin patterns must exist in `components/gds` before they are repeated across pages.
3. New admin screens consume GDS primitives first — no page-local shells, toolbars, or state blocks.
4. Tailwind / `globals.css` tokens are **not** authority for `/admin/**`.
5. Business logic and route behavior stay stable while UI migrates underneath.

## Migration order

1. ~~Theme and provider wiring~~ (done)
2. ~~Admin shell~~ (done)
3. Inventory tables + toolbar + responsive list — **active** (core inventory screens migrated)
4. Workspaces — **active** (major partner/event admin workspaces migrated; refinements continue)
5. Forms and editors — **in progress** (major forms migrated; editor consistency remains)
6. Statuses, permissions, enablement language — partial
7. Landing-page editor alignment — backlog
8. Public capture shell migration — **in progress** (home/profile/share moved; capture flow remains)
9. Consume or align with `@gds/*` packages when Mantine major versions match — **blocked**

## Shared package alignment

Direct package consumption from `/Users/Shared/Projects/GENERAL_DESIGN_SYSTEM/packages/*` is currently blocked in Camera.

Current state:

- Camera runtime: Mantine `9.2.1`, React `19.2.0`
- Shared `@gds/*` packages: version `2.0.0`, Mantine `^7.9.0`, React `^18.2.0`

Required rule until the SSOT packages are upgraded:

- Camera must align to the **contracts and patterns** from the GDS repository
- Camera must not import the shared `@gds/*` packages directly until Mantine / React majors match

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
- [GDS FOUNDATION](https://github.com/moldovancsaba/general-design-system/blob/main/FOUNDATION.md)
- [GDS COMPONENTS_AND_PATTERNS](https://github.com/moldovancsaba/general-design-system/blob/main/COMPONENTS_AND_PATTERNS.md)
- [GDS GOVERNANCE_AND_ADOPTION](https://github.com/moldovancsaba/general-design-system/blob/main/GOVERNANCE_AND_ADOPTION.md)
