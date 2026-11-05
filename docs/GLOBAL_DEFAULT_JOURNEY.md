# Global, Partner and Event User Journeys

Camera stores named journey versions in `experience_templates`. A version contains reusable guest page flow and page configuration; it does not contain guest identity, consent receipts, submissions, analytics, or photo data. The global selected version is stored in `admin_settings` as `default-experience-template`; a partner's selected version is `partners.defaultExperienceTemplateId`; an event's selection is `events.experienceTemplate`.

## The selection rule

Each level can keep multiple named versions, but only one journey is effective for an event at a time:

1. A selected Event User Journey (EUJ) is effective for that event.
2. Otherwise, the event follows its partner's selected Partner User Journey (PUJ).
3. If the partner follows Global, the Global User Journey (GUJ) is effective.

The selected version replaces the parent journey. Parent versions are never overlaid or stacked. A partner can select one PUJ or follow the global default. An event can select one EUJ or follow the partner's current selection. There is no disable/opt-out choice. A child-owned selection is independent from later parent changes; children that still inherit see changes to the selected parent default on their next request.

## Managing versions

- **Global User Journey:** create, rename, edit, and delete unselected GUJs; select exactly one GUJ as the service default. The first GUJ created becomes the default only when no valid global default exists, so the system always has a default once a GUJ is available.
- **Partner User Journey:** create, rename, edit, and delete unselected PUJs; select exactly one PUJ as that partner's default or choose **Follow the global default**.
- **Event User Journey:** create, rename, edit, and delete unselected EUJs; select exactly one EUJ for the event or choose **Use parent default**. Creating a version does not activate it.
- Editing the selected Global or Partner default changes the journey content served to descendants that currently inherit it. Editing an unselected version has no public effect until it is selected. Event-owned edits affect only that event.
- A child edit to an inherited flow creates a child-owned journey version before saving. It never writes into a parent template.

The selected event journey is resolved for the stable event capture URL, short link, and QR codes. Changing a selection does not change those addresses. The admin selection metadata is removed from public event responses.

## Creating a generic global default

In **Global User Journey**, choose an accepted source event, enter a name, and create a GUJ version. The snapshot preserves reusable flow/order and the messages-only selector while stripping source-specific copy, consent/identity content, event links, artwork, and branding. Destination event language and local visual assets remain in effect. Creating a version does not change a currently valid selection. Select the intended version to set the global default; do not change production data directly.

## Existing events with legacy pages

Pre-template events can have `customPages` but no named journey selection. These pages are preserved as the event's current legacy journey; they are not silently replaced by a global default. In **Event User Journey**, create a named EUJ from the event's existing setup and select that snapshot first. Afterward, the event can switch to **Use parent default** while the named snapshot remains available. Both the dedicated journey selector and generic event update API refuse to switch a legacy event directly to inheritance before the snapshot is selected. New events start in inherit mode.

If a saved journey ID no longer resolves to an owned version, runtime falls back to the nearest valid parent default, and the editor marks the selection for repair. Select an available journey and save it. Do not restore the former null/disable sentinel values.

## Safety and verification

Known library assets are validated for ownership, visibility, and active state when a template is saved. Child-owned appearance, consent, identity, and other non-flow settings remain at the child level. Selected templates cannot be deleted; first select a different version at every referencing level. A failed create/update leaves the prior selection in effect; retry after correcting the reported error.

Focused resolution and sanitization tests are in `lib/visual-assets/templates.test.ts`. Run `npm run inventory:check` and `npm run release:check` before merge. The application does not migrate production records or change the selected global default during deployment; an admin chooses the desired default in the UI after deployment.
