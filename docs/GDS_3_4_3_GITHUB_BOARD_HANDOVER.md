# GDS 3.4.3 GitHub Board Handover

**Last updated**: 2026-06-07 15:56 CEST  
**Repository**: `moldovancsaba/camera`  
**Project board**: `moldovancsaba` Project `#24`, `{camera} - From IDEA to LIVE`  
**Related local plan**: `docs/GDS_3_4_3_ALIGNMENT_PLAN.md`

## Purpose

This file is the local handover for synchronizing GitHub issues and the Project board for the Camera GDS 3.4.3 alignment pack.

It was created because the GitHub Project v2 API uses GraphQL and hit the account rate limit during handoff. The issue snapshot was successfully retrieved before the block, and the Project board was synced after the quota reset.

## API state observed

- `gh auth status` succeeded for account `moldovancsaba`.
- REST/core quota had room.
- GraphQL quota was exhausted during Project v2 operations.
- Project item list failed with: `GraphQL: API rate limit exceeded for user ID 2206999`.
- Reset reported by `gh api rate_limit`: 2026-06-07 15:54:46 CEST.
- After reset, issue comments were posted and the justified Project status moves were applied.

## Current live issue snapshot

Fetched on 2026-06-07 before the Project API blocked.

| Issue | Title | Issue state | Project status | Local implementation signal |
|-------|-------|-------------|----------------|-----------------------------|
| `#69` | GDS: Dependency baseline - upgrade Camera to @doneisbetter 3.4.3 | Open | Review (ALMOST) | Package baseline and provider composition are implemented locally. Lockfile/package-manager policy still needs release decision. |
| `#70` | GDS: Adapter removal - direct package consumption for shared primitives | Open | Todo (NEXT) | Local table/responsive shims are removed in the broad working tree. Editor scaffold migration remains active. |
| `#71` | GDS: Admin resources - convert inventory pages to resource manager primitives | Open | Backlog (SOONER) | Inventory pages show package-direct migration work, but full `AdminResourceManager` conversion is not proven complete. |
| `#72` | GDS: Try-on moderation - review layout and semantic action migration | Open | Backlog (SOONER) | Moderation tables and controls have active GDS changes, but full review-layout migration is not proven complete. |
| `#73` | GDS: Analytics reporting - replace raw UI with official chart and table primitives | Open | Review (ALMOST) | Analytics table boundary fix is present; analytics uses official GDS table/reporting primitives in local working tree. |
| `#74` | GDS: Admin forms - migrate editors and email templates to official form primitives | Open | Backlog (SOONER) | Editor/form migration remains active. |
| `#75` | GDS: Operator feedback - centralized notifications confirmations and overlays | Open | Backlog (SOONER) | Root GDS feedback/overlay providers are implemented. Legacy destructive-confirm bridge remains. |
| `#76` | GDS: Public surfaces - capture share recovery and playback primitive adoption | Open | Backlog (SOONER) | Public/capture/slideshow exceptions remain by design. |
| `#77` | GDS: Media cards - official image card primitives and non-cropping behavior | Open | Backlog (SOONER) | Media-card migration needs visual and accessibility confirmation. |
| `#78` | GDS: Compliance enforcement - CI guardrails docs and exception register | Open | Backlog (SOONER) | `gds-adoption.json`, docs, and GitHub Actions release gate are implemented locally; final npm validation lane still needs to be reported back to the issue. |

## GitHub issue comments posted

Posted on 2026-06-07:

- `#69`: https://github.com/moldovancsaba/camera/issues/69#issuecomment-4642877445
- `#70`: https://github.com/moldovancsaba/camera/issues/70#issuecomment-4642877428
- `#73`: https://github.com/moldovancsaba/camera/issues/73#issuecomment-4642877435
- `#75`: https://github.com/moldovancsaba/camera/issues/75#issuecomment-4642877430
- `#78`: https://github.com/moldovancsaba/camera/issues/78#issuecomment-4642877920

### Issue `#69`

```text
GDS 3.4.3 handoff update, 2026-06-07:

- Local dependency/provider baseline is implemented.
- Root Camera provider composes the official GDS feedback/overlay providers.
- `gds-adoption.json` and docs now target the 3.4.3 package line.
- Remaining release decision: package-manager/lockfile policy (`package-lock.json`, `pnpm-lock.yaml`, or both during transition).

Recommended Project status: Review (ALMOST) after the lockfile policy is confirmed and validation remains green.
```

### Issue `#70`

```text
GDS 3.4.3 handoff update, 2026-06-07:

- Local table/responsive adapter removal is in progress in the working tree.
- `DataTable` and `ResponsiveDataView` local shims are removed in the current migration state.
- Editor scaffold migration remains active and must keep an explicit exit condition.

Recommended Project status: keep open as partial unless the editor scaffold exit criteria are completed. If Project status is changed, use Review (ALMOST) only for the adapter families already removed, not for full issue closure.
```

### Issue `#73`

```text
GDS 3.4.3 handoff update, 2026-06-07:

- Analytics tables moved behind a client boundary so function props are not passed from a Server Component into a client table.
- Try-on analytics now uses official GDS analytics/reporting primitives in the local migration state.
- Collector access to older/partial try-on job records was hardened.
- Verified earlier with type-check, targeted ESLint, and production build during the analytics-page fix.

Recommended Project status: Review (ALMOST), pending final GDS checks and `/admin/tryon/analytics` manual smoke.
```

### Issue `#75`

```text
GDS 3.4.3 handoff update, 2026-06-07:

- Root provider baseline is implemented for GDS notifications, toasts, overlays, and confirmations.
- `lib/gds/confirm-destructive.tsx` remains as a legacy bridge.
- Remaining work: replace destructive-confirm call sites with `useGdsConfirm` / official GDS feedback APIs and verify focus restoration.

Recommended Project status: keep open as partial. Move to Review (ALMOST) only after call-site migration and focus/accessibility checks are complete.
```

### Issue `#78`

```text
GDS 3.4.3 handoff update, 2026-06-07:

- `gds-adoption.json`, GDS adoption docs, component rules, and the GDS 3.4.3 alignment plan are updated locally.
- This issue should remain the final release gate.
- Required validation before closure: `gds:validate-manifest`, `gds:check`, type-check, lint, build, and targeted manual smoke for admin/public surfaces.
- Project board sync was temporarily blocked by GitHub GraphQL rate limiting during handoff; local board-sync details are captured in `docs/GDS_3_4_3_GITHUB_BOARD_HANDOVER.md`.

Recommended Project status: keep open until final gate.
```

## Project board status moves

Applied on 2026-06-07:

| Issue | Recommended Project status | Reason |
|-------|----------------------------|--------|
| `#69` | Review (ALMOST) | Baseline implemented; only release/package-manager policy remains. |
| `#73` | Review (ALMOST) | Analytics implementation has concrete local fix and verification path. |
| `#70` | Todo (NEXT) or Review (ALMOST) only if scoped partial is acceptable | Broad adapter work is partial because editor scaffolding remains active. |
| `#75` | Backlog (SOONER) or Todo (NEXT) | Provider baseline is done, but call-site migration remains. |
| `#78` | Backlog (SOONER) | Final gate; do not close early. |

Keep `#71`, `#72`, `#74`, `#76`, and `#77` open in Backlog (SOONER) unless implementation evidence and verification are added.

## Verification still needed before release

Use the repository release lane.

```bash
npm ci
npm run gds:validate-manifest
npm run gds:check
npm run type-check
npm run lint
npm run build
```

Targeted smoke:

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

## Local verification run

Run on 2026-06-07 with `pnpm` because `npm` was not available on this shell PATH. The GitHub Actions release gate uses `npm ci` on the hosted runner because `package-lock.json` is the canonical repository lockfile.

```bash
pnpm run gds:validate-manifest
pnpm run gds:check
pnpm run type-check
pnpm run lint
pnpm run build
```

Results:

- `gds:validate-manifest`: passed.
- `gds:check`: passed, including the Camera scoped GDS boundary check.
- `type-check`: passed.
- `lint`: passed with 23 warnings, 0 errors. Warnings are existing React hook/compiler, no-img, and unused-variable warnings outside the GDS release-gate work.
- `build`: passed. `/admin/tryon/analytics` compiled as a dynamic route.
- Local authenticated HTTP smoke: passed.
  - Dev login used `role=superadmin`.
  - `GET /admin/tryon/analytics` returned `200 OK`.
  - Response contained the Try-On Analytics page, official analytics table markup, and live analytics rows.

Remaining release work:

- Report the npm release-gate result back to issue `#78`.
- Run visual/browser smoke for the full manual target list. Browser-control tooling was not exposed in this session, so the analytics check used HTTP instead of an in-app browser screenshot.
- Decide whether the 23 lint warnings are acceptable for this release gate or should be split into follow-up hardening issues.

## Local working-tree caution

The local working tree contains broad GDS migration changes beyond the analytics-page fix and documentation updates. Do not revert unrelated files while syncing the GitHub tracker.
