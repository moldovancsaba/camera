# Documentation Maintenance

**Last Updated**: 2026-05-20

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
| Session and auth behavior | `lib/auth/*`, `middleware.ts`, `lib/api/middleware.ts` |
| MongoDB shapes | `lib/db/schemas.ts` plus actual route persistence code |
| Partner-scoped access | `lib/partners/*` and affected admin/API routes |
| Slideshow behavior | `lib/slideshow/*`, `components/slideshow/SlideshowPlayerCore.tsx` |
| Gym / FFF behavior | `lib/funfitfan/*`, `lib/gym/*`, `app/workout/**`, `app/fff/**` |

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

### Gym / FFF drift

Do not describe Gym as a separate product stack. It is an app surface built on Camera infrastructure.

## 4. Required updates when code changes

Update docs in the same change when you modify:

- admin IA or access model
- Mongo identifier semantics
- slideshow playlist/player behavior
- Gym/FFF routing or data model
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
- Gym / Events / Partner model matches the current UX and code
