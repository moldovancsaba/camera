# Camera GDS Adoption

**Version**: 2.10.0  
**Last Updated**: 2026-06-01

## SSOT statement

[sovereignsquad/general-design-system](https://github.com/sovereignsquad/general-design-system) (SSOT docs and published bundle now **v3.0.0**) is the single source of truth for design, UI, and UX across the portfolio.

This file and other Camera docs describe only **implementation adapters**, migration state, validation commands, and approved exceptions. If a Camera-local UI document conflicts with the GDS repository, **the GDS repository wins**.

Local checkout path (when available): `/Users/Shared/Projects/general-design-system`

Exception standard:

- reusable exception contract: [docs/GDS_EXCEPTION_STANDARD.md](/Users/Shared/Projects/venturecogroup/camera/docs/GDS_EXCEPTION_STANDARD.md)

## Purpose

Camera is the reference implementation of the portfolio GDS on the currently validated Mantine 8 line. App, admin, and public surfaces now consume package-backed provider/theme/compliance entrypoints, with local adapter families still present where Camera-specific coverage remains incomplete.

## Root runtime

| Concern | Camera adapter |
|---------|----------------|
| App Router client boundary | `app/providers.tsx` |
| Theme | package-direct `@doneisbetter/gds-theme/server` default `gdsTheme` |
| Root provider | `components/gds/CameraGdsProvider.tsx` wrapping `@doneisbetter/gds-theme/client` `GdsProvider` without local theme extension |
| Notifications | Shared provider composition from `@doneisbetter/gds-theme/client` |
| Modals / confirm | Shared provider composition + `lib/gds/confirm-destructive.tsx` |
| Adoption manifest | `gds-adoption.json` |

## Pattern adapter inventory

| GDS pattern family | Camera adapter | Status |
|--------------------|----------------|--------|
| Semantic navigation link | `components/gds/SemanticNavLink.tsx` | Active |
| Metric strip | direct `@doneisbetter/gds-admin` import | Package-direct |
| Info card | direct `@doneisbetter/gds-core` import | Package-direct |
| Action entry grid | `components/gds/AdminDashboardView.tsx`, `app/admin/tryon/page.tsx`, `app/admin/tryon-results/page.tsx` | Package-direct |
| Data toolbar | `components/admin/AdminListPageShell.tsx` | Package-direct |
| Responsive data view | `components/gds/EventsInventoryList.tsx`, `components/gds/PartnersInventoryList.tsx`, `components/admin/TryOnResultModerationTable.tsx` | Thin adapter (`components/gds/ResponsiveDataView.tsx`) |
| Data table | `components/gds/LandingPagesPageView.tsx`, `components/admin/TryOnQueueTable.tsx` | Thin adapter (`components/gds/DataTable.tsx`) |
| Empty state | direct `@doneisbetter/gds-core` import | Package-direct |
| Access summary | direct `@doneisbetter/gds-core` import | Package-direct |
| Status badge | direct `@doneisbetter/gds-core` import | Package-direct |
| State block | direct `@doneisbetter/gds-core` import | Package-direct |
| Form section | direct `@doneisbetter/gds-admin` import | Package-direct |
| Editor scaffold | `app/admin/{events,events/[id],partners,partners/[id],frames,logos,tryon}/**` | Thin adapter (`components/gds/EditorScaffold.tsx`) |
| Upload dropzone | direct `@doneisbetter/gds-core` import | Package-direct |
| Destructive confirm | `lib/gds/confirm-destructive.tsx` | Active — delete/remove admin actions |
| Root provider adapter | `components/gds/CameraGdsProvider.tsx` | Active |
| Public shell | `components/public/PublicPageShell.tsx` | Domain-owned composition over package `PublicShell` |
| App shell (admin) | `components/admin/AdminChrome.tsx` | Domain-owned composition over package `AppShell` |
| Page header / workspace header | `components/admin/WorkspaceHeader.tsx` | Domain-owned composition over package `PageHeader` |
| Admin list page assembly | `components/admin/AdminListPageShell.tsx` | Domain-owned composition over package admin surfaces |
| Media preview card | `components/media/MediaPreviewCard.tsx` | Domain-owned composition over package/Core primitives |
| Try-On app workspace | `app/admin/tryon/**` composed from local GDS primitives | Active |
| Auth / public capture shell | `components/capture/CaptureStageShell.tsx`, `components/capture/**`, `app/capture/**` | Active — `PublicFlowShell` for onboarding/share stages plus capture-specific runtime composition |
| Landing legal pages | `components/public/LandingLegalDocument.tsx`, `app/landing/[slug]/{privacy,terms}/page.tsx` | Active — `ArticleShell` inside package-backed public utility surface |
| Slideshow playback | `components/slideshow/**` | Active — `PlaybackSurface` framing plus runtime-specific media orchestration |
| Landing page editor CSS | `components/admin/LandingPageEditor.tsx` | **Exception** (editor preview) |

## Boundary classification

### Retained package-boundary adapters

- `components/gds/CameraGdsProvider.tsx`
- `components/gds/DataTable.tsx`
- `components/gds/ResponsiveDataView.tsx`
- `components/gds/EditorScaffold.tsx`
- `lib/gds/confirm-destructive.tsx`

  - `DataTable`, `ResponsiveDataView`, and `EditorScaffold` are thin compatibility adapters used for API alignment and local UX orchestration in admin surfaces.

### Domain-owned composition moved out of `components/gds`

- `components/admin/AdminChrome.tsx`
- `components/admin/WorkspaceHeader.tsx`
- `components/admin/AdminListPageShell.tsx`
- `components/public/PublicPageShell.tsx`
- `components/public/LandingLegalDocument.tsx`
- `components/media/MediaPreviewCard.tsx`

### Deleted local design-system authority

- `components/ui/AppButton.tsx`
- `components/gds/ui.ts`
- `components/gds/EmptyState.tsx`
- `components/gds/AccessSummary.tsx`
- `components/gds/StateBlock.tsx`
- `components/gds/FormSection.tsx`
- `components/gds/StatsStrip.tsx`
- `components/gds/InfoCard.tsx`
- `components/gds/StatusBadge.tsx`
- former `components/gds` shell/card wrappers replaced by domain-owned components or direct package usage

## Approved exceptions

Camera exceptions follow the shared structure from [docs/GDS_EXCEPTION_STANDARD.md](/Users/Shared/Projects/venturecogroup/camera/docs/GDS_EXCEPTION_STANDARD.md).

| Surface | Category | Boundary | What is still mandatory | Exit condition |
|---------|----------|----------|--------------------------|----------------|
| Event capture runtime (`app/capture/[eventId]/page.tsx`, `components/camera/CameraCapture.tsx`, frame-selection and preview overlays) | Runtime constraint | Live camera preview, frame compositing, and fullscreen preview-stage orchestration | GDS provider/theme runtime, `PublicFlowShell` for onboarding/share stages, accessible controls, explicit loading/error states | Keep narrowing until only the irreducible hardware-preview and frame-compositing region remains outside direct package ownership |
| Residual public surface helper layer (`app/globals.css` helper classes and `--app-panel-*` tokens) | Migration bridge | Limited public/capture helper styling outside `/admin/**` | No second shell system, no admin reuse, no raw package bypass, accessibility and contrast still enforced | Remove once public/capture surfaces no longer depend on local helper classes |
| Landing page custom CSS (`landing_pages.customCss`, public `/landing/[slug]`) | Product-authored experience | Creator-authored presentation inside the landing experience surface only | GDS-governed admin/editor chrome, safe rendering order, accessibility baseline for shared controls and consent surfaces | Long-lived approved exception unless GDS later formalizes creator-authored experience theming |
| Slideshow player (`components/slideshow/**`, `/slideshow/**`) | Runtime constraint | Timing-sensitive queue orchestration, fullscreen behavior, and media-first presentation | GDS runtime boundary, `PlaybackSurface` framing, surrounding admin configuration surfaces, visible error/empty states, keyboard-safe exit where applicable | Keep narrowing until only timing-sensitive queue, fullscreen behavior, and media internals remain outside direct package ownership |

## Published package capability snapshot

Camera is currently pinned to the latest published release bundle, `@doneisbetter/*` **3.0.0**.

### Available now in the published package line

- public/editorial primitives: `PublicShell`, `PublicFlowShell`, `ArticleShell`, `DocsPageShell`, `AuthShell`, `BrowseSurface`, `EditorialHero`, `FeatureBand`, `ConsumerSection`, `ConsumerDashboardGrid`, `MediaField`, `PublicBrandFooter`, `MapPanel`, `PlaybackSurface`
- admin/ops primitives: `AppShell`, `PageHeader`, `WorkspaceHeader`, `ResponsiveDataView`, `StatsStrip`, `ContentOpsEditor`, `ContentOpsSection`, `ContentOpsActionBar`, `FormSection`
- shared state and utility primitives: `EmptyState`, `StateBlock`, `StatusBadge`, `AccessSummary`, `MediaCard`, `ProductCard`, `ActionBar`

## Core rules

1. Mantine is the mandatory runtime UI foundation for Camera.
2. Shared admin patterns must consume package contracts first; only true package-boundary adapters belong in `components/gds`, while domain composition belongs in domain folders.
3. New admin screens consume GDS primitives first — no page-local shells, toolbars, or state blocks.
4. Tailwind / `globals.css` tokens are **not** authority for `/admin/**`.
5. Direct `@mantine/core` imports are allowed for leaf controls and layout glue under the GDS provider, but no repo-local barrel may masquerade as a second UI authority.
6. Business logic and route behavior stay stable while UI migrates underneath.

## Migration order

1. ~~Theme and provider wiring~~ (done)
2. ~~Admin shell~~ (done)
3. Inventory tables + toolbar + responsive list — complete at local-adapter level
4. Workspaces — complete at local-adapter level; refinements continue
5. Forms and editors — active; core editors use GDS scaffolds and sections
6. Statuses, permissions, enablement language — active
7. Landing-page editor alignment — creator CSS contract preserved; editor and legal utility surfaces use GDS-backed shells
8. Public capture shell migration — active; onboarding and share stages now use `PublicFlowShell` while live capture and preview orchestration remain the intentional runtime exception
9. Replace the remaining thin adapter families one contract family at a time with direct `@doneisbetter/gds-*` consumption where package typing and behavior make the bridge unnecessary

## Shared package alignment

Camera now uses the real `@doneisbetter/*` package line through the temporary supported GitHub release-asset tarballs.

Current state:

- Camera runtime: Mantine `8.3.6`, React `19.2.0`
- Shared `@doneisbetter/*` packages: version `2.6.4`, Mantine `^7.9.0 || ^8.3.0 || ^9.0.0`, React `^18.2.0 || ^19.0.0`

Required rule until npm publication is live:

- Camera must align to the **contracts and patterns** from the GDS repository
- Camera must consume the release-asset-backed `@doneisbetter/*` packages at the provider/theme/compliance boundary until npm publication is live
- Camera must continue shrinking local adapters as central package coverage and compatibility improve

## Formal compliance path

Camera now declares its governed local adapter state in [gds-adoption.json](/Users/Shared/Projects/venturecogroup/camera/gds-adoption.json).

Current compliance position:

- SSOT repo/version is declared
- local adapters and approved exceptions are enumerated
- release-asset package consumption is live on a Mantine version that satisfies the current GDS peer contract
- Camera is now governed at the runtime boundary: Mantine is consumed directly where needed, but shell/card/table/toolbar/state authority stays aligned to published GDS contracts
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
