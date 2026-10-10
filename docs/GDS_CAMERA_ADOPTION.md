# Camera GDS Adoption

**Version**: 12.3.41  
**Last Updated**: 2026-09-28

## SSOT statement

[sovereignsquad/general-design-system](https://github.com/sovereignsquad/general-design-system) (SSOT docs and published bundle now **v6.8.0**) is the single source of truth for design, UI, and UX across the portfolio.

This file and other Camera docs describe only **implementation adapters**, migration state, validation commands, and approved exceptions. If a Camera-local UI document conflicts with the GDS repository, **the GDS repository wins**.

Local checkout path (when available): `/Users/Shared/Projects/general-design-system`

Exception standard:

- reusable exception contract: [docs/GDS_EXCEPTION_STANDARD.md](GDS_EXCEPTION_STANDARD.md)

## Purpose

Camera is the reference implementation of the portfolio GDS on the currently validated Mantine 8 line. App, admin, and public surfaces consume package-backed provider/theme/compliance entrypoints. Remaining local adapter families are compatibility shims only and must shrink whenever a package contract is available.

## Root runtime

| Concern | Camera adapter |
|---------|----------------|
| App Router client boundary | `app/providers.tsx` |
| Theme | package-direct `@sovereignsquad/gds-theme/server` default `gdsTheme` |
| Stylesheet | `app/layout.tsx` imports `@sovereignsquad/gds-theme/styles.css` (which inlines the Mantine core and notifications sheets) before `app/globals.css` since 2026-10-06; the former hand-copied fork `components/gds/gds-theme.css` is deleted. Inter is loaded by React resource hints (`preinit`/`preconnect`) in the root layout, because the package sheet's own Inter `@import` is dropped by Turbopack (see `LEARNINGS.md` FRONT-009) |
| Root provider | `components/gds/CameraGdsProvider.tsx` wrapping `@sovereignsquad/gds-theme/client` `GdsProvider` without local theme extension; v3.5 document color-scheme and root CSS variable selector are enabled |
| Notifications | Root `GdsNotificationProvider` / `GdsToastProvider` from `@sovereignsquad/gds-core/client` plus `showGdsNotification` from `@sovereignsquad/gds-theme/client` |
| Modals / confirm | Root `GdsConfirmProvider` / `OverlayManagerProvider` from `@sovereignsquad/gds-core/client`; legacy `lib/gds/confirm-destructive.tsx` remains a migration bridge |
| Adoption manifest | `gds-adoption.json` |
| Release gate | `.github/workflows/ci.yml` (`inventory:check` + `release:check`), [docs/GDS_RELEASE_GATE.md](GDS_RELEASE_GATE.md) |

## Pattern adapter inventory

| GDS pattern family | Camera adapter | Status |
|--------------------|----------------|--------|
| Semantic navigation link | `components/admin/SemanticNavLink.tsx` | Domain navigation composition; replace with package nav contract when compatible |
| Metric strip | direct `@sovereignsquad/gds-admin` import | Package-direct |
| Info card | direct `@sovereignsquad/gds-core` import | Package-direct |
| Action entry grid | `components/gds/AdminDashboardView.tsx`, `app/admin/tryon/page.tsx`, `app/admin/tryon/vetting/page.tsx` | Package-direct |
| Data toolbar | `components/admin/AdminListPageShell.tsx` | Package-direct |
| Admin resource cards, with media (Frames/Logos/Try-On Suits/Submissions) | `components/gds/FramesInventoryList.tsx`, `LogosInventoryList.tsx`, `TryOnSuitsInventoryList.tsx`, `SubmissionsInventoryList.tsx` | Package-direct `AdminResourceManager`/`AdminResourceCard` (`MediaPreviewCard` under the hood) — see [Known package limitations](#known-package-limitations-adminresourcecard--mediapreviewcard) below for two workarounds every consumer of this primitive must follow |
| Admin resource cards, no media (Partners/Events/Slideshows/Landing Pages) | `components/gds/ResourceListGrid.tsx`, consumed by `PartnersInventoryList.tsx`, `EventsInventoryList.tsx`, `SlideshowsInventoryList.tsx`, `LandingPagesPageView.tsx` | Domain-owned composition over approved `gds-core`/`PublicPrimitives` building blocks (`Card`, `Group`, `Stack`, `Text`, `Button`, `GdsIcons`) — not `AdminResourceManager`, because that primitive always renders a media block with no prop to omit it (v2.19.0, PR #105) |
| Responsive data view | `components/admin/TryOnResultModerationTable.tsx` | Package-direct `ResponsiveDataView` |
| Data table | `components/gds/LandingPagesPageView.tsx`, `components/admin/TryOnQueueTable.tsx` | Package-direct `DataTable`; analytics tables use package `AdminAnalyticsTable` |
| Empty state | direct `@sovereignsquad/gds-core` import | Package-direct |
| Access summary | direct `@sovereignsquad/gds-core` import | Package-direct |
| Status badge | direct `@sovereignsquad/gds-core` import | Package-direct |
| State block | direct `@sovereignsquad/gds-core` import | Package-direct |
| Form section | direct `@sovereignsquad/gds-admin` import | Package-direct |
| Editor scaffold | `app/admin/{events,events/[id],partners,partners/[id],frames,logos,tryon}/**` | Domain composition `components/admin/AdminEditorScaffold.tsx` over package `EditorScaffold` and `WorkspaceHeader` |
| Upload dropzone | direct `@sovereignsquad/gds-core` import | Package-direct |
| Destructive confirm | `lib/gds/confirm-destructive.tsx` | Active — delete/remove admin actions |
| Root provider adapter | `components/gds/CameraGdsProvider.tsx` | Active |
| Public shell | `components/public/PublicPageShell.tsx` | Domain-owned composition over package `PublicShell` |
| App shell (admin) | `components/admin/AdminChrome.tsx` | Domain-owned composition over package `AppShell` |
| Page header / workspace header | `components/admin/WorkspaceHeader.tsx` | Domain-owned composition over package `PageHeader` |
| Admin list page assembly | `components/admin/AdminListPageShell.tsx` | Domain-owned composition over package admin surfaces |
| Media preview card | `components/media/MediaPreviewCard.tsx` | Thin compatibility adapter over package `MediaPreviewCard`; numeric Camera ratios are normalized to approved GDS ratios |
| Media / result cards | `components/admin/EventGallery.tsx`, `components/admin/OldestVettingResultCard.tsx` | Package-direct `ListingCard`; image supplied as a ReactNode so `object-fit: contain` (non-cropping) is preserved, and semantic/loading action buttons are kept via the footer `actions` slot |
| Media frame | `components/admin/TryOnResultModerationTable.tsx` (preview strip + review panel image frames) | Package-direct `GdsMediaFrame` with `fit="contain"` around the non-cropping preview images |
| Try-on moderation review card | `components/admin/TryOnResultModerationTable.tsx` (`renderCard`) | Domain-owned `Paper`+`Group` composition over `PublicPrimitives`, not package `AdminReviewLayout` — that primitive's fixed vertical media/metadata/content/actions order structurally cannot put actions beside the image, which mobile-usability testing (reported live from a phone mid-event) required (commit `7ade5a9`). See `gds-adoption.json`'s `approvedExceptions` for the full exception record. |
| Try-On app workspace | `app/admin/tryon/**` composed from local GDS primitives | Active |
| Auth / public capture shell | `components/capture/CaptureStageShell.tsx`, `components/capture/**`, `app/capture/**` | Active — `PublicFlowShell` for onboarding/share stages plus capture-specific runtime composition |
| Landing legal pages | `components/public/LandingLegalDocument.tsx`, `app/landing/[slug]/{privacy,terms}/page.tsx` | Active — `ArticleShell` inside package-backed public utility surface |
| Slideshow playback | `components/slideshow/**` | Active — `PlaybackSurface` framing plus runtime-specific media orchestration |
| Landing page editor CSS | `components/admin/LandingPageEditor.tsx` | **Exception** (editor preview) |
| Guided tour | `lib/tour/**`, `components/tour/**` | **Exception** (package coverage gap) — see below |

## Boundary classification

### Retained package-boundary adapters

- `components/gds/CameraGdsProvider.tsx`
- `lib/gds/confirm-destructive.tsx`

  - `CameraGdsProvider` is the single root composition point for official GDS providers.
  - `lib/gds/confirm-destructive.tsx` is a legacy bridge and must migrate to `GdsConfirmProvider`.

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
- `components/gds/DataTable.tsx`
- `components/gds/ResponsiveDataView.tsx`
- `components/gds/EditorScaffold.tsx`
- `components/gds/SemanticNavLink.tsx`
- former `components/gds` shell/card wrappers replaced by domain-owned components or direct package usage

## Approved exceptions

Camera exceptions follow the shared structure from [docs/GDS_EXCEPTION_STANDARD.md](GDS_EXCEPTION_STANDARD.md).

| Surface | Category | Boundary | What is still mandatory | Exit condition |
|---------|----------|----------|--------------------------|----------------|
| Event capture runtime (`app/capture/[eventId]/page.tsx`, `components/camera/CameraCapture.tsx`, frame-selection and preview overlays) | Runtime constraint | Live camera preview, frame compositing, and fullscreen preview-stage orchestration | GDS provider/theme runtime, `PublicFlowShell` for onboarding/share stages, accessible controls, explicit loading/error states | Keep narrowing until only the irreducible hardware-preview and frame-compositing region remains outside direct package ownership |
| Residual public surface helper layer (`app/globals.css` helper classes and `--app-panel-*` tokens) | Migration bridge | Limited public/capture helper styling outside `/admin/**` | No second shell system, no admin reuse, no raw package bypass, accessibility and contrast still enforced | Remove once public/capture surfaces no longer depend on local helper classes |
| Landing page custom CSS (`landing_pages.customCss`, public `/landing/[slug]`) | Product-authored experience | Creator-authored presentation inside the landing experience surface only | GDS-governed admin/editor chrome, safe rendering order, accessibility baseline for shared controls and consent surfaces | Long-lived approved exception unless GDS later formalizes creator-authored experience theming |
| Slideshow player (`components/slideshow/**`, `/slideshow/**`) | Runtime constraint | Timing-sensitive queue orchestration, fullscreen behavior, and media-first presentation | GDS runtime boundary, `PlaybackSurface` framing, surrounding admin configuration surfaces, visible error/empty states, keyboard-safe exit where applicable | Keep narrowing until only timing-sensitive queue, fullscreen behavior, and media internals remain outside direct package ownership |
| Guided tour spotlight overlay (`components/tour/**`, `lib/tour/**`) | Package coverage gap | Full-viewport spotlight/backdrop rendering, step sequencing, tooltip position math — no Tour/Spotlight contract or usable positioning primitive exists in `@sovereignsquad/gds-core` 6.3.0 either (only exported overlay primitive is `Tooltip`, a plain hover label) — confirmed still true at 6.3.0, not just stale from the 3.9.0 era | `OverlayManagerProvider` registration for stacking with other overlays, GDS-approved primitives via `components/gds/PublicPrimitives.tsx` for tour controls, keyboard/focus/reduced-motion accessibility baseline | Replace the custom spotlight/backdrop and step engine once GDS publishes a Tour/Spotlight contract |

### The Google and Facebook sign-in buttons are drawn in the camera app (camera#462)

The GDS `ProviderIdentityButton` draws a plain letter ("G", "F") in the provider's Mantine colour name. The client asked for the sign-in to stand out in the providers' own colours, and Google's branding guidelines forbid recolouring its G, so the guest "Who are you" page uses `components/auth/BrandSignInButton.tsx` instead: Google a white pill with a thin grey border, dark text and the four-colour G; Facebook the Facebook blue with white text and the white f; each at least 48 px tall. The colours are tokens (`SOCIAL_GOOGLE_*`, `SOCIAL_FACEBOOK_BLUE` in `lib/gds/tokens/colors.ts`). A follow-up for GDS: ship these marks and colours in `ProviderIdentityButton` (a `brand` variant) so every app gets them; then this component can go.

### Camera-step scroll and zoom lock (camera#222), and zoom lock of the journey pages (camera#490)

Owner request after live phone testing (2026-10-06): the capture flow should feel like an app. The GDS PWA
viewport policy (`general-design-system/docs/PWA_VIEWPORT_POLICY.md`) treats disabling zoom as a reviewed
accessibility exception, so it is recorded here.

| Item | Record |
|------|--------|
| Surface | The camera steps only: frame picker, capture, reframe, preview, share card. `components/capture/AppShellLock.tsx` sets `html[data-app-lock]` while one is mounted; `app/globals.css` turns it into no page scroll, no overscroll or pull-to-refresh, and `touch-action: pan-x pan-y`; iOS page-pinch is cancelled through `gesturestart`. |
| Journey pages (added 2026-10-09, owner report 490: "the webapp was properly not scalable ... now it is zoom in/out again with pinch") | The pages before and after the camera steps (welcome, who are you, CTA, restart; `lib/capture/page-lock.ts`) are locked **against zoom only**: `components/capture/AppShellLock.tsx` with `zoomOnly` sets `html[data-app-zoom-lock]`, `app/globals.css` gives it `touch-action: pan-x pan-y`, iOS page-pinch is cancelled through `gesturestart`; the page still scrolls, because a form can be taller than a small phone. |
| Not covered, on purpose | The **consent/terms page** (a text to read: it keeps browser zoom, as decided with #222), and every route outside the capture flow (the public photo page, admin, landing pages), which keep the default viewport (`width=device-width, initial-scale=1`). The route-wide `app-shell-fixed` viewport lane is not used, because it would also lock the consent text. |
| Owner | `moldovancsaba` (product owner), decision 2026-10-06 (camera steps) and 2026-10-09 (journey pages), review by 2026-12-31. |
| Reflow | Every camera step fits 320x568, 375x667, 390x844, 360x740, 414x896 and landscape 844x390 and 667x375 with no page scroll and the main actions on screen (Playwright, fake camera, 2026-10-06). |
| Text size | Type is `rem`-based GDS tokens, untouched; OS text size is not blocked. **Not yet tested** at 200% OS text size on a device. |
| Zoom-dependent content | None: the camera steps need no pinch to read or operate; the reframe step has its own pinch and drag on the canvas. |
| Orientation and devices | Both orientations on any device: the manifest sets `orientation: any`, and the flow was measured (no page scroll, no horizontal scroll, controls inside the safe area) on 16 viewports: 7 phones (including notched portrait and landscape), 6 tablets (744 to 1366 px, both orientations) and 3 desktop sizes, plus rotating mid-flow on a phone and a tablet (device-orientation emulation, 2026-10-06). |
| Safe areas | `viewport-fit=cover` on the event capture route only; `.app-safe-area` / `.app-safe-pad` and the camera's fixed controls use the GDS `--gds-safe-area-inset-*` tokens. Verified with emulated insets (notch 47 px top, 34 px home indicator; landscape 47 px sides). |
| Open | Real-device check on iPhone Safari and Chrome Android (iOS pinch handling cannot be proven in desktop Chromium); for the journey pages the owner's phone check closes issue 490. |
| Exit condition | Remove the component and the CSS if a camera step gains reading-heavy content, or the owner withdraws the decision. |

### `@sovereignsquad/gds-theme/server` cannot be imported by a Next route handler (camera#225)

The documented `getGdsWebAppManifest` import fails `next build` ("Attempted to call mergeThemeOverrides() from the
server"): the `/server` entry loads a chunk that calls `@mantine/core` at module load, and Next's server bundling
treats Mantine's entry as client code. Camera builds the manifest object itself in the GDS shape
(`lib/pwa/event-manifest.ts`) and a unit test asserts it equals the generator's output. To be reported upstream and
removed once GDS fixes the entry.

## Known package limitations: `AdminResourceCard` / `MediaPreviewCard`

Originally confirmed by reading the compiled source of
`@sovereignsquad/gds-admin@3.9.0` and `@sovereignsquad/gds-core@3.9.0`; found
while investigating two real production bug reports (v2.19.0, PRs #103–#105).
Re-checked on 2026-10-06 against the installed **6.3.0**: items 1 and 2 are
still present, item 3 is fixed upstream. Items 1 and 2 are tracked upstream as
`sovereignsquad/general-design-system#755`; the GDS fix handover
(`gds_fix_handover.md`) reports both still present in 6.7.0, which was not
re-checked here.

1. **Every non-danger `primary`/`secondary` action renders as "Edit".**
   `AdminResourceCard` hardcodes `action: primary.kind === "danger" ? "delete" : "edit"`
   for both slots — it discards the caller's own `label` string entirely, and
   there's no way to pass a different semantic action id (`gds-core`'s
   `ActionBar`/vocabulary supports many, e.g. `eye`/"View", but
   `AdminResourceCard` never forwards one). Any resource list with more than
   one non-danger action (e.g. "View" + "Edit") renders two buttons that
   both say "Edit". Workaround: give the record exactly one non-danger
   `primary`/`secondary` action (usually the real edit action) and route
   anything else through `onPreview` (renders as "Preview") or a `kind: 'icon'`
   action (renders as a subtle icon with the real label as `aria-label` only —
   not visible text).
2. **The `status` slot double-wraps a `Badge`.** `MediaPreviewCard` renders
   `status ? <Badge variant="light">{status}</Badge> : null` — passing an
   already-built `<StatusBadge>` (itself a `Badge`) produces a badge nested
   inside a badge, a visibly doubled pill. Workaround: pass plain
   (optionally colored) text/nodes into `status`, never another `Badge`-like
   component. `lib/gds/statusChipContent.tsx`'s `getStatusChipContent()` is
   the approved helper for this.
3. **FIXED upstream in 3.10.0 (2026-07-22): the media/image block can now be
   omitted.** On 3.9.0, `MediaPreviewCard` always rendered an `AspectRatio`
   block (the real image, or a "No media" placeholder). 3.10.0 added
   `hideWhenNoMedia?: boolean` to `MediaPreviewCard`, threaded through
   `AdminResourceCard`, `AdminResourceGrid` and `AdminResourceManager`; it is
   in the installed 6.3.0 and used at
   `components/admin/TryOnSetupsInventoryList.tsx`. Partners, Events,
   Slideshows and Landing Pages still use the local
   `components/gds/ResourceListGrid.tsx` (a from-scratch no-media card grid),
   which was built for the 3.9.0 limitation. Moving them to
   `AdminResourceManager` with `hideWhenNoMedia` is possible, but the GDS fix
   handover ties retiring `ResourceListGrid` to #755 (items 1 and 2 above), so
   check that before switching.

Items 1 and 2 are not fixable from inside Camera's boundary — they are vendored
package behavior, filed upstream as `sovereignsquad/general-design-system#755`.
Until a release fixes them, any new `AdminResourceManager` consumer must follow
the workarounds above or it will silently reintroduce one of these bugs.

## Published package capability snapshot

Camera is currently pinned to the latest verified published release bundle, `@sovereignsquad/*` **6.8.0**.

### Available now in the published package line

- public/editorial primitives: `PublicShell`, `PublicFlowShell`, `ArticleShell`, `DocsPageShell`, `AuthShell`, `BrowseSurface`, `EditorialHero`, `FeatureBand`, `ConsumerSection`, `ConsumerDashboardGrid`, `MediaField`, `PublicBrandFooter`, `MapPanel`, `PlaybackSurface`
- admin/ops primitives: `AppShell`, `PageHeader`, `WorkspaceHeader`, `ResponsiveDataView`, `StatsStrip`, `ContentOpsEditor`, `ContentOpsSection`, `ContentOpsActionBar`, `FormSection`, `AdminResourceManager`, `AdminResourceGrid`, `AdminResourceCard`, `AdminDataTable`, `AdminAnalyticsTable`, `AdminReviewLayout`, `AdminModal`, `AdminDetailDrawer`, `AdminCrudForm`, `AdminFormSection`, `AdminFormStatus`, `AdminFormActions`
- shared state and utility primitives: `EmptyState`, `StateBlock`, `StatusBadge`, `AccessSummary`, `MediaCard`, `MediaPreviewCard`, `ListingCard`, `GdsMediaFrame`, `ProductCard`, `ActionBar`, `SemanticButton`, `ConfirmDialog`, `GdsConfirmProvider`, `GdsToastProvider`, `GdsNotificationProvider`, `OverlayManagerProvider`, `ReportingSection`, `GdsChart`, `StatsSection`, `PublicCaptureFlow`, `ShareButtonGroup`, `PlaybackControls`, `PlaybackOverlayControls`

### v3.5.0 additions relevant to Camera

- Asset workflow contracts: `GdsAssetManager`, `GdsAssetPreviewCard`, `useGdsAssetUploadQueue`, `createGdsAssetAdapter`, and `validateGdsAsset`.
- Table/resource workflow contracts: `GdsDataTable`, `useGdsDataTable`, `GdsResourceManager`, and `createGdsResourceAdapter`.
- Form orchestration contracts: `useGdsFormOrchestration`, `GdsValidationSummary`, `GdsSchemaForm`, and schema conversion helpers.
- Settings/page templates: `GdsSettingsTemplate`, `GdsAdminDashboardTemplate`, `GdsAnalyticsTemplate`, `GdsCrudEditorTemplate`, and page/layout template helpers.
- Runtime accessibility and resilience contracts: `GdsAccessGate`, notification audit/live policies, accessibility evidence validation, media fallback/frame primitives, and reduced-motion helpers.
- Layout and formatting primitives: `GdsStack`, `GdsGrid`, `GdsSplit`, `GdsContainer`, `GdsBox`, localized date/number/currency/plural/relative-time helpers, `SearchableSelect`, `NumberStepper`, and `BottomTabBar`.

## Core rules

1. GDS is the mandatory UI/UX authority for Camera. Mantine is a runtime dependency behind GDS and approved leaf/runtime exceptions.
2. Shared admin patterns must consume package contracts first; only compatibility shims belong in `components/gds`, while domain composition belongs in domain folders.
3. New admin screens consume GDS primitives first — no page-local shells, toolbars, state blocks, resource cards, or analytics visuals.
4. Tailwind / `globals.css` tokens are **not** authority for `/admin/**`.
5. Direct `@mantine/core` imports are migration debt in admin page-level surfaces unless explicitly listed as an approved exception.
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
9. Replace the remaining thin adapter families one contract family at a time with direct `@sovereignsquad/gds-*` consumption where package typing and behavior make the bridge unnecessary

## Shared package alignment

Camera now uses the real `@sovereignsquad/*` package line through the temporary supported GitHub release-asset tarballs.

Current state:

- Camera runtime: Mantine `8.3.6`, React `19.2.0`
- Shared `@sovereignsquad/*` packages: version `6.8.0`, Mantine `^7.9.0` in-repo build target (consumer-smoke-tested against `8.3.6`/`9.2.1`), React `^18.2.0 || ^19.0.0`

`gds-adoption.json`'s `gdsVersion` now correctly tracks this (see the 2026-08-21 entry below) -- Camera's runtime already sits inside GDS's validated peer matrix (Mantine `8.3.6` + React `19.2.0` is one of the two exact combinations GDS's own `verify:mantine` tests against), so no framework bump was needed alongside this one.

### 2026-08-08: `gds-core`/`gds-theme`/`gds-admin` vendored at `4.1.3`

`package.json` now points `@sovereignsquad/gds-core`, `gds-theme`, and `gds-admin` at `file:vendor/gds/*.tgz` instead of the published `3.9.0` registry install -- this affects every consumer of those packages app-wide, not just the change below. Why: `3.9.0` remains the only version ever published to either registry (npmjs or GitHub Packages, both checked directly), but real, buildable newer work exists at git tag `gds-v4.1.3` in the source repo. The tarballs under `vendor/gds/` are a from-source `tsup` build of that tag, packaged via `npm pack` -- confirmed buildable and clean before use, not a raw git-source install. `gds-admin` had to move too: it pins an *exact* peer dependency on `gds-core`/`gds-theme` (`"3.9.0"`, not a range), so bumping only two of the three would have left a real peer mismatch.

This is **not** a formal SSOT version adoption -- `gds-adoption.json`'s `gdsVersion` field is left at `3.9.0` deliberately, since that still reflects the last officially published version this manifest is meant to track. `npm run gds:validate-manifest` passes either way (it checks contract/structural compliance, not installed package versions, so it doesn't catch this kind of drift).

**What it unblocked:** `components/admin/HashtagInput.tsx`'s selected-hashtag removable chips now use `ChoiceChip` from `@sovereignsquad/gds-core` instead of a hand-rolled `<button>`. Note this component is not currently rendered anywhere in the app (no call sites found) -- the change is verified via a temporary scratch route (deleted before commit), not a live page.

### 2026-08-08: create-page forms migrated to `AdminCrudForm`

The four `new`/create admin pages (frames, logos, partners, try-on suits) -- the backlog item open since v2.17.0 (`TASKLIST.md`) -- now render their fields through `AdminCrudForm`/`AdminFormSection`/`AdminTextInput`/`AdminTextarea`/`AdminSelect`/`AdminCheckbox` instead of raw `<input>`/`<textarea>`/`<select>`, matching the frames/logos edit-page pattern from #74. Image-upload sections keep plain `FormSection` since they aren't a field group.

Verified live via `/api/auth/dev-login` + headless Chromium against the app's real dev server: all four pages render correctly and their fields are genuinely controlled (typing and checkbox toggling confirmed against React state, not just static markup).

**Correction to the record while doing this:** the backlog note this closes said "migrate to `AdminCrudForm` primitives for parity with the edit pages" as if all four edit pages were already on `AdminCrudForm`. Checked directly -- only frames/logos edit pages actually are (#74's real scope); `partners`/`tryon/suits` edit pages are still on `FormSection` + raw inputs. That's a real, separate gap this change does not touch -- noted in `TASKLIST.md`, not filed as a numbered issue yet.

**Full type-check + lint + build were re-run clean against the vendored packages** (not just this one file), since the version bump is app-wide. See `LEARNINGS.md` for the vendoring approach and its tradeoffs.

### 2026-08-12: vendored GDS bumped `4.1.3` → `6.0.0`

`3.9.0` is still the only version ever published to any registry. The source repo's tag
history has moved well past `4.1.3` since the prior vendoring change: `4.1.5` through
`4.1.11`, then two major bumps, `5.0.0` and `6.0.0`. Checked the actual risk before
upgrading rather than assuming a major bump means broad breakage: the upstream
`CHANGELOG.md`/`DEPRECATIONS_AND_MIGRATIONS.md` document exactly two breaking changes
across both majors -- `ReferenceThemeExplorer` relocated to a dedicated import subpath
(5.0.0), and a `class-usa` brand-theme token rename (6.0.0). Neither surface is
referenced anywhere in this repo's actual source (grepped, not assumed) -- Camera
doesn't use `ReferenceThemeExplorer` (a playground/demo component) or the `class-usa`
brand lane at all.

`gds-adoption.json`'s `gdsVersion` stays at `3.9.0` deliberately, same rationale as the
prior vendoring change -- this is a scoped dependency bump, not a formal SSOT version
adoption.

### 2026-08-17: vendored GDS bumped `6.0.0` → `6.2.0`

Checked `CHANGELOG.md`/`DEPRECATIONS_AND_MIGRATIONS.md` across the full range: zero new
breaking changes past `6.0.0`. `type-check`, `gds:check`, `verify:production-guards`, and
`build` all clean (see commit `65e6c13`). `gds-adoption.json`'s `gdsVersion` was left at
`3.9.0` again here, same rationale.

### 2026-08-21: vendored GDS bumped `6.2.0` → `6.3.0`, and `gdsVersion` now tracks it for real

The rationale behind leaving `gdsVersion` deliberately stale at `3.9.0` through every prior
bump was that `3.9.0` was "the last officially published version this manifest is meant to
track" -- every newer tarball since `4.1.3` was a from-source rebuild, not a real release.
That condition no longer holds. GDS now ships real, tagged, GitHub Release bundles
(`release-bundles.yml`, triggered on `gds-v*` tags) -- the vendored `6.3.0` tarballs here
are the actual `gds-v6.3.0` release assets downloaded via `gh release download`, not a
local rebuild. `gdsVersion` is updated to `6.3.0` to match, same as messmass's manifest,
since there's no longer a real published-vs-vendored gap to track separately.

Also vendored `gds-compliance` and `gds-eslint-config` (previously resolving from GDS's
permanently-frozen `3.9.0` line on the public npmjs.org registry, since 6.x was never
published there) as `file:vendor/gds/*.tgz` tarballs, matching the other three packages --
these are dev-only tooling (lint config, compliance checker), not runtime UI, so this
doesn't touch anything user-facing.

Checked the two documented breaking changes across the entire `3.9.0`→`6.3.0` span
(`ReferenceThemeExplorer` relocation at `5.0.0`, `class-usa` token rename at `6.0.0`) --
neither is referenced anywhere in this repo (grepped, not assumed). Full local gate
(`type-check`, `lint`, `test`, `build`) run clean in an isolated git worktree before this
was pushed, plus a live-browser verification pass across representative real routes
(admin dashboard, event capture flow, a share page, a slideshow) before landing.

Verified live via `/api/auth/dev-login` + headless Chromium against `/admin/frames/new`
(the most GDS-surface-dense page touched by recent work): pixel-identical render to the
`4.1.3` version, no new console errors. `npm run release:check` clean.

Required rule:

- Camera must align to the **contracts and patterns** from the GDS repository
- Camera must consume the published `@sovereignsquad/*` packages at the provider/theme/compliance boundary
- Camera must continue shrinking local adapters as central package coverage and compatibility improve

### 2026-08-25: vendored `file:` tarballs replaced with the documented GitHub Packages registry install

The original blocker for vendoring -- "3.9.0 remains the only version ever published ...
6.x was never published there" -- no longer holds and hasn't for a while: GDS has published
current versions to GitHub Packages (`npm.pkg.github.com`) since well before `6.3.0`,
confirmed by installing `6.3.0` directly from that registry this session. What actually kept
Camera on vendored tarballs was a missing `read:packages`-scoped credential, the same gap
that separately blocked `sso`, `messmass`. A `GDS_PACKAGES_TOKEN` repository secret is now
provisioned. `.npmrc` (previously absent) carries the `@sovereignsquad` registry block,
`package.json` pins the exact versions that were vendored (`6.3.0` -- an install-mechanism
change, not a version bump), CI (`.github/workflows/ci.yml`) exports the secret as
`GITHUB_TOKEN` for the install step, and `vendor/gds/` is deleted.

`npm run release:check` (`gds:validate-manifest` -> `gds:check` -> `type-check` -> `lint` ->
`verify:production-guards` -> `build`) verified clean against a real `npm ci` against the
registry before this landed.

The same token is also set as a `GITHUB_TOKEN` project environment variable in Vercel
(Production and Preview, 2026-08-25) -- this repo deploys manually via
`npx vercel@latest --prod`, which builds remotely on Vercel's own infrastructure and needed
the credential there too. Confirmed live: the latest Vercel deployment is `READY`.

### 2026-09-08: back to vendored tarballs (v12.3.29, `6246dbf`)

The registry install above lasted two weeks. From 2026-09-07 every CI `npm ci` failed with a
403 from GitHub Packages (org Packages billing limit). `@sovereignsquad/gds-{core,theme,admin,compliance,eslint-config}`
6.3.0 are again committed under `vendor/gds/` (from the `gds-v6.3.0` release assets) and
installed via `file:vendor/gds/*.tgz` specs in `package.json`; `.npmrc` was removed, the
lockfile contains no GitHub Packages URL, and CI (`.github/workflows/ci.yml`) needs no
registry token. Same version (6.3.0) — an install-mechanism change only.

Consequence: the `GITHUB_TOKEN` Vercel environment variable described in the 2026-08-25
entry is no longer needed for the build (it was still present on the production
environment on 2026-09-28). Removing it is a Vercel dashboard/owner action and has not been
done. Production also no longer deploys manually — every push to `main` auto-deploys (see
[RUNBOOK.md](../RUNBOOK.md)).

## Formal compliance path

Camera now declares its governed local adapter state in [gds-adoption.json](../gds-adoption.json).

Current compliance position:

- SSOT repo/version is declared
- local adapters and approved exceptions are enumerated
- npm package consumption is live on a Mantine version that satisfies the current GDS peer contract
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
npm ci
npm run gds:validate-manifest
npm run gds:check
npm run type-check
npm run lint
npm run build
```

The same commands run in GitHub Actions through [docs/GDS_RELEASE_GATE.md](GDS_RELEASE_GATE.md).

### 2026-10-10: vendored GDS bumped `6.3.0` → `6.8.0` (camera#184)

The five vendored tarballs (`gds-core`, `gds-theme`, `gds-admin`, `gds-compliance`, `gds-eslint-config`) are now the `gds-v6.8.0`
release assets, downloaded with `gh release download`; each one's integrity hash was compared with the version published on
GitHub Packages and matches. The issue asked for `6.7.0`; `6.8.0` was released on 2026-10-06, so the bump goes there instead
(`6.8.0` only adds on top of `6.7.0`). `package.json`'s five `file:` specs, the lockfile and `gdsVersion` follow.
Peer dependency ranges (Mantine `^7.9 || ^8.3 || ^9`, React `^18.2 || ^19`) are identical between `6.3.0` and `6.8.0`.
The refreshed lockfile also moves `@tiptap/starter-kit` and its extensions from `3.31.3` to `3.31.4` (GDS `6.8.0` declares `^3.31.3`; the `package.json` overrides keep the tiptap core, pm and react packages at `3.31.3`, and camera imports none of them).
The statements above that say "against the installed `6.3.0`" are dated observations from before this bump and have not been
re-measured. The sidebar `NavLink` row height, which `6.5.0` gives a 44px minimum from a token camera does not define at `:root`, was
measured on a render of `AdminChromeView` with the production stylesheet of each build: the rows are 40.8px with `6.3.0` and with `6.8.0`, the
computed `min-height` is `0px` in both (the `--gds-control-height-md` token is declared nowhere), so the 44px floor does not apply, and the
only change in that DOM is the extra class `gds-navlink`, which no stylesheet rule uses. The check on the deployed app (needs an admin
sign-in) stays open in camera#184.

Visual comparison of the two builds (production CSS chunks of each build, the real page components, mocked network, 390x844 and 1280x800):
64 screens (57 in the light scheme, 7 in the dark scheme: the guest journey with the who-are-you, accept, live camera and reframe steps, the
stand-alone who-are-you and accept pages, the partner editor, the vetting big view in every step, the event gallery, the oldest-waiting try-on
card and the admin chrome) are pixel-identical, 7752 elements have identical computed style and box, and the custom properties declared on the root are identical (547 names, same values).
The `light-dark()` role tokens (`--gds-bg-*`, `--gds-text-*`, `--gds-border-card`, `--gds-vibe-*`, 12 names) are declared the same way in both
releases and still reach the page as the invalid pair value (`#e2e8f0#334155`), so admin code keeps using `--mantine-*` tokens.
`6.8.0` adds two references with no fallback and no declaration (`--gds-elevation-card`, `--gds-elevation-panel`, in the new
`.gds-quick-start-card` rule that camera does not use).

## References

- [docs/GDS_COMPONENT_RULES.md](GDS_COMPONENT_RULES.md)
- [GDS FOUNDATION](https://github.com/sovereignsquad/general-design-system/blob/main/FOUNDATION.md)
- [GDS COMPONENTS_AND_PATTERNS](https://github.com/sovereignsquad/general-design-system/blob/main/COMPONENTS_AND_PATTERNS.md)
- [GDS GOVERNANCE_AND_ADOPTION](https://github.com/sovereignsquad/general-design-system/blob/main/GOVERNANCE_AND_ADOPTION.md)
- [GDS COMPATIBILITY_AND_RELEASES](https://github.com/sovereignsquad/general-design-system/blob/main/COMPATIBILITY_AND_RELEASES.md)
