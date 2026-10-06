# Camera GDS Release Gate

> **Status (2026-09-28)**: `.github/workflows/ci.yml` runs `npm run inventory:check` + `npm run release:check` on push/PR to `main` (reintroduced in v12.2.2 after the 2026-06 removal in `c0b8b54`). Vercel deploys are not gated on it — every push to `main` deploys whether CI passes or not — so run `npm run release:check` before every push to `main` (and before merging UI/admin/public/GDS changes). It chains the full sequence below and exits non-zero on the first failure.

**Last Updated**: 2026-09-28

## Purpose

This document defines the required release gate for Camera changes that touch UI, admin workflows, public flows, or GDS package boundaries.

Camera uses the Sovereign Squad General Design System through the `@sovereignsquad/*` packages, installed from vendored release tarballs (`vendor/gds/*.tgz` via `file:` specs, 6.3.0, since v12.3.29) — no registry or token needed. The machine-readable contract is [gds-adoption.json](../gds-adoption.json).

## Package Manager

`npm` is the canonical release and CI package manager for Camera because this repository carries `package-lock.json`.

Local `pnpm` runs may be used for developer convenience only when they do not modify repository artifacts. Release verification uses:

```bash
npm ci
```

## Required Checks

Run the whole gate with one command before a production release:

```bash
npm ci
npm run release:check
```

`release:check` runs, in order and fail-fast:

```bash
npm run gds:validate-manifest   # GDS manifest is well-formed
npm run gds:check               # GDS compliance + import-boundary check
npm run type-check              # tsc --noEmit
npm run lint                    # eslint . (incl. the RSC boundary rule, #82)
npm run test:unit               # DB-free unit tests (node:test via tsx)
npm run verify:production-guards # dev/e2e/debug routes 404 in production (#85)
npm run build                   # production build
```

Not included in `release:check` (require a live MongoDB, run separately when the
change touches those surfaces): `npm run test:e2e:safe`.

## Compliance Rules

The manifest enforces the active GDS boundary:

- official GDS package contracts must be consumed before local composition is added
- `@mantine/core` imports are banned in `app/admin/**` and `components/gds/**` except for documented leaf exceptions
- raw product-specific visual systems must stay inside approved exception surfaces
- every temporary exception must include owner, reason, review date, and exit condition

## Current Import Exceptions

- `components/gds/PublicPrimitives.tsx` is the only file allowed to import `@mantine/core` directly inside `app/admin` or `components/gds` (`scripts/check-gds-boundaries.mjs`). `components/gds/styles.ts` no longer exists.

## Rollback

If the release gate blocks a production fix:

1. Identify whether the failure is manifest validation, GDS compliance, type-check, lint, or build.
2. Revert only the failing change if the product behavior is not required.
3. If the change is required, add a narrow exception to [gds-adoption.json](../gds-adoption.json) with owner, reason, review date, and exit condition.
4. Re-run the full release gate before merge.
