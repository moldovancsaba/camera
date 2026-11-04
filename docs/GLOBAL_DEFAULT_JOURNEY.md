# Global default guest journey

Camera stores reusable guest journey templates in `experience_templates` and the selected global default in the `admin_settings` row `default-experience-template`. Resolution happens when an event is read: Global → Partner → Event. Inheriting children see parent edits on their next request; a partner or event that saves a local edit gets its own template and stops being changed by the parent.

## Creating the accepted global default

In **Global User Journey**, choose an accepted source event (the control is preselected to **MTK Budapest x Vasas FC** when available), enter a name, and create a journey version. Creation only adds it to the list; it does not change the journey that guests see. To activate it, select the version under **Experience defaults** and save the choice. This sets the global default for partners and events that inherit it. The code change does not write to the production database, so the global setting changes only after an admin saves the selection.

The snapshot keeps the reusable page flow and ordering, including the messages-only selection step. It removes the source event's name-specific wording, consent and identity content, image/frame URLs, event styling, and CTA destination. Welcome, consent, identity and completion text use the destination event's language. The welcome screen and all visual assets continue to come from the destination's event/partner defaults.

## Inheritance behavior

- New partners without their own default follow the global journey. New events are created in inherit mode and follow Global → Partner → Event.
- A partner can keep following the global default, disable it, or choose a partner-owned default template. A partner-owned version is stable when the global template changes.
- An event can follow its current parent default, choose one of its event-owned versions, or use its own saved pages. Creating an additional version does not activate it; the editor must select and save it.
- The Event User Journey page creates Event-owned versions only. Global and Partner versions are created in their respective editors; event-level access never renders duplicate Global/Partner template-creation panels.
- The selection is managed at the top of **Event User Journey**. It controls the journey returned to the capture page, so the event capture URL, short link and QR codes continue to work and serve the selected flow without changing their addresses.
- Saving a page or journey setting on an inheriting event forks an event-owned template before saving, so the parent is not changed. The event selector refreshes after that fork and lets the editor switch between the inherited flow and the new event-owned version.
- An inherited child’s untouched settings continue to update from the parent. Child-owned settings such as visual style, frame/message selections, welcome composition, and local ordering remain local.
- Existing legacy events with stored custom pages are preserved; they do not silently switch to this default. Their owner must explicitly select **Follow the parent default** in Event Experience Defaults.

## Safety and verification

Global snapshots are identity-free and must not include consent receipts, participant data, event-specific URLs, source-client art, or brand colors. Child-owned media is resolved at the child level and is not copied by the template. If a child saves an edit, the stored version is owned at that child level; renaming it does not affect its parent.

The resolver and global-snapshot tests are in `lib/visual-assets/templates.test.ts`; blank global welcome copy is checked against a Hungarian locale in `components/capture/WelcomePage.test.tsx`. Before merge, run `npm run inventory:check` and `npm run release:check`. A production admin must set the default using the control above after deployment; do not substitute a direct production database write.
