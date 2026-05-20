# Roadmap

**Version Context**: 2.9.0  
**Last Updated**: 2026-05-20

This file is forward-looking only.

## Near-term priorities

### 1. Complete partner-scoped authorization rollout

- finish enforcement on remaining admin/API paths not yet moved to the partner-aware model
- verify viewer vs manager vs admin behavior consistently across Events and Gym
- add regression coverage around global-admin bypass and partner scoping

### 2. Continue partner-first admin UX

- deepen partner workspace operations
- reduce remaining flat/global-first workflows where they confuse operators
- make app enablement and partner app settings more explicit

### 3. Landing page generalization

- continue moving landing pages from event-only thinking to reusable experience surfaces
- support app actions cleanly for capture, slideshow, and Gym flows

### 4. Resource ownership clarity

- keep improving ownership and relationship navigation for frames, logos, landing pages, and galleries
- tighten partner/global visibility rules in admin inventory views

## Medium-term priorities

### 5. Submission model cleanup

- reconcile broad TypeScript submission types with the actual persisted submission shape
- reduce compatibility ambiguity around `imageUrl`, `finalImageUrl`, `eventId`, and `eventIds`

### 6. Slideshow operational hardening

- continue tuning playlist query cost
- improve observability and operational diagnostics
- review playlist fairness and layout-cell desynchronization under heavier load

### 7. Gym / FFF productization

- continue separating “Gym App” product language from older FFF implementation naming
- formalize Gym-specific settings, reporting, and partner-level enablement

## Longer-term platform direction

### 8. Camera as a platform

Target direction:

- Camera Core manages partners, resources, galleries, landing pages, and user/access models
- apps consume those resources
- Events and Gym are the first two app surfaces
- future app surfaces can reuse the same partner/resource model

### 9. Storage and media evolution

- evaluate moving beyond imgbb if operational needs, governance, or scale require first-party storage/CDN control

### 10. Observability and governance

- structured logs
- health dashboards
- clearer operational runbooks
- tighter release/change documentation discipline
