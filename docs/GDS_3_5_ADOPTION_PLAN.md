# GDS 3.5 Adoption Plan

**Last Updated**: 2026-06-24

## Objective

Move Camera from GDS 3.4.x package consumption to the published `@doneisbetter/*` 3.5.0 contracts while reducing local UI composition, preserving runtime behavior, and keeping the release gate enforceable.

## Implemented in this adoption pass

- Upgraded `@doneisbetter/gds-admin`, `@doneisbetter/gds-core`, `@doneisbetter/gds-theme`, `@doneisbetter/gds-compliance`, and `@doneisbetter/gds-eslint-config` to `3.5.0`.
- Updated [gds-adoption.json](/Users/Shared/Projects/camera/gds-adoption.json) to declare GDS `3.5.0` and the current review date.
- Enabled the GDS 3.5 root provider options in [CameraGdsProvider.tsx](/Users/Shared/Projects/camera/components/gds/CameraGdsProvider.tsx): document color-scheme application and root CSS variable targeting.
- Replaced the local media preview image/layout composition in [MediaPreviewCard.tsx](/Users/Shared/Projects/camera/components/media/MediaPreviewCard.tsx) with the package `MediaPreviewCard` primitive.
- Preserved the Camera-facing media preview adapter API so existing upload, editor, and catalog pages continue to compile without page-by-page rewrites.

## New 3.5 capabilities to adopt next

### 1. Asset upload and preview workflow

Target surfaces:

- `app/admin/events/new/page.tsx`
- `app/admin/frames/new/page.tsx`
- `app/admin/logos/new/page.tsx`
- `app/admin/tryon/suits/new/page.tsx`
- `components/admin/LandingPageEditor.tsx`
- `components/tryon/TryOnSuitSelector.tsx`

Implementation:

- Replace page-local upload state with `useGdsAssetUploadQueue`.
- Add a Camera adapter using `createGdsAssetAdapter` for existing asset upload endpoints.
- Use `validateGdsAsset` for MIME, size, alt-text, caption, and display-mode policy before upload.
- Use `GdsAssetPreviewCard` where no custom action overlay is required.
- Keep [MediaPreviewCard.tsx](/Users/Shared/Projects/camera/components/media/MediaPreviewCard.tsx) only for legacy action overlay compatibility until GDS exposes equivalent action behavior.

Operational behavior:

- Validation failures stay client-visible and do not hit upload APIs.
- Upload failures must expose retry and remove actions.
- Upload timeout should be explicit per endpoint and logged through GDS telemetry.

Testing:

- Unit-test asset adapter validation and request mapping.
- Add E2E smoke for upload, remove, retry, and metadata save paths.

### 2. Admin tables and resource inventories

Target surfaces:

- `components/admin/TryOnQueueTable.tsx`
- `components/admin/TryOnIdentityReviewTable.tsx`
- `components/admin/TryOnResultModerationTable.tsx`
- inventory/list pages currently composed from local table state

Implementation:

- Move query serialization to `serializeGdsTableQuery`.
- Use `useGdsDataTable` and `GdsDataTable` for server-backed lists.
- Use `GdsResourceManager` for inventory screens with actions, permissions, and workflow state.

Operational behavior:

- Tables must have explicit loading, empty, error, retry, and stale-data states.
- Server endpoints must return stable pagination and sorting contracts.
- Client-side infinite scrolling must not re-fetch already-loaded windows unless filters change.

Testing:

- Contract-test query serialization.
- Add pagination, filtering, and retry tests for queue/resource APIs.

### 3. Form orchestration and settings pages

Target surfaces:

- event settings
- email templates
- resend sender settings
- slideshow settings
- event app settings

Implementation:

- Introduce `useGdsFormOrchestration` for dirty state, validation state, submit lifecycle, server errors, and recovery.
- Use `GdsValidationSummary` for grouped errors.
- Use `GdsSettingsTemplate` for settings pages once page actions and section metadata map cleanly.

Operational behavior:

- Prevent accidental navigation with unsaved changes.
- Server validation errors must map to fields where possible and to summary otherwise.
- Submit retries must be idempotent or guarded by request keys.

Testing:

- Unit-test form schema conversion for settings payloads.
- E2E-test validation, save, failure, retry, and dirty-state behavior.

### 4. Access gates and moderation safety

Target surfaces:

- try-on vetting
- approved/rejected/service archives
- resend result actions
- event admin settings

Implementation:

- Model destructive, resend, approve, reject, and service actions through `GdsAccessGate`.
- Add explicit access reasons and action labels so blocked states are understandable.
- Redact access metadata with the GDS redaction helper before telemetry.

Operational behavior:

- Failed access checks must not call mutation APIs.
- Moderation actions must remain human-in-the-loop and never auto-approve rerun results.
- Retry/resend actions must be observable and deduplicated.

Testing:

- Unit-test access contract mapping.
- E2E-test blocked and allowed action states for moderation and resend flows.

### 5. Analytics chart and reporting polish

Target surfaces:

- try-on analytics hourly outcome chart
- export/reporting screens

Implementation:

- Use GDS chart validation for stacked/hourly data before render.
- Use GDS formatting helpers for numbers and dates.
- Replace any remaining bespoke legend/toggle controls with GDS chart/action primitives.

Operational behavior:

- Invalid chart rows must fail closed with an admin-visible data-quality state.
- Export payloads must match the chart aggregation contract.

Testing:

- Unit-test aggregation boundaries by hour, day, and event timezone.
- Snapshot-test chart states: loading, empty, invalid, populated.

## GDS-team follow-ups before Camera can remove all adapters

- `GdsAssetPreviewCard` should render or expose its `actions` prop consistently so upload previews can remove the local action wrapper.
- A formal public camera/capture runtime contract is still needed for hardware preview, frame compositing, countdown, consent, and retake flows.
- A formal slideshow playback runtime contract is still needed for fullscreen timing, queue rotation, overlays, and keyboard-safe controls.
- A creator-authored landing-page theme contract is still needed if custom CSS should become governed by GDS rather than remain a documented product exception.

## Release gate

Every adoption step must pass:

```bash
npm run gds:validate-manifest
npm run gds:check
npm run type-check
npm run lint
npm run build
```
