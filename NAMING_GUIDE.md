# Naming Guide

**Version**: 2.9.0  
**Last Updated**: 2026-05-20

Practical naming rules for the current Camera codebase.

## File naming

- utility/modules: `kebab-case.ts`
- React components: `PascalCase.tsx`
- route handlers: `route.ts`
- app pages/layouts: `page.tsx`, `layout.tsx`

## Variable naming

- regular variables: `camelCase`
- booleans: `is*`, `has*`, `can*`, `should*`
- constants and env vars: `UPPER_SNAKE_CASE`

## Functions

- action-oriented `camelCase`
- React event handlers: `handle*`
- auth helpers: `require*`, `optional*`
- API response helpers: `api*`

## Types and interfaces

- `PascalCase`
- no `I` prefix
- props types as `ComponentNameProps`

## Collection and field naming

- collections: lowercase plural
- fields: `camelCase`

Examples:

- `partners`
- `partner_user_access`
- `createdAt`
- `shortUrlSlug`

## Identifier naming

This repo intentionally uses both Mongo `_id` and business IDs.

Name them explicitly:

- `id` or `_id` when you mean Mongo `_id`
- `eventId` when you mean the event UUID field
- `partnerId` when you mean the partner business identifier
- `slideshowId`, `layoutId`, `frameId`, `logoId` for business identifiers

Do not rename everything toward one style if the underlying contract differs.

## Route parameter naming

Match the real contract of the route:

- `[id]` for generic Mongo `_id` pages where context is clear
- `[eventId]` only when the route already uses that convention, even if the actual value is a Mongo `_id`
- `[slideshowId]`, `[layoutId]`, `[lessonId]` for business identifiers

Because the codebase predates some current conventions, prefer preserving established route names over cosmetic renaming that would break links.

## Admin IA terminology

Use the current product language:

- `Camera Core`
- `Events App`
- `Gym App`
- `Partner workspace`
- `Global inventory`

Avoid reintroducing old flat-module wording when documenting or labeling the UI.

## Authorization naming

Use:

- `appRole`
- `appAccess`
- `partnerAccess`
- `navigationAccess`
- `isGlobalAdmin`

Do not use ambiguous names like `role` by itself when both SSO and partner-scoped roles are in play.

## Export patterns

- default exports are acceptable for React components
- named exports preferred for utilities, helpers, constants, and types

## Comments

- explain the why, not the obvious
- keep comments short
- update comments when behavior changes

## Canonical references

- [docs/MONGODB_CONVENTIONS.md](/Users/Shared/Projects/venturecogroup/camera/docs/MONGODB_CONVENTIONS.md)
- [docs/AUTHORIZATION.md](/Users/Shared/Projects/venturecogroup/camera/docs/AUTHORIZATION.md)
- [ARCHITECTURE.md](/Users/Shared/Projects/venturecogroup/camera/ARCHITECTURE.md)
