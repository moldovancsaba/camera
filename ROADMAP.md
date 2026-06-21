# Roadmap

**Version Context**: 2.14.0  
**Last Updated**: 2026-06-21

This file is forward-looking only. Gym / Workout / FunFitFan surfaces were removed from the codebase in 2026-05; items below reflect the Events-only platform unless noted.

## Near-term priorities

### 1. Complete partner-scoped authorization rollout

- core API enforcement and viewer/manager regression specs are in place (v2.12.0)
- remaining: expand matrix to every partner-touching route and document intentional global-only surfaces

### 2. Continue partner-first admin UX

- deepen partner workspace operations
- reduce remaining flat/global-first workflows where they confuse operators
- make app enablement and partner app settings more explicit

### 3. Landing page generalization

- continue moving landing pages from event-only thinking to reusable experience surfaces
- support app actions cleanly for capture and slideshow flows

### 4. Resource ownership clarity

- keep improving ownership and relationship navigation for frames, logos, landing pages, and galleries
- tighten partner/global visibility rules in admin inventory views

## Medium-term priorities

### 5. Submission model cleanup

- `resolveSubmissionPublicImageUrl()` introduced in v2.12.0; roll out to remaining read/write paths
- reconcile broad TypeScript submission types with the actual persisted submission shape
- reduce compatibility ambiguity around `imageUrl`, `finalImageUrl`, `eventId`, and `eventIds`

### 6. Slideshow operational hardening

- playlist diagnostics and inactive slideshow/event guards added in v2.12.0
- continue tuning playlist query cost
- review playlist fairness and layout-cell desynchronization under heavier load

## Longer-term platform direction

### 8. Camera as a platform

Target direction:

- Camera Core manages partners, resources, galleries, landing pages, and user/access models
- apps consume those resources
- Events is the first app surface on Camera Core
- future app surfaces can reuse the same partner/resource model

### 9. Storage and media evolution

- evaluate moving beyond imgbb if operational needs, governance, or scale require first-party storage/CDN control

### 10. Observability and governance

- structured logs
- health dashboards
- clearer operational runbooks
- tighter release/change documentation discipline
