# Documentation Maintenance

**Last Updated**: 2026-05-23

The running code is the source of truth. Documentation must be updated from the implementation, not from memory.

## 1. Canonical documents

Use these as the maintained operational set:

- [README.md](/Users/Shared/Projects/venturecogroup/camera/README.md)
- [ARCHITECTURE.md](/Users/Shared/Projects/venturecogroup/camera/ARCHITECTURE.md)
- [TECH_STACK.md](/Users/Shared/Projects/venturecogroup/camera/TECH_STACK.md)
- [docs/AUTHORIZATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/AUTHORIZATION.md)
- [docs/MONGODB_CONVENTIONS.md](/Users/Shared/Projects/venturecogroup/camera/docs/MONGODB_CONVENTIONS.md)
- [docs/MONGODB_ATLAS.md](/Users/Shared/Projects/venturecogroup/camera/docs/MONGODB_ATLAS.md)
- [docs/SLIDESHOW_LOGIC.md](/Users/Shared/Projects/venturecogroup/camera/docs/SLIDESHOW_LOGIC.md)

Historical and planning docs may exist, but they are not canonical runtime documentation unless explicitly refreshed.

## 2. Source-of-truth map

| Topic | Source of truth |
|------|-----------------|
| App version | `package.json` |
| Public/admin routes | `app/**/page.tsx`, `app/**/layout.tsx` |
| API surface | `app/api/**/route.ts` |
| Session and auth behavior | `lib/auth/*`, `proxy.ts`, `lib/api/middleware.ts` |
| MongoDB shapes | `lib/db/schemas.ts` plus actual route persistence code |
| Partner-scoped access | `lib/partners/*` and affected admin/API routes |
| Slideshow behavior | `lib/slideshow/*`, `components/slideshow/SlideshowPlayerCore.tsx` |

## 3. Common drift traps

### Version drift

Do not hardcode versions from memory. Read `package.json`.

### Identifier drift

Do not write blanket rules like “everything uses `_id`” or “everything uses UUIDs”.

This codebase intentionally mixes:

- Mongo `_id` for many admin URLs and direct document lookup
- business IDs like `eventId`, `partnerId`, `slideshowId`, `layoutId`, `frameId`

### Authorization drift

Do not document `/admin` as “global admin only” at the middleware layer anymore.

Current model:

- edge middleware allows any valid Camera session
- layout/page/API layers refine global vs partner-scoped access

### Removed product surfaces

Do not document Gym, Workout, or FunFitFan (FFF) routes, APIs, or `appKey: "gym"` unless they exist in the current codebase. Those surfaces were removed; partner access is `events` only.

## 4. Required updates when code changes

Update docs in the same change when you modify:

- admin IA or access model
- Mongo identifier semantics
- slideshow playlist/player behavior
- partner/app routing or access model
- env vars or deployment expectations

At minimum, review:

- `README.md`
- `ARCHITECTURE.md`
- whichever focused doc owns the changed area

## 5. Practical workflow

1. inspect the implementation files first
2. update focused docs before summary docs
3. update `README.md` and `ARCHITECTURE.md` last
4. run type-check and lint if the documentation change accompanies code changes

## 6. Recommended validation commands

```bash
rg --files -g '*.md' -g 'docs/**'
find app/api -name route.ts | sort
find app -name page.tsx | sort
cat package.json
```

## 7. Metadata rules

- use the current package version in active docs where a version field exists
- use absolute dates for `Last Updated`
- if a doc is historical or planning-only, say so directly instead of pretending it is current runtime truth

## 8. Minimum review checklist before closing a docs task

- version numbers match `package.json`
- route names and paths match the current app
- admin and auth behavior match current implementation
- Mongo identifier guidance matches the live mixed model
- Events / Partner model matches the current UX and code

## 9. GitHub tracker handover

The GitHub issue tracker and GitHub Projects board must be kept aligned with the codebase and the canonical docs.

Repository:

- `moldovancsaba/camera`

### Current issue state

As of `2026-05-20` the issue tracker was synchronized to the implementation state:

- Open:
  - `#3` admin UX parent tracker
  - `#8` landing-page generalization follow-up
- Closed as completed:
  - `#4`
  - `#5`
  - `#6`
  - `#7`
  - `#9`
  - `#10`
  - `#11`
  - `#12`

### Required GitHub Projects board state

When the board is writable, the intended Projects status is:

- `In Progress`:
  - `#3`
  - `#8`
- `Done` / `Completed`:
  - `#4`
  - `#5`
  - `#6`
  - `#7`
  - `#9`
  - `#10`
  - `#11`
  - `#12`

### Pending automation handoff

A follow-up Codex heartbeat automation was created because GitHub Projects v2 mutation was blocked by GraphQL rate limiting during the sync pass.

- Automation id:
  - `sync-github-project-board-after-rate-limit-reset`
- Intent:
  - revisit the GitHub Projects board
  - keep `#3` and `#8` active
  - move `#4`, `#5`, `#6`, `#7`, `#9`, `#10`, `#11`, `#12` to completed/done

### Practical follow-up steps

1. Check whether the board sync automation already ran successfully.
2. If not, update the Projects board manually or via GitHub API/CLI after GraphQL rate-limit reset.
3. Reconfirm that issue states still match the live code and canonical docs before changing board columns.
4. If `#8` lands later, close `#8` and then close `#3`, and move both project items to `Done`.

### Do not drift again

- Do not treat the board as the source of truth when it disagrees with code and docs.
- Sync issue bodies/comments first, then sync Projects item statuses.
- Record temporary blockers like API rate limits directly in the canonical docs when handoff is required.
