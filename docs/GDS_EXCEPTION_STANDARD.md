# GDS Exception Standard

## Purpose

This document defines a reusable standard for product teams that need to keep limited UI exceptions while adopting the General Design System.

Use it when a surface cannot yet be expressed cleanly through the published GDS contracts, or when a product intentionally allows controlled visual freedom that GDS should not flatten.

This is written to be usable by:

- the GDS team when reviewing consumer gaps
- Camera
- other products adopting `@sovereignsquad/*`

If this document conflicts with the SSOT repository, the SSOT repository wins.

## What an exception is

A GDS exception is a named, reviewable boundary where a product is temporarily or intentionally allowed to diverge from direct package-level GDS implementation.

An exception is valid only when all of these are true:

1. the surface is clearly named
2. the boundary is narrow
3. the reason is concrete
4. the allowed divergence is explicit
5. accessibility expectations still apply
6. the review owner is identified
7. the exit condition is documented unless the exception is intentionally permanent

## What an exception is not

An exception is not:

- a vague “special case”
- a product-wide styling bypass
- a second local design system
- an undocumented wrapper family
- a reason to skip accessibility, testing, or observability

## Exception categories

Use one primary category per exception.

### Runtime constraint

Use when the exception is caused by hardware, browser APIs, rendering models, or other runtime constraints.

Examples:

- camera preview hardware flows
- media playback surfaces
- immersive kiosk surfaces

### Product-authored experience

Use when the product intentionally allows creators, editors, or customers to supply controlled presentation logic.

Examples:

- creator-authored landing-page CSS
- branded experience theming inside a guarded content slot

### Package coverage gap

Use when the published GDS packages do not yet expose the pattern contract a consumer needs.

Examples:

- missing shell variant
- missing editor pattern
- missing playback chrome contract

### Migration bridge

Use when the product is actively moving from a legacy implementation to GDS and needs a temporary compatibility layer.

Examples:

- temporary adapter around legacy route composition
- short-lived helper tokens pending route migration

## Required exception fields

Every approved exception should define:

- `surface`
- `category`
- `scope`
- `reason`
- `allowedImplementation`
- `mustStillUse`
- `mustNotDo`
- `a11yRequirements`
- `testingRequirements`
- `observabilityRequirements`
- `owner`
- `reviewDate`
- `exitCondition`
- `status`

## Recommended JSON shape

```json
{
  "surface": "Full-screen media playback",
  "category": "runtime-constraint",
  "scope": [
    "components/slideshow/**",
    "app/slideshow/**"
  ],
  "reason": "The surface is immersive, timing-sensitive, and does not map cleanly to current shell/navigation contracts.",
  "allowedImplementation": [
    "Custom playback layout",
    "Custom timing and gesture handling"
  ],
  "mustStillUse": [
    "@sovereignsquad/* provider and theme runtime",
    "documented theme tokens where practical",
    "GDS admin surfaces for surrounding configuration screens"
  ],
  "mustNotDo": [
    "Create a reusable second shell system",
    "Reuse exception styling as a default pattern for unrelated pages"
  ],
  "a11yRequirements": [
    "Keyboard escape path",
    "Visible focus behavior for interactive controls",
    "Non-pointer fallback for core actions"
  ],
  "testingRequirements": [
    "Build coverage",
    "Focused manual QA for playback states"
  ],
  "observabilityRequirements": [
    "Log load/playback failures",
    "Expose empty/error states"
  ],
  "owner": "product-team",
  "reviewDate": "2026-05-27",
  "exitCondition": "Replace custom playback chrome when an official GDS media-playback contract exists.",
  "status": "approved"
}
```

## Allowed implementation boundary

An exception may customize:

- composition
- flow-specific layout
- media/hardware interaction
- creator-authored presentation within a defined slot

An exception must not silently replace:

- the root provider
- the theme authority
- the package namespace
- baseline accessibility expectations
- admin shell, table, form, state, or toolbar contracts outside the approved scope

## Accessibility baseline

Accessibility is mandatory even inside an exception.

At minimum, each exception must define:

- focus order and focus visibility
- keyboard operation
- screen-reader naming for interactive controls
- loading, empty, and error states
- reduced-motion handling where relevant
- color-contrast expectations

If the exception is full-screen, timed, or media-first, it must also define:

- escape/exit behavior
- pause/stop behavior where relevant
- pointer and non-pointer interaction parity where practical

## Testing baseline

Every exception must define the smallest credible verification set.

At minimum:

- production build passes
- type-check passes
- exception surface has targeted lint/test coverage or targeted manual QA notes
- failure states are exercised

## Observability baseline

Every exception must define operational visibility proportionate to risk.

Examples:

- explicit user-facing error states
- structured logs for runtime failures
- queue/job identifiers for async flows
- retry and timeout behavior

## Review and lifecycle

Every exception should be marked as one of:

- `temporary`
- `approved`
- `deprecated`
- `removed`

Temporary exceptions should include a concrete exit condition.

Approved long-lived exceptions should still be reviewed periodically to ensure they have not expanded beyond their intended scope.

## Consumer guidance

If you are adopting GDS in another product:

1. keep the exception count small
2. keep each scope narrow
3. document the boundary before adding the code
4. prefer improving GDS contracts over normalizing product-specific divergence
5. never use exceptions to justify a parallel local design system

## Camera mapping

Camera currently uses this standard for:

- event capture flow
- residual public surface helper layer
- creator-authored landing-page CSS
- slideshow playback

See [docs/GDS_CAMERA_ADOPTION.md](GDS_CAMERA_ADOPTION.md) and [gds-adoption.json](../gds-adoption.json).
