# Roadmap

**Version Context**: 12.3.41  
**Last Updated**: 2026-10-06

This file is forward-looking only. Active work, with status, is on the GitHub
project board [#24](https://github.com/users/moldovancsaba/projects/24); current
state and owner decisions are in `HANDOVER.md`. Gym / Workout / FunFitFan surfaces
were removed from the codebase in 2026-05; items below reflect the Events-only
platform unless noted.

## Near-term priorities

### Camera module overhaul

- Reliable capture, a stored full-frame original with a reframe step, front
  camera as the global default and lens selection. Plan:
  `docs/CAMERA_MODULE_PLAN.md`; tracker camera#203.

### image.direct as a second renderer

- Run image.direct next to the paused try-on runtime behind a per-event switch;
  retire try-on only after a consented canary and owner sign-off (decision
  2026-10-05). Tracker camera#189; contract and current state in
  `docs/IMAGE_DIRECT_INTEGRATION.md`.
- The long pole is model qualification inside image.direct (its issues #14, #15,
  #18); Camera's own work is dispatch, the per-event setting and admission data.

### GDS 6.7 alignment

- Execute the ordered plan in `gds_fix_handover.md`: official stylesheet instead
  of the forked CSS, bump from 6.3.0 to 6.7.0, then the work packages and the
  items that wait on GDS releases (board issues camera#183-#188).

### 0. Earlier carry-over (v2.15.0 items), now resolved or superseded

- Tracker reconciliation: done; the board was rebuilt on 2026-10-05.
- Error observability (#83): delivered as a structured logger
  (`lib/observability/logger.ts`, v2.17.0).
- Release gate (#78): formalized as `npm run release:check` (v2.17.0) and now also
  enforced by CI (`.github/workflows/ci.yml`: `inventory:check` and
  `release:check`); `main` is protected and requires the `Verify` check.
- GDS UI migrations: logos editor parity (#74) delivered in v2.17.0; the rest
  (#76, #77) is superseded by the GDS alignment plan above.

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
