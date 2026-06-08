# Camera GDS Release Gate

**Last Updated**: 2026-06-07

## Purpose

This document defines the required release gate for Camera changes that touch UI, admin workflows, public flows, or GDS package boundaries.

Camera uses the Sovereign Squad General Design System through the published `@doneisbetter/*` package line. The machine-readable contract is [gds-adoption.json](/Users/Shared/Projects/camera/gds-adoption.json).

## Package Manager

`npm` is the canonical release and CI package manager for Camera because this repository carries `package-lock.json`.

Local `pnpm` runs may be used for developer convenience only when they do not modify repository artifacts. Release verification and GitHub Actions use:

```bash
npm ci
```

## Required Checks

The GitHub Actions workflow [gds-release-gate.yml](/Users/Shared/Projects/camera/.github/workflows/gds-release-gate.yml) runs on pull requests to `main` and pushes to `main`.

Required commands:

```bash
npm ci
npm run gds:validate-manifest
npm run gds:check
npm run type-check
npm run lint
npm run build
```

## Compliance Rules

The manifest enforces the active GDS boundary:

- official GDS package contracts must be consumed before local composition is added
- `@mantine/core` imports are banned in `app/admin/**` and `components/gds/**` except for documented leaf exceptions
- raw product-specific visual systems must stay inside approved exception surfaces
- every temporary exception must include owner, reason, review date, and exit condition

## Current Import Exceptions

- `components/gds/styles.ts` may import Mantine leaf primitives for shared admin styling tokens.

## Rollback

If the release gate blocks a production fix:

1. Identify whether the failure is manifest validation, GDS compliance, type-check, lint, or build.
2. Revert only the failing change if the product behavior is not required.
3. If the change is required, add a narrow exception to [gds-adoption.json](/Users/Shared/Projects/camera/gds-adoption.json) with owner, reason, review date, and exit condition.
4. Re-run the full release gate before merge.
