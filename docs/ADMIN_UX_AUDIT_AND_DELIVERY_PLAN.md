# Camera admin UX audit and delivery plan

**Audit date:** 2026-10-15
**Source reviewed:** GitHub `main`, commit `051cff3153f8ec22407abea1529c2c64bc96f183`
**Tracking issue:** [camera#673](https://github.com/moldovancsaba/camera/issues/673)
**Scope:** event administration, page and theme editing, operational overview, vetting controls, styling and GDS adoption. This is a documentation-only recommendation; no product code is changed in this delivery.

## Executive recommendation

Make each event workspace an operational home with a clear separation between **running the event**, **building its guest experience**, and **managing reusable assets**. Keep the event Overview focused on current health, fresh event numbers, and the links an organiser needs. Move full editors to their dedicated pages. Add one Theme hub that summarizes the event's brand configuration and points to the existing Frames, Logos, and Images editors. Keep text content centrally managed while allowing a page or screen composer to open the same canonical text in context.

Treat **Pages of the user journey** as a visual, ordered representation of every guest-visible page. Do not put automatic backend work such as saving, approval, e-mails, or public-photo availability in the page list. Do not show an embedded checkbox or identity sub-section as a second page. Show the consent page as its own row only when it is actually configured as its own page. The editor must make the order the organiser sees match the guest's runtime order.

For styling, finish the inventory before converting inline values. Camera already uses GDS shells and components, but a broad source scan finds extensive inline layout and style definitions. Classify those values before migration: product-authored event colours and image composition are content; admin spacing, card surfaces, radii, type sizes, and control appearance should come from governed GDS components and supported tokens. Do not replace raw values with guessed `--gds-*` variables: Camera's current instructions explicitly call out a production CSS issue with some semantic role variables. Verify the actual package/runtime contract first, then migrate against the supported GDS API and add a check that prevents drift.

## Audit method and limits

The audit read the current GitHub `main` source, the Camera admin navigation and GDS adoption documents, the supplied screenshots and current GDS/official accessibility guidance. Source evidence includes:

- [Event workspace Overview](../app/admin/events/[id]/page.tsx), which currently composes event data, statistics, capture URLs, theme summaries, slideshow and landing-page managers, gallery actions, and exports.
- [Event context navigation](../lib/adminNavigation.ts), which defines the event's flat menu.
- [Pages of the user journey](../app/admin/events/[id]/pages/page.tsx) and its [manager](../components/admin/CustomPagesManager.tsx).
- [Theme summary sections](../components/admin/StyleSections.tsx), [photo review stage](../components/admin/PhotoReviewStage.tsx), and [GDS adoption manifest](../gds-adoption.json).

This is a **source and screenshot audit**, not a full authenticated browser audit of every role, event state, viewport, and colour scheme. The specific control discoverability issues reported by the owner are treated as valid user evidence; they still need route-by-route browser verification during implementation. The style scan below is a broad, reproducible text search, not a list of 1,244 confirmed defects.

## What is already working well

1. **A dedicated journey pages route exists.** `/admin/events/[id]/pages` is a separate editor and is a better home for page ordering than the general event details editor. Keep the dedicated page and its clear name.
2. **Operational work already has dedicated event pages.** Vetting, Gallery, and Analytics each have routes. This gives the Overview room to become a real dashboard instead of carrying every workflow inline.
3. **Asset editors already exist.** Frames, Logos, Images, Slideshows, and Landing pages have dedicated management routes. Reuse them; do not build a second editor in a Theme page.
4. **Theme inheritance is already represented.** `StyleSections` reports where event colours, frames, and logos come from, and supplies management links. Preserve the inherited/overridden explanation and make it a first-class part of the proposed Theme hub.
5. **GDS foundations are in place.** The manifest identifies the GDS package contracts and the admin shell uses the GDS AppShell. State blocks, workspace headers, resource lists, and several analytics components are already package-backed.
6. **Some high-risk controls are semantically real controls.** In the current source, “Nobody in this photo” is a real button with `aria-pressed`; the rejection reasons are toggle buttons. The vetting issue is therefore primarily prominence, placement, and task clarity in the current implementation—not evidence that the current source emits plain text instead of a button.
7. **A capture short slug already exists.** The event can have a `shortUrlSlug`, shown as `go.messmass.com/{slug}` when configured. The event form owns this value. Preserve that working route and make its state obvious on the dashboard.

## Findings and recommendations

| Priority | Finding | Current evidence | Recommendation |
|---|---|---|---|
| P1 | The event Overview is a mixed dashboard and editor index. | It shows three summary figures and event information, then capture and short-link details, a Vetting card, `StyleSections`, full Slideshow and Layout managers, Landing Page manager, gallery, and exports. | Make it a concise operational dashboard. Keep status, actionable health, live/recent metrics, shareable URLs, and shortcuts there. Move editing lists and forms to their dedicated menu destinations. |
| P1 | The event menu is a long, flat list with no clear task groupings or Theme destination. | `EVENT_CONTEXT_MENU` has Overview, Edit, Pages, Vetting, Vetting words, Gallery, Analytics, Logos, Frames, Images, Texts, Emails, Slideshows, and Landing pages as peers. | Group the menu by the organiser's task: Overview; Guest experience; Brand and media; Screens and destinations; Event operations. Keep labels short, stable, and visible. Add Theme as an overview/configuration hub that links to the existing asset editors. |
| P1 | Organisers cannot get an event-specific overview of operational health and live performance at a glance. | Event analytics exists on a separate page. Overview's metrics are total images, unique emails, and customer emails; no freshness marker, health checklist, journey/approval funnel, or screen freshness is composed there. | Put a compact set of high-value event indicators on Overview and link to the detailed Analytics page. Display a “last updated” time and distinguish zero from unavailable/not recorded. Do not call data live unless the refresh path and its delay are explicit. |
| P1 | Slideshow share links do not have the requested human slug workflow. | Capture has `shortUrlSlug`; slideshow playback uses `/slideshow/[slideshowId]`. No slideshow-specific public slug property or `/slideshow/{slug}` short-link handler was found in the current source. | Add an independently editable slug to each slideshow and show its final organiser-ready URL on the event Overview and slideshow editor. Recommended public format: `https://go.messmass.com/slideshow/{slug}`. Preserve the stable internal slideshow ID behind the redirect. |
| P1 | The journey editor's data model is more complex than the organiser's page-ordering task. | `CustomPagesManager` combines custom pages, defaults, built-in selection page visibility, consent settings, default page order, and page editing. It builds an `effectiveJourney`, while some automatic process steps are intentionally managed elsewhere. | Give organisers one ordered list of guest-visible pages, with clear badges for default, customised, and built-in pages. Keep automatic system actions out of this list. Explain any immovable item inline. Keep embedded consent nested in the identity page and omit a duplicate Accept row unless Accept is a standalone page. |
| P1 | The page-selection field is easy to mistake for plain text or miss as a dropdown. | The frame/message display setting is a native `<select>` with four long choices in the frame/message page row. Its label exists, but the visual affordance and the consequences of each choice are not self-evident from the control. | For four meaningfully different choices, prefer a visibly labelled radio-card group with a short explanation per choice. This exposes the trade-offs without requiring the organiser to open a menu. If the choice count grows, use the GDS select with an obvious label, value, and helper text. |
| P1 | “Nobody in this photo” is present but visually subordinate to person marking. | `PhotoReviewStage` places the button after the people list and selected-person form, and shows it in the people-marking branch. The button is disabled once a person rectangle exists. | Put this decision beside the “People in this photo” heading and before the drawing instruction. Give it a full-width, visible button treatment, selected state, and one-line explanation. Make the unavailable state explain that marked rectangles must be removed first. Confirm this at desktop and phone widths with keyboard and screen-reader checks. |
| P1 | Styles are inconsistent because many admin surfaces own their layout and appearance locally. | Broad search on current `main` matched `style={{` on 185 lines in `app/admin`, 777 in `components/admin`, and 40 in `components/gds`; raw hex/RGB matches were 27, 41, and 4 lines respectively. These are search-hit counts, not unique components or confirmed defects. Examples include custom cards, inline font sizes/radii/gaps, and bespoke modal/layout styling in `StyleSections`, `CustomPagesManager`, and `PhotoReviewStage`. | Generate a current per-file/per-property inventory. Migrate structural admin layout to GDS layout primitives/components; migrate surfaces, borders, spacing, radius, and typography through supported GDS contracts. Keep event-authored theme colours and media presentation as content. Track and explicitly approve genuine exceptions. |
| P1 | The prior generated style inventory is stale and cannot be the basis for a migration. | `docs/_research/element-inventory/gds.json` states it measured commit `6db8dcd` on 2026-10-09 with GDS 6.3.0; current `gds-adoption.json` declares GDS 6.8.0 and current `main` is `051cff31`. | Regenerate the inventory from current `main` and the installed package contracts before estimating or marking style migration complete. Keep the source commit, tool version, scope, and counts in the report. |
| P2 | Inline text editing and central text management can drift into separate concepts. | Texts have a dedicated route; page composers also contain page-specific strings and content fields. Some text is shared default vocabulary, while some is intentionally page-instance content. | Define text ownership per field. Keep reusable/global/partner/event strings in the Texts editor; keep page-instance content with its page. In composition, show the resolved text and provide an “Edit text” action that opens the same canonical field in context. After save, both views must re-read the same source. |
| P2 | Save and error feedback are not consistently page-native. | The journey page save path uses notification feedback, but `CustomPagesManager` also calls the browser's `alert()` when save fails. | Replace browser alerts with the GDS error state next to the save action, preserve edits, focus the error summary, and explain a recovery action. Use consistent saved/unsaved/failed state across editors. |
| P2 | Built-in, default, standalone, and embedded concepts are visible as technical vocabulary. | Journey cards expose labels such as `Built in`, `Default`, and the raw key `frame-message-selection`; embedded consent is managed from a dedicated settings affordance. | Use organiser language for the visible label, e.g. “Choose a frame and message.” Keep technical IDs out of the main description. Distinguish a page guests visit from a setting that changes content inside another page. |
| P2 | The Theme summary is useful but not a coherent place to answer “what does this event look like?” | `StyleSections` is embedded on Overview and contains colour, frame, logo, and image summaries, while editors live on separate routes. | Move the summary to Theme and build a visual, compact preview of the effective event theme, inheritance source, active assets, and direct “Manage” links. Avoid duplicating the full asset editors. |

### Theme versus reusable asset ownership

Theme should be the organiser's **event look and asset assignment hub**, not a competing library. It should show:

- Effective brand colours and where each value comes from: event, partner, Messmass style, or system default.
- Assigned frames and the action to manage assignments in Frames.
- Event logos and their display scenarios, with a direct Logos link.
- Event images available to compositions, with a direct Images link.
- A composed preview of the event's actual welcome/capture/screen styling, with links to Slideshows and Landing pages when those surfaces use the theme.
- Clear inherited/overridden state and a single “Use partner default”/“Customize for this event” action where supported.

The Theme hub should not copy the event's colour values or asset assignment into a second record. Existing editors remain the sources of truth; Theme summarizes the resolved configuration and opens those editors.

### Recommended event information architecture

```text
Event workspace
├── Overview
├── Guest experience
│   ├── Pages of the user journey
│   ├── Texts
│   └── Emails
├── Brand and media
│   ├── Theme
│   ├── Frames
│   ├── Logos
│   └── Images
├── Screens and destinations
│   ├── Slideshows
│   ├── Layouts
│   └── Landing pages
└── Operations
    ├── Gallery
    ├── Vetting
    ├── Vetting words
    └── Analytics
```

“Event details” (name, event date, location, activation state, capture slug, and other identity/configuration fields) can live in a compact Settings destination or in an edit panel reachable from the Overview header. Avoid a generic “Edit” page that mixes unrelated theme, copy, journey, and operational settings. Keep the side menu visible in each event context and make the active destination unmistakable.

## Target Overview dashboard

The Overview should answer four questions without requiring the organiser to hunt through menus:

1. **Is the event ready and healthy?** Show a clear overall state (`Ready`, `Needs setup`, or `Needs attention`) with the specific reason and a link to fix it. Candidate checks: event active/date state; capture slug configured; required page/text configuration present; at least one usable frame or an explicit no-frame mode; no known broken event media; pending vetting count and oldest wait; and, when a screen has reported diagnostics, its last-seen time. If a signal is not collected or cannot be read, show “Not available” or “No screen has reported yet,” never green health by default.
2. **What is happening now?** Show a small set of period-labelled counts: capture visits, saved photos, pending vetting, approvals, rejections, CTA actions, and journey completion where the underlying event data exists. Offer a “Today / Event / Custom range” choice only where those definitions are reliable. State the timezone and last refresh; link every metric to its detailed Analytics view.
3. **What links should I share?** Show copy/open/QR actions for the public capture URL and each active slideshow. Use the short URL as the primary share value when configured; keep the technical fallback URL available. Provide per-link “Copy”, “Open”, and, where applicable, “Download QR” controls with nearby success/failure feedback.
4. **What should I do next?** Show a short task list with status and one-click destinations: configure Pages, finish Theme, inspect Vetting, open the Gallery, or open Analytics. Hide completed setup tasks by default after readiness, but retain a route to all settings.

The Overview should not render full text editors, asset assignment tables, slideshow builders, page forms, or landing-page forms inline. Use compact status summaries and links to those destinations.

### Camera Analytics and Messmass KYC boundary

Treat Camera Analytics as the event-level source of operational truth and Messmass as a separate aggregate reporting destination. The current data dictionary distinguishes Messmass's **KYC variable catalogue** (`/admin/kyc`, `variables_metadata`) from identity verification: it is a catalogue for report variables, not a guest identity check. The Overview must not imply that a guest has passed identity KYC because a Messmass variable exists.

The existing Camera-to-Messmass photo-stats integration sends event-level totals in the `camera_` namespace. The receiving endpoint stores aggregate project statistics and catalog metadata; it does not receive photos, names, e-mail addresses, reviewer identities, person-level annotations, or Journey visit IDs. The current payload already covers saved/approved/rejected photo counts, rejection-reason counts, consent totals, and certain journey and vetting measures. CTA click rate, login-method mix, and new-versus-returning share are available in Camera Analytics/CSV today, but are not included in that Messmass payload.

**Dashboard recommendation:** show the event's live/most-current counters from Camera's own records, with an explicit time range and `Last updated` timestamp. Add a separate Messmass sync status showing whether aggregate sync is enabled, the last successful send, and any error or stale state. Link to Messmass reports from that status. Label Messmass figures as “synced aggregates” and include their timestamp; do not blend them with the fresher Camera figures or call them live. Current outbound sync is opt-in/off by default, is coalesced after relevant changes, and has no scheduled catch-up or manual “Send now” action. Until that is changed, the dashboard should say “Sync off” or report the last known push rather than imply continuous synchronization.

If the three missing rates are later sent to Messmass, send aggregate numerators and denominators under new `camera_` names and calculate the percentages in the report layer. For example, send CTA clicks plus eligible CTA views; never send e-mail/account identifiers to derive returning-user rates. Define the denominator, period, and treatment of anonymous/pseudo users before implementation. Keep Camera's local rate calculation available even when no Messmass identity can be safely linked.

**Actions to make this reliable:**

1. Inventory which overview metrics are event-lifetime totals, period counts, or rates, and state the source and formula beside each metric definition.
2. Add a sync-health contract to the event dashboard: enabled/disabled, last attempt, last success, last error, data-through timestamp, and which aggregate families were sent.
3. Add an operator-triggered retry or “Sync now” only after defining idempotency, authorization, rate limits, and audit logging; otherwise show the retry policy accurately.
4. Make missing Journey data, disabled sync, and a genuine zero visibly different states.
5. Preserve the privacy boundary: only aggregate `camera_` values cross into Messmass; do not use the report variable catalogue as a user profile store.

### Public-link model

- **Capture:** retain the existing event slug at `https://go.messmass.com/{event-slug}` and show it as the main copyable address. If there is no slug, clearly offer the technical capture URL and an edit action to set a slug.
- **Slideshow:** add a slug for each slideshow, not just one per event. Recommended share format is `https://go.messmass.com/slideshow/{slideshow-slug}`. The internal slideshow ID remains the stable target. A slug edit must check collisions and reserved route names; display the final resolved URL beside the editor.
- **Organiser usability:** links need a copy confirmation, a working “Open” action, a visible active/inactive state, and a QR action when organisers commonly put the address on screens or print.
- **Change safety:** decide and document whether changing a slug leaves an old redirect active. For event materials already printed, preserving prior aliases is preferable to breaking a live poster; show which alias is canonical.
- **Analytics:** count visits to each short-link identity/placement without exposing a person's identity. Keep capture-link visits separate from each slideshow-link visits.

## Canonical data and two-way editing

Use a **single-source, many-entry-points** rule:

1. Every editable value has one canonical owner and scope: system, partner, event, page instance, slideshow, or destination.
2. A composition page stores references to reusable text/assets plus page-specific settings. It does not silently copy a shared text into a second independently editable field.
3. Each contextual preview shows the resolved value and provenance: “From event”, “Inherited from partner”, or “System default”.
4. “Edit here” opens the same canonical record in a drawer/inline editor or routes to its authoritative editor with the exact field focused. It must not create an unsaved second copy.
5. Save from either entry point updates the same record. The other open view refreshes, and both display the same saved/unsaved/error state.
6. A contextual action may override a value only when the organiser explicitly selects “Customize for this event/page.” The UI then identifies the new owner and provides a deliberate “Use inherited value” reset.
7. For page-instance copy, the page remains the owner. The Texts library can catalogue reusable snippets and insert them by reference; editing one page instance must not unexpectedly change another page.

Before implementing two-way editing, produce a field ownership table for colours, frame assignments, logos, images, page headings/descriptions/buttons, consent text, e-mail content, slideshow labels, and landing-page content. This prevents “sync” from becoming a second-write mechanism with unclear precedence.

## Pages of the user journey: simplify the model

The organiser's mental model is a sequence of pages. The editor should make that literal:

- Show one row for every **guest-visible page**, numbered in its actual runtime order. Include Welcome, consent when it is its own page, Who are you/login, frame/message selection, Take Photo, CTA, and other configured guest pages when they are in the runtime.
- Keep automatic actions (saving/upload, review/approval, e-mails, public-photo availability) in their dedicated settings. They are not page cards unless the guest actually sees a separate page at that point.
- When consent is configured inside Who are you, show it as a nested “Consent shown on this page” setting and do not show a duplicate Accept page row. Show a separate Accept row only when the organiser chooses the standalone consent page.
- Use the guest-facing name as the card title. Secondary badges may say “Default page” or “Custom page”; raw page-type identifiers should not be the main label.
- Give every movable row visible “Move up” and “Move down” actions. A drag handle can be added as a convenience, but it cannot be the only way to reorder. Keyboard operation, focus retention, and spoken position changes are required.
- After a move, update the displayed number immediately and retain the intended position on save/reload. Show why an item cannot move when a runtime dependency truly constrains it.
- Provide a “Preview journey” that follows the same ordered data the guest runtime uses. Changes in the editor and preview must not depend on separate sorting logic.
- Show settings that alter the page inline, but keep the list scannable. For frame/message selection, make the four modes visible as described above and spell out the effect (including “messages only uses every available message and applies a compatible frame”).
- Keep one clear save action, dirty-state indication, and inline validation. Saving must preserve changes if one field fails.

The formal acceptance rule is **one effective journey definition** consumed by both the editor ordering and guest runtime. The editor must never display an item that the guest sees elsewhere as a duplicate, and it must never hide a guest-visible page that can affect sequence.

## Admin controls and accessibility standard

Apply the same control rules to pages, vetting, asset assignment, analytics filters, and settings:

- Every action is a real GDS button or link with visible action text. Icon-only controls need an accessible name and a visible tooltip where appropriate.
- Selection controls show their current value in a visibly bounded field; labels and helper text are adjacent. For a small, high-impact set of mutually exclusive modes, show radio cards rather than hiding the choices behind a select.
- Toggle buttons expose the selected state (`aria-pressed`) and visually differ beyond colour alone. Disabled controls explain how to enable them or why they are unavailable.
- Put the action where the task occurs. For vetting, make “Nobody in this photo” a primary choice before the user begins drawing rectangles, not after a long person-detail form.
- Keep validation messages beside the field and summarize page errors at the top. Preserve form answers after errors. Replace browser alert/confirm flows with GDS in-page confirmation and error patterns.
- Use visible keyboard focus and test tab order through nav, cards, editors, dialogs, save actions, and move controls. Keep focus stable after reorder and after a modal closes.
- Check control targets against WCAG 2.2 AA's 24 by 24 CSS pixel minimum or spacing exception; adopt a larger internal target for primary touch actions where layout permits. Check text contrast and 3:1 non-text contrast for meaningful control boundaries/state cues in every supported theme.
- Test responsive reflow at phone, tablet, and desktop widths; content must not become one-word-per-line, clipped, or hidden under sticky controls.
- Keep the admin UI language consistent and ensure English/Hungarian strings use the same component states and affordances.

The supplied “Nobody in this photo” complaint is still a real UX defect even though the current source renders a button: a correct HTML element that users cannot find does not complete the task.

## GDS styling and hard-coded style audit

### What the scan says

On current GitHub `main`, a literal source scan found the following lines in the admin surface:

| Path scope | `style={{` matches | Hex/RGB matches | `px`/`rem`/`em` matches |
|---|---:|---:|---:|
| `app/admin` | 185 | 27 | 140 |
| `components/admin` | 777 | 41 | 639 |
| `components/gds` | 40 | 4 | 15 |

The search is intentionally broad: matches can be repeated lines, theme preview values, user-provided colour values, inline layout needed by a composed preview, or comments. It is an inventory lead, not a defect count. The existing `docs/_research/element-inventory/gds.json` is not a valid baseline for this work because it records a prior commit and GDS 6.3.0, while current `gds-adoption.json` states 6.8.0.

### Policy for the migration

1. **Start with package-backed composition.** Prefer the GDS AppShell, WorkspaceHeader, EditorScaffold, forms, state blocks, table/list, media, review, and analytics components where their contract fits. The Camera manifest and GDS boundary checker are existing guardrails; do not build a local design-system replacement.
2. **Use supported token steps, not arbitrary literals.** General Design System 6.8.0 documents the safe styling API (`GdsSafeBox`, `GdsMediaFrame`, `GdsOverflowFrame`, responsive visibility), layout primitives, and supported spacing/shape/type steps. Use only steps supported by the specific prop family; unsupported token strings can resolve to no CSS.
3. **Resolve the colour-token contract before broad edits.** Camera's `CLAUDE.md` directs admin code to read `--mantine-*` values rather than certain `--gds-*` role variables because the production build has emitted invalid `light-dark()` values for those roles. Do not blanket-replace colour values with `--gds-*`. Verify the installed 6.8.0 output and theme lane; either fix/confirm the shared GDS role contract first or use the currently supported theme/package API.
4. **Keep brand data distinct from admin chrome.** Event brand colors, uploaded art, frame previews, slideshow imagery, and user-authored landing-page design are configurable content. They should not be replaced with generic admin tokens. The enclosing admin controls, surfaces, spacing, type, and feedback should be governed.
5. **Use narrow, written exceptions.** If a surface genuinely needs freeform styling (live camera/compositing, slideshow playback, image/color preview, or user-authored composition), classify its exact properties and boundary. Do not use “inline style” as an automatic blanket exemption.
6. **Make the migration measurable.** Regenerate the per-file inventory at current main, classify each result as (a) package component, (b) supported token/layout prop, (c) event/user content, or (d) reviewed exception. Add or update checks for undefined tokens, raw colours in admin chrome, and unapproved inline surface styles. Keep the remaining exception list current.

### Design-system evidence and external references

- Camera's contract is recorded in [`gds-adoption.json`](../gds-adoption.json), [`docs/GDS_COMPONENT_RULES.md`](GDS_COMPONENT_RULES.md), and [`docs/GDS_EXCEPTION_STANDARD.md`](GDS_EXCEPTION_STANDARD.md).
- The shared GDS 6.8.0 styling contract is documented in the General Design System's `docs/SAFE_STYLING.md`, `docs/DESIGN_TOKENS_DTCG.md`, and `docs/SEMANTIC_ROLE_TOKENS.md`. These should be treated as the token/API source, with Camera's colour-role caveat resolved before migration.
- Shared GDS source documents: [Safe styling](https://github.com/sovereignsquad/general-design-system/blob/main/docs/SAFE_STYLING.md), [DTCG design tokens](https://github.com/sovereignsquad/general-design-system/blob/main/docs/DESIGN_TOKENS_DTCG.md), and [semantic role tokens](https://github.com/sovereignsquad/general-design-system/blob/main/docs/SEMANTIC_ROLE_TOKENS.md).
- The GOV.UK Design System advises using a select as a last resort for public-service questions and considering radios when fewer choices can be presented ([Select](https://design-system.service.gov.uk/components/select/)). Its button guidance recommends concise action labels and warns that too many secondary actions make the next step unclear ([Button](https://design-system.service.gov.uk/components/button/)). These are useful usability references; Camera should still use its own GDS components and tokens.
- GOV.UK's error guidance recommends a clear field-level explanation, preserving entered answers, and matching the error summary wording ([Error message](https://design-system.service.gov.uk/components/error-message/), [Error summary](https://design-system.service.gov.uk/components/error-summary/)).
- WCAG 2.2 provides the 24 by 24 CSS pixel target-size minimum with a spacing exception ([W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)) and requires visible keyboard focus ([W3C focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)).

## Prioritized delivery plan

### Phase 0 — Establish the baseline and field ownership

**Deliver:** current route/role/state inventory; current GDS style inventory; data ownership map; definitions for dashboard health and analytics.

**Actions:**

1. Regenerate the GDS inventory from current `main` and record its commit/package version.
2. Review the event workspace in a browser at phone, tablet, and desktop widths, in light/dark or every supported theme. Include global and partner-scoped access, no-event-data, inherited/overridden theme, pending vetting, inactive event, and missing-link states.
3. Map each visible control to its route, API/data owner, and user task. Record confusing labels, hidden actions, duplicated fields, inaccessible focus, and error/empty states.
4. Create the canonical owner/scope table for each editable text and theme value.
5. Define “health” and “live” from data that Camera actually records, with freshness and “not recorded” semantics.

**Exit criteria:** every audited control has an observed route/state; every dashboard metric has a formula/source/timezone; every editable value has one declared owner; hard-coded-style counts are classified and reproducible.

### Phase 1 — Rebuild the event Overview as a dashboard

**Deliver:** compact operational event Overview, with links to dedicated work pages.

**Actions:**

1. Keep event identity/status in the header and add clear “Edit event” and “Pages of the user journey” actions.
2. Add the actionable health panel and the compact analytics strip described above.
3. Add public-link cards for capture and every slideshow, with copy/open/QR states.
4. Add next-action/setup cards pointing to Theme, Pages, Vetting, Gallery, and Analytics.
5. Move long-form slideshow, layout, landing-page, gallery-management, and export surfaces to their dedicated destinations; keep only summary counts/links here.

**Exit criteria:** an organiser can identify readiness, current workload, share capture, open a slideshow, find the Pages editor, and open vetting from Overview without scrolling through unrelated editors. Unavailable data is visibly distinct from zero.

### Phase 2 — Add the Theme hub and group event navigation

**Deliver:** grouped event menu and Theme route that brings the effective event visual identity together without duplicating asset editors.

**Actions:**

1. Introduce the proposed event-navigation groups and keep the active route visible.
2. Add Theme with resolved colour values, provenance, asset assignments, and links to Frames, Logos, Images, Slideshows, and Landing pages.
3. Move the current `StyleSections` overview summary to Theme; keep only a small readiness/preview summary on Overview.
4. Add direct “Manage” actions at each Theme section and “Customize/Use inherited value” where the data model supports it.

**Exit criteria:** each editable theme value has one editor; every summary link lands at that editor; inherited state is understandable; no assignment editor is duplicated.

### Phase 3 — Make share links organiser-ready

**Deliver:** event capture and per-slideshow short links, with copy/open/QR actions.

**Actions:**

1. Retain the event capture slug behavior; make missing/configured/active state explicit.
2. Add slideshow slug storage and collision checks, namespaced under `/slideshow/` on the short-link host.
3. Show each final URL on the event Overview and the relevant slideshow editor.
4. Add old-slug behavior for changed/printed links, plus a documented ownership model.
5. Record anonymous aggregate visits separately for capture and each slideshow address.

**Exit criteria:** an organiser can copy and open the exact URL to share; the route resolves the intended event/slideshow; collisions are blocked; changing a slug cannot silently strand a live screen/poster.

### Phase 4 — Simplify Pages and canonical in-context editing

**Deliver:** one runtime-aligned ordered journey list and a coherent text editing model.

**Actions:**

1. Define the row types that are actual guest-visible pages versus embedded content versus automatic actions.
2. Render the runtime order from one source; add accessible move controls with clear labels and position updates.
3. Keep embedded consent inside Who are you and show Accept as a row only when it is a standalone guest page.
4. Replace the hidden four-way selector with an explained radio group; make each mode's actual runtime effect explicit.
5. Add page preview driven by the same effective journey structure.
6. Implement canonical text references and in-context edits only after the field ownership table is approved. Show provenance, dirty state, save result, and reset-to-inherited actions.

**Exit criteria:** all guest-visible pages appear once; automatic actions do not masquerade as pages; every move is retained after save/reload and matches the preview/runtime; editing text from either entry point updates the same owner.

### Phase 5 — Fix admin control discoverability and feedback

**Deliver:** consistent, visible, accessible controls across event pages and vetting.

**Actions:**

1. Move and visually strengthen the “Nobody in this photo” choice; show selection, availability, and prerequisite state.
2. Standardize button labels, menu affordance, radio/select choice presentation, focus, disabled explanations, and feedback placement.
3. Replace browser alert/confirm paths with in-page GDS patterns; keep unsaved user input after failure.
4. Check mobile layouts, contrast, focus, target size, keyboard sequence, screen-reader names/state, and English/Hungarian copy.

**Exit criteria:** representative organisers can find and complete the primary tasks without coaching; every action's role/state is visually and programmatically exposed; errors give a concrete next step.

### Phase 6 — Migrate admin styling to governed GDS contracts

**Deliver:** current, classified style inventory; high-traffic surfaces migrated; stable compliance gate.

**Actions:**

1. Confirm current installed package outputs, supported theme tokens, and the unresolved `--gds-*` role issue.
2. Migrate in this order: shell/navigation and event header; Overview cards/metrics; Theme and asset summaries; Pages/editor controls; Vetting controls; lower-traffic settings.
3. Replace repeated custom cards/forms/labels with package contracts where they fit. Use supported spacing/radius/type steps and safe-style/layout helpers. Do not hand-build a Camera-wide token layer.
4. Keep user-authored colors and media in the data layer and visually preview them through GDS-backed controls.
5. Add CI inventory and token checks so new hard-coded admin chrome is caught. Review exceptions with scope and exit criteria.

**Exit criteria:** every admin style match is classified; no undefined token references remain; shared shell and components render correctly in every supported theme; approved exceptions are documented and narrow; GDS checks catch representative violations.

## Follow-up delivery order reviewed 2026-10-16

The requested analytics measures and the admin UX audit are documented and implemented in the merged work described below. The project board is the delivery-state source of truth; this section records why the remaining work is ordered this way. It avoids reopening work already delivered.

| Order | Board item | Recommended delivery | Reason and dependency |
|---:|---|---|---|
| 1 | [#693](https://github.com/moldovancsaba/camera/issues/693) | Reconcile historical approval-email candidates against provider delivery records, reconcile consent state, then resend only messages confirmed undelivered. | The current approval flow is fixed in #691 and the owner confirmed new messages work. A missing app marker alone is not proof of non-delivery; this is an operational backfill that depends on production admin and provider-log access. |
| 2 | [#535](https://github.com/moldovancsaba/camera/issues/535) | Fix journey-page move actions to identify the row by stable page ID, then verify order persistence and guest runtime order after save/reload. | #655 delivered reorder controls. The follow-up page-ID fix was in #660, which closed without merging. The reported reorder defect is therefore not confirmed fixed. |
| 3 | [#692](https://github.com/moldovancsaba/camera/issues/692) | Verify the live Partner/Event text editor exposes the long capture message as `capture.loading`; preserve event-specific wording while migrating any legacy `Event.loadingText` values. Remove the fallback only after the data audit. | #677, #683, and #688 split the capture, event-data, and photo-upload messages. The compatibility alias remains to protect existing records, and the owner has not confirmed the exact text is editable in the live partner/event editor. |
| 4 | [#694](https://github.com/moldovancsaba/camera/issues/694) | Verify the camera-ready prompt on desktop and mobile and make its instruction copy reflect the actual event permissions and configured next step. | #688 improved styling but had no browser walkthrough. This closes the reported desktop-visibility and misleading-editing-copy gap. |
| 5 | [#628](https://github.com/moldovancsaba/camera/issues/628) | Complete the live/phone acceptance of the vetting flow and make operator actions, including “Nobody in this photo,” visually clear, accessible, and distinguishable. | The planned audit names this as a high-risk operator task; code-level delivery does not replace the owner’s real-device acceptance. |
| 6 | [#521](https://github.com/moldovancsaba/camera/issues/521) | Continue the broader service-activity audit and Analytics menu work; validate the Messmass counters with known event totals before enabling any sync. | The specifically requested approvals, rejection reasons, flow time, CTA clicks, login mix, returning/new share, and deletion outcomes are covered by #669, #670, and #680. The broader analytics scope remains open and Camera-to-Messmass counter sending is off by default. |
| 7 | [#415](https://github.com/moldovancsaba/camera/issues/415) | After operational issues, build the shared admin kit, strengthen the GDS/style gate, and migrate the highest-traffic admin screens. | This audit was requested as documentation only. The implementation steps are future work and should not precede the live-flow and operator-facing fixes above. |

### Decisions and limitations

- Do not perform cross-event identity profiling until its purpose, separate consent wording, and retention period are explicitly approved. The KYC recommendations are documented; profiling is not implemented.
- The #680 deletion tombstone preserves future manual and automatic deletion outcomes. Permanently deleted images from before that tracking existed cannot be reconstructed into historical analytics.
- The one-time email backfill is separate from the now-working approval path. Do not resend based only on a missing database marker, and do not resend records whose delivery or consent state is ambiguous.
- The bundled implementation in #660 is obsolete as a unit because its upload/SSO work was superseded by #664–#668. Its stable-page-ID reorder change remains needed and is tracked in #535.

## Validation and success measures

Run moderated task sessions with event organisers and internal reviewers. Measure task completion, time, backtracking, and help requests for:

1. Find and share the capture link.
2. Open the correct event slideshow link for a big screen.
3. Find the event's assigned frame/logo/image and change it.
4. Change a shared text from the Texts menu and from a page composition context.
5. Reorder frame/message selection relative to the other journey pages and confirm the resulting guest order.
6. Set consent inside Who are you and confirm there is only one visible guest step; then configure standalone consent and confirm it appears once.
7. Mark “Nobody in this photo,” approve a photo, and reject with a reason using keyboard and touch.
8. Diagnose an inactive/missing-link/pending-vetting event from its Overview.

Track the percentage of organisers who complete each task unaided, median completion time, misrouted clicks, failed saves, accidental duplicate page configuration, and accessibility defects. For dashboard analytics, separately validate metric definitions against known event records and display freshness. Do not use a metric to claim “live” if it only updates on a page load or only covers the Journey recording period.

## Research references

- [GOV.UK Design System: Select](https://design-system.service.gov.uk/components/select/)
- [GOV.UK Design System: Button](https://design-system.service.gov.uk/components/button/)
- [GOV.UK Design System: Error message](https://design-system.service.gov.uk/components/error-message/)
- [GOV.UK Design System: Error summary](https://design-system.service.gov.uk/components/error-summary/)
- [W3C WAI: WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [W3C WAI: WCAG 2.2 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
- [W3C WAI: WCAG 2.2 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- Camera GDS contract: [`gds-adoption.json`](../gds-adoption.json), [`docs/GDS_COMPONENT_RULES.md`](GDS_COMPONENT_RULES.md), [`docs/GDS_EXCEPTION_STANDARD.md`](GDS_EXCEPTION_STANDARD.md)
- GDS 6.8.0 styling contract: General Design System `docs/SAFE_STYLING.md`, `docs/DESIGN_TOKENS_DTCG.md`, and `docs/SEMANTIC_ROLE_TOKENS.md`

## Current UI consistency gap inventory — 2026-10-30

This is a source-based inventory of gaps to deliver later in small slices, as requested. It covers admin and guest-facing interfaces. It does not claim that every responsive state or assistive-technology flow has been visually exercised. Counts below are reproducible search results from the Camera repository at the audit date; they are triage signals, not defect counts.

### Recent baseline already delivered

- Global, partner, and event navigation now use a shared structure; user-journey links and maintenance tools have explicit locations.
- Partner landing-page and slideshow defaults, inherited visual assets, and the corresponding editors are present.
- The admin language selector is persisted per signed-in user, and language names include their English names. The header selector's visible label was removed in `3bb591cc`; its accessible name remains on the control.
- The event palette path now displays resolved Messmass colours in Camera.
- The old event-admin screenshots and source audits still need to be reconciled against a current browser session after deployment.

### Gaps to address

| Priority | Gap | Current evidence | What a later delivery must establish |
| --- | --- | --- | --- |
| P0 | **A current route, role, viewport, and language baseline is missing.** | The original audit is dated 2026-10-15. The GDS manifest's `lastReviewedAt` is 2026-08-21. Recent fixes have changed navigation, account settings, event defaults, galleries, and analytics since those baselines. | Inventory global, partner, and event routes by role; test desktop, tablet, and phone; include English, a long-label locale, RTL Arabic, and a CJK locale. Record screenshots and expected loading, empty, error, disabled, and success states. |
| P1 | **Form-control appearance and behavior is not yet proven consistent across the admin.** | A source scan finds 44 native `<button>`, `<select>`, `<input>`, and `<textarea>` sites under `app/admin` and `components/admin`; the set includes hidden inputs and intentionally custom controls, so each needs classification. Examples to inspect include `components/admin/FrameSlotsEditor.tsx`, `CheckboxSettingsFields.tsx`, `CustomPagesManager.tsx`, and `app/admin/events/[id]/edit/page.tsx`. | For each visible control, verify GDS ownership, visible border, focus, disabled/loading/error states, label association, keyboard use, minimum touch target, and narrow-screen fit. Replace only controls that lack a justified custom interaction. |
| P1 | **Visible copy and locale coverage need a cross-surface audit.** | The 23-locale system and admin translations exist, but localized wrappers do not establish that every runtime string is translated. A source scan still finds English-only examples such as `FanmassStatusAutoRefresh.tsx`, `DefaultStageCard.tsx`, `LandingPageManager.tsx`, and `StyleSections.tsx`; several labels are appropriate content, while others are admin instructions. | Classify each string as admin UI, guest UI, partner-authored content, or technical identifier. Verify browser → partner → English fallback on guest pages and saved-user → browser → English precedence in admin. Add an untranslated-string scan that distinguishes authored content from UI labels. |
| P1 | **Responsive layouts need route-level visual checks.** | The owner has reported mobile-only visibility and content overlap in prior screenshots. Static GDS/type checks cannot prove that desktop and mobile render the same required sections or that titles, descriptions, and CTAs do not overlap. | Capture the same key flow at phone, tablet, and desktop widths; check overflow, sticky actions, card columns, modal height, long translations, and browser safe areas. Treat the screenshot as evidence for one viewport only. |
| P1 | **Loading, empty, failure, and retry states are unevenly verified.** | Camera has both page-level and API-backed editors, but the current release checks are primarily static/unit/build checks. The admin analytics error was fixed in recent work, while no current browser-state inventory is attached to this audit. | Exercise each data-backed admin page with slow network, empty data, 4xx, 5xx, retry, and save-conflict responses. Preserve user input after failure; prevent duplicate writes; announce state changes accessibly. |
| P2 | **GDS styling debt is not classified at file/property level.** | The admin tree has 189 source files and a text scan reports 1,073 `style={{...}}` occurrences. The scan also finds six `@mantine/core` imports, all in test files. Inline styles often represent image composition or runtime geometry and are not automatically defects; the current exception file already names such boundaries. | Produce a reviewed inventory that labels each style as GDS token/component, authored event content, runtime geometry, or an approved exception. Migrate only admin chrome. Refresh exception ownership and review dates; do not blanket-rewrite composition or playback styles. |
| P2 | **Icon and text substitutions need a single interaction rule.** | [`ADMIN_ICON_AUDIT.md`](ADMIN_ICON_AUDIT.md) defines the green/red visibility-eye behavior and lists candidates. It also correctly keeps consequential states and scope labels as words. | Use icons only for familiar repeated status/action affordances; retain visible text for decisions, warnings, permissions, and unclear actions. Every icon-only control needs a localized accessible name, tooltip where useful, and visible keyboard focus. |
| P2 | **Admin localization and guest/event localization are separate settings surfaces.** | Per-user admin language now exists, while partner/event language remains guest-facing configuration. Similar labels such as “User interface language” can be mistaken for the administrator's own preference. | Keep account preference terminology distinct from event/partner language settings; verify ownership, inheritance, fallback, and preview behavior on each editor. |

### Recommended execution order

1. Establish the current route/role/viewport/language baseline and reconcile production screenshots with the deployed commit.
2. Resolve the approved-photo gallery mismatch using verified record state and the owner's stated consent source.
3. Fix the highest-impact form-control accessibility and responsive defects found in that baseline.
4. Close visible-string and locale-fallback gaps across admin and guest journeys.
5. Exercise loading/error/retry flows for data-backed screens and add regression coverage for reproduced failures.
6. Classify remaining styles and retire only the admin-chrome exceptions that have a supported GDS replacement.

### Audit commands and interpretation

- `rg -n 'style=\{\{' app/admin components/admin | wc -l` — 1,073 matches; includes valid content/layout/runtime styling, not 1,073 defects.
- `rg -n "from ['\"]@mantine/core['\"]" app/admin components/admin | wc -l` — 6 matches, all test files in this snapshot.
- `rg -n '<(button|select|input|textarea)([[:space:]>])' app/admin components/admin | wc -l` — 44 matches, including hidden inputs and custom interactions.
- `npm run gds:check` and `npm run release:check` verify the package boundary and build contracts; neither substitutes for the route/viewport/keyboard audit above.
