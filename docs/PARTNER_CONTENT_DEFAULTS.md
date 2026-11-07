# Partner landing-page and slideshow defaults

Partner-owned landing-page and slideshow settings live in `partners.contentDefaults`. Landing pages remain single partner defaults. Slideshow templates are named configurations, not public pages or playable slideshows: event identity, event capture URLs, slideshow IDs, tracked QR links, event photos, and event-specific runtime records remain owned by the event. Global named slideshow templates live in the `global-content-defaults` admin setting.

## Resolution rules

1. An event-owned default is authoritative. Editing an inherited event landing page detaches its `inheritedFromPartnerId` and `inheritedPartnerRevision`; editing or selecting an event default slideshow sets `inheritanceMode: "override"` and removes its inherited markers.
2. If an event has no local override, it uses the active partner default.
3. A partner change increments `contentDefaults.revision`. Inherited landing pages refresh when their event URL is opened; inherited slideshows refresh when the default is ensured or the public playlist is requested. Overrides are never overwritten.
4. A partner landing-page template is materialized as a normal event-scoped landing page targeting that event's default slideshow. The `{eventCaptureUrl}` token becomes `https://camera.messmass.com/capture/<event Mongo id>` (or the configured Camera origin). A generated event-specific slug avoids collision with manually created landing-page slugs.
5. `/landing/event/<event Mongo id>` is the stable event URL. It resolves the event's own default first, otherwise materializes and resolves the active partner template, then redirects to the canonical `/landing/<slug>` page. The normal page keeps existing terms/privacy subroutes and rendering behavior.

### Parent slideshow template selection

1. Global admins can create, edit, rename, delete, and select named slideshow templates in the Global Slideshows page. Exactly one global default is selected whenever global templates exist; the first created template becomes that default.
2. A partner can keep inheriting the global default or select one of its own named templates as the partner default. Creating a partner template does not silently replace its current default.
3. A selected partner default flows down to events that have no event-owned slideshow override. Event slideshow management remains event-scoped and keeps its own photos, runtime IDs, QR destinations, and playback records.
4. The Global/Partner editor uses the same list and form component. Editing a named parent template changes that template in place; it does not copy it into an event. Its two-column editor previews sample content only and never reads or writes event photos or visit data.
5. Background images are selected from the current level's image library. ImgBB is a backup provider and is not the source used by this editor to render the live slideshow or its preview.

## Admin routes and API contracts

- Partner editors: `/admin/partners/<partner Mongo id>/landing-pages` and `/admin/partners/<partner Mongo id>/slideshows`; global slideshow templates are managed at `/admin/slideshows`.
- `GET /api/admin/global-content-defaults` returns the normalized global slideshow template list, selected default ID, selected slideshow configuration, and revision. Its `PATCH` accepts `{ kind: "slideshowTemplate", revision, action, ... }`, where action is `create`, `update`, `rename`, `delete`, or `select`.
- `GET /api/partners/<partner Mongo id>/content-defaults` returns the partner defaults, normalized partner slideshow list/default/revision, and normalized global slideshow state for inheritance display. Partner slideshow `PATCH` uses the same `slideshowTemplate` action contract; `PATCH` for `landingPage` retains `{ kind: "landingPage", value: <template> | null }`.
- Slideshow template writes require a matching revision. A stale write returns HTTP 409 and preserves the latest stored state. Partner writes require partner manager access; reads require partner viewer access. Global writes require an admin session. Template fields are allow-listed and validated.
- Event landing-page manager: **Use partner default** calls `POST /api/admin/events/<event Mongo id>/default-landing-page`. `PUT` with `{ landingPageId }` chooses a local page as the event default and detaches inheritance. Both operations require event manager access.
- Event slideshow manager: **Use partner default** calls `POST /api/admin/events/<event Mongo id>/default-slideshow` with `{ inheritPartnerDefault: true }`. The existing `PUT { slideshowId }` selects an event slideshow and detaches inheritance. Editing an inherited default through `PATCH /api/slideshows?id=<Mongo id>` also creates an event override.

Partner defaults are available only to authenticated users with partner Events viewer/manager access; writes require manager access. Event operations use the existing global-admin or partner-event manager check. Public routes do not expose administrative template data or require a session.

## Failures and recovery

- Resetting to a missing or inactive partner template returns HTTP 409 and leaves the event's current default unchanged.
- If an event has no usable default slideshow while materializing the landing page, the event URL returns an error rather than publishing a page with a broken target. Create/repair the event default slideshow, then retry.
- Landing-page slug collisions are resolved with a deterministic event/partner suffix; the event URL does not depend on that slug and stays stable if the canonical slug later changes.
- Removing a partner template stops further inheritance. Existing inherited slideshow copies return to their saved event-generated baseline; inherited landing copies are removed. Event overrides are unaffected.
- Deleting the selected global or partner slideshow template is rejected with HTTP 409 until another default is selected (or, for a partner, inheritance is selected). Duplicate names at the same level and stale revisions are rejected without partially writing a template.
- Malformed persisted named templates are skipped during read normalization so the admin list can still load and an editor can repair the remaining valid configuration. Invalid legacy slideshow data is not exposed as a selectable template.
- The app writes the materialized landing page before clearing other event-default flags. If the operation fails, the previous event default remains available. Repeating the request is safe.

## Verification and operations

Run `node --import tsx lib/landing-pages/partner-defaults.test.ts`, `node --import tsx lib/slideshow/default-slideshow.test.ts`, `node --import tsx lib/slideshow/parent-templates.test.ts`, `npm run type-check`, `npm run lint`, `npm run test:unit`, and `npm run build`. `npm run db:ensure-indexes` adds the event-default and inherited-copy lookup indexes; index creation is idempotent. No backfill is required: newly created events inherit from the partner template; an existing event begins using it when its stable URL is visited or when its manager selects **Use partner default**.
