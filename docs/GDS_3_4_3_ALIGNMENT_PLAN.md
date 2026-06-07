# Camera GDS 3.4.3 Alignment Plan

**Last updated**: 2026-06-07

## Objective

Move Camera toward 100% Sovereign Squad General Design System operation using the published `@doneisbetter/*` `3.4.3` package line while keeping the frontend stable, responsive, and lightweight.

This document is the implementation handover for GitHub issues `#69` through `#78`.

## GitHub tracker snapshot

Checked on 2026-06-07 against `moldovancsaba/camera` and Project `#24` (`{camera} - From IDEA to LIVE`). Board sync details are recorded in `docs/GDS_3_4_3_GITHUB_BOARD_HANDOVER.md`.

| Issue | Current local implementation signal | GitHub issue state | Project status | Handover action |
|-------|-------------------------------------|--------------------|----------------|-----------------|
| `#69` GDS dependency baseline | Package baseline and provider composition are implemented in local working tree. Package-manager lockfile choice still needs release decision. | Open | Review (ALMOST) | Confirm dependency lockfile policy before closure. |
| `#70` Adapter removal | `DataTable` and `ResponsiveDataView` shims are removed in local working tree; `EditorScaffold` remains as a documented compatibility shim. | Open | Todo (NEXT) | Keep open as partial. Update issue body/comment with remaining `EditorScaffold` exit condition. |
| `#71` Admin resources | Inventory pages show package-direct resource/table adoption in local working tree, but full `AdminResourceManager` conversion is not proven complete. | Open | Backlog (SOONER) | Keep open. Pull forward after `#70` review if inventory conversion is accepted. |
| `#72` Try-on moderation | Moderation tables and controls have active GDS migration changes, but full review-layout/semantic-action migration is not proven complete. | Open | Backlog (SOONER) | Keep open. Treat as high-risk UI migration for manual smoke and accessibility review. |
| `#73` Analytics reporting | Analytics uses package `AdminAnalyticsTable`; hourly outcomes are wrapped in `ReportingSection`. Server/client boundary fix for analytics tables is included in local changes. | Open | Review (ALMOST) | Run final GDS checks and `/admin/tryon/analytics` smoke before closure. |
| `#74` Admin forms and email templates | Editor shim remains; full official form primitive migration is not complete. | Open | Backlog (SOONER) | Keep open. |
| `#75` Feedback, overlays, confirmations | Root GDS feedback/overlay providers are implemented. Legacy destructive-confirm bridge still remains. | Open | Backlog (SOONER) | Keep open as partial. Update issue with provider baseline complete and remaining call-site replacement. |
| `#76` Public surfaces | Public/capture/slideshow exceptions remain by design. | Open | Backlog (SOONER) | Keep open. |
| `#77` Media cards | Media-card migration status is not fully proven from local docs alone. | Open | Backlog (SOONER) | Keep open pending visual inspection and accessibility review. |
| `#78` Compliance enforcement | `gds-adoption.json` and docs are updated locally; release-gate checks still need to run in the final package-manager lane. | Open | Backlog (SOONER) | Keep open until final gate. |

Project board sync:

- GitHub Project v2 uses GraphQL. The authenticated account hit the GraphQL rate limit during handoff (`remaining: 37`, reset: 2026-06-07 15:54:46 CEST).
- Issue snapshots were retrieved before the limit blocked project item listing/editing.
- After reset, issue comments were posted for `#69`, `#70`, `#73`, `#75`, and `#78`.
- `#69` and `#73` were moved to `Review (ALMOST)`.
- `#70` and `#75` remain open as partial; `#78` remains the final gate.

## Baseline implemented

- `@doneisbetter/gds-admin`, `@doneisbetter/gds-core`, and `@doneisbetter/gds-theme` upgraded to `3.4.3`.
- `@doneisbetter/gds-compliance` and `@doneisbetter/gds-eslint-config` upgraded to `3.4.3`.
- Root Camera provider now composes official GDS feedback/overlay providers:
  - `GdsTelemetryProvider`
  - `GdsNotificationProvider`
  - `GdsToastProvider`
  - `OverlayManagerProvider`
  - `GdsConfirmProvider`
- Local table/responsive/editor adapters were removed after consumers moved to official package imports or admin-domain composition.
- `EditorScaffold` shim no longer imports Mantine layout.
- Try-on analytics tables use official `AdminAnalyticsTable`.
- Hourly outcomes are wrapped in official `ReportingSection`.
- `gds-adoption.json` now targets `3.4.3` and records stricter GDS-only rules.

## Frontend load and stability rules

1. Prefer server-side aggregation for analytics and dashboards.
2. Do not calculate authoritative totals from the number of rendered rows.
3. Use GDS table/resource primitives instead of custom client-side card grids.
4. Keep client components small and action-focused.
5. Avoid loading full archives into memory; use pagination or infinite scroll with bounded page sizes.
6. Use image lazy loading by default; preload only the active vetting image and the next small batch.
7. Do not render hidden heavy DOM for inactive tabs, drawers, or archived result groups.
8. Do not introduce page-level chart libraries when `GdsChart` or `ReportingSection` is sufficient.
9. Keep retry, rerun, approve, reject, service, and great actions idempotent from the UI perspective.
10. Always show loading, disabled, success, and failure states through GDS feedback primitives.

## Execution sequence

### 1. Dependency and provider baseline

Issue: `#69`

Status: implemented baseline.

Remaining work:

- Decide whether the repository standard is npm lockfile, pnpm lockfile, or both during transition.
- Keep CI using one documented package manager.

### 2. Adapter removal

Issue: `#70`

Status: implemented for the GDS adapter layer. `DataTable`, `ResponsiveDataView`, and `EditorScaffold` shims are removed from `components/gds`. Editor pages now use `components/admin/AdminEditorScaffold.tsx`, a domain composition over package `EditorScaffold` and `WorkspaceHeader`.

Rules:

- Existing compatibility shims may remain only to avoid risky broad rewrites.
- New code must import official GDS primitives directly.
- Remove shims once all imports are migrated.

### 3. Admin resource pages

Issue: `#71`

Target primitives:

- `AdminResourceManager`
- `AdminResourceGrid`
- `AdminResourceCard`
- `AdminResourceToolbar`
- `AdminResourceEmptyState`

Implementation approach:

1. Convert one inventory page at a time.
2. Map records into the `AdminResourceRecord` contract.
3. Keep server-side filters and search authoritative.
4. Use GDS actions for primary and secondary actions.
5. Avoid custom card CSS and page-local resource shells.

### 4. Try-on moderation

Issue: `#72`

Target primitives:

- `AdminReviewLayout`
- `AdminModal`
- `AdminDetailDrawer`
- `SemanticButton`
- `ConfirmDialog`
- `GdsConfirmProvider`

Operational requirements:

- Rerun never auto-approves.
- Rerun removes the old quality result from active vetting by marking it superseded.
- New rerun result must return to human vetting.
- Service remains separate from rejected analytics.
- Failed cards should show the original/source image when available.

### 5. Analytics reporting

Issue: `#73`

Target primitives:

- `ReportingSection`
- `GdsChart`
- `StatsSection`
- `AdminAnalyticsTable`

Data rules:

- No demo values.
- No placeholder `100` counters.
- All metrics must expose their source collection and filter basis.
- Hourly buckets must be generated server-side and timezone-aware.

### 6. Admin forms and email templates

Issue: `#74`

Target primitives:

- `AdminCrudForm`
- `AdminFormSection`
- `AdminFormStatus`
- `AdminFormActions`
- `AdminTextInput`
- `AdminTextarea`
- `AdminSelect`
- `AdminCheckbox`
- `AdminFileUpload`

Email rules:

- Event-specific templates remain event-specific.
- Global defaults must not overwrite event overrides.
- Template tokens must stay documented.

### 7. Feedback, overlays, and confirmations

Issue: `#75`

Status: provider baseline implemented.

Remaining work:

- Replace legacy `lib/gds/confirm-destructive.tsx` call sites with `useGdsConfirm`.
- Replace local success/error message helpers with `useGdsToasts` or `showGdsNotification`.
- Ensure destructive actions restore focus after confirmation.

### 8. Public capture, share, recovery, and playback

Issue: `#76`

Target primitives:

- `PublicCaptureFlow`
- `PublicIdentityStep`
- `PublicConsentStep`
- `PublicAcceptStep`
- `PublicShareOverlay`
- `ShareButtonGroup`
- `PlaybackControls`
- `PlaybackOverlayControls`

Exception rule:

Only hardware preview, frame compositing, and timing-sensitive fullscreen playback may remain outside direct package primitives.

### 9. Media cards

Issue: `#77`

Target primitives:

- `MediaCard`
- `MediaPreviewCard`
- `ListingCard`
- `ProductCard`

Image rules:

- Images must not crop when the operator needs full visual inspection.
- Aspect ratio must never be distorted.
- Cards with a primary open action should be clickable on mobile.
- Dedicated `Open` links should be removed only when the card itself exposes the same accessible action.

### 10. Compliance enforcement

Issue: `#78`

Release gate:

- `gds-adoption.json` is current.
- Direct page-level Mantine imports are removed or listed as exceptions.
- Compatibility shims have exit conditions.
- Docs and release notes are updated.

## Validation

Run before release:

```bash
npm run gds:validate-manifest
npm run gds:check
npm run type-check
npm run lint
npm run build
```

Targeted manual smoke:

- `/admin`
- `/admin/events`
- `/admin/landing-pages`
- `/admin/tryon`
- `/admin/tryon-results`
- `/admin/tryon/vetting`
- `/admin/tryon/analytics`
- public capture flow
- public share/profile flow
- slideshow playback

## Rollback

1. Revert the migration PR.
2. Restore previous `@doneisbetter/*` package versions.
3. Restore previous provider composition if GDS provider startup fails.
4. Re-run type-check, lint, and build.
5. Keep data migrations out of visual migration PRs unless explicitly required.

## Known limitations

- Compatibility shims remain for import stability.
- Many existing admin/editor files still contain direct Mantine imports and must be migrated issue-by-issue.
- Landing page creator CSS remains an approved product-authored exception.
- Capture and slideshow retain runtime exceptions for hardware/media behavior.
