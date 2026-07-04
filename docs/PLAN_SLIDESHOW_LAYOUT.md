# Slideshow Layout Plan

**Status**: Historical plan; core capability delivered  
**Last Updated**: 2026-05-20

This file is retained as historical planning context. It is not the canonical runtime specification for slideshow layouts anymore.

## Current state

The repository now includes:

- `slideshow_layouts` collection support
- layout CRUD APIs
- admin layout management on event pages
- public `/slideshow-layout/[layoutId]` playback
- shared slideshow player reuse inside layout cells

## Canonical docs now

Use these instead:

- [docs/SLIDESHOW_LOGIC.md](SLIDESHOW_LOGIC.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)

## Why this file still exists

It captures the original implementation intent and planning assumptions for the feature, which can still help when reviewing older code decisions.

## Important obsolete assumptions from the original plan

The live system should be trusted over the old plan for:

- exact API request shapes
- admin page placement
- layout builder behavior
- player buffering details
- rate-limit behavior

If you need current behavior, inspect:

- `app/api/slideshow-layouts/**`
- `app/slideshow-layout/[layoutId]/page.tsx`
- `components/slideshow/SlideshowPlayerCore.tsx`
