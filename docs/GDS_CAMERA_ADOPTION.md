# Camera GDS Adoption

**Version**: 2.9.0  
**Last Updated**: 2026-05-23

## SSOT statement

[general-design-system](https://github.com/moldovancsaba/general-design-system) (GDS **v2.2.0+**) is the single source of truth for design, UI, and UX across the portfolio.

This file and other Camera docs describe only **implementation adapters**, migration state, validation commands, and approved exceptions. If a Camera-local UI document conflicts with the GDS repository, **the GDS repository wins**.

Local checkout path (when available): `/Users/Shared/Projects/GENERAL_DESIGN_SYSTEM`

## Purpose

Camera is the reference implementation of the portfolio GDS on **Mantine 9**. Admin surfaces must use shared GDS contracts; public capture flows may remain on documented CSS exceptions until migrated.

## Root runtime

| Concern | Camera adapter |
|---------|----------------|
| Theme | `lib/gds/theme.ts` (`cameraMantineTheme`) |
| Root provider | `components/gds/CameraGdsProvider.tsx` |
| Notifications | `@mantine/notifications` in provider |
| Modals / confirm | `@mantine/modals` + `lib/gds/confirm-destructive.tsx` |

## Pattern adapter inventory

| GDS pattern family | Camera adapter | Status |
|--------------------|----------------|--------|
| App shell (admin) | `components/gds/AdminShell.tsx` | Active |
| Page header | `components/gds/WorkspaceHeader.tsx` (extends SSOT `PageHeader` with eyebrow + status) | Active |
| Metric strip | `components/gds/StatsStrip.tsx` | Active |
| Action entry grid | `components/gds/ActionCardGrid.tsx` | Active |
| Data toolbar | `components/gds/DataToolbar.tsx` | Active — reference: Events list |
| Responsive data view | `components/gds/ResponsiveDataView.tsx` | Active — reference: Events list |
| Data table | `components/gds/DataTable.tsx` | Active |
| Status badge | `components/gds/StatusBadge.tsx` | Active |
| State block | `components/gds/StateBlock.tsx` | Active — reference: Events list + edit |
| Form section | `components/gds/FormSection.tsx` | Active — reference: Event edit |
| Destructive confirm | `lib/gds/confirm-destructive.tsx` | Active — reference: `DeleteEventButton` |
| Auth / public capture shell | `app/page.tsx`, `app/capture/**`, `app/globals.css` | **Exception** (see below) |
| Slideshow / share playback | `components/slideshow/**` | **Exception** (media-first) |
| Landing page editor CSS | `components/admin/LandingPageEditor.tsx` | **Exception** (editor preview) |

## Approved exceptions

| Surface | Reason | Removal condition |
|---------|--------|-------------------|
| Public capture, home, profile | Dark gradient guest UX predates Mantine public shell | Introduce `PublicCaptureShell` with Mantine dark theme or documented narrow CSS freeze |
| `app/globals.css` `--app-btn-*` / `--app-panel-*` | Legacy token layer for public flows | Phase out when capture migrates to Mantine |
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
3. Inventory tables + toolbar + responsive list — **in progress** (Events list is reference)
4. Workspaces — partial
5. Forms and editors — **in progress** (Event edit is reference)
6. Statuses, permissions, enablement language — partial
7. Landing-page editor alignment — backlog
8. Public capture shell decision — backlog
9. Consume or align with `@gds/*` packages when Mantine major versions match (GDS packages currently target Mantine 7)

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
