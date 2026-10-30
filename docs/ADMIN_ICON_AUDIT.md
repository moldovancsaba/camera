# Admin icon and status audit

## Decision

Use the existing Google Material Icons font for compact visibility indicators: a green `visibility` eye means available/visible, and a red `visibility_off` eye means inactive/hidden. Each icon has a localized accessible name and a title; colour is not the only status cue. The font stylesheet is already loaded from the application root.

## Replaced visibility status text

The shared indicator now appears in:

- Global event, partner, frame, logo, slideshow and landing-page inventories.
- Event and partner detail headers and the event list on a partner page.
- Assigned frame rows, landing-page and slideshow cards, QR text cards, tracked event links and welcome-screen backfill rows.
- Inactive or child-hidden image, frame and logo cards across global, partner and event libraries.

The data and visibility rules are unchanged. The icon is only a presentation of the existing status.

## Keep the text

These are controls or explanations rather than redundant status badges, so retain their words:

- Active checkboxes and “Switch on/off” actions, which tell an administrator what setting or change they are choosing.
- Availability explanations such as “Inactive events will not be available for frame selection.”
- “Hidden at this event/partner” section headings and descriptions, which explain the scope of an inherited-asset hide.
- User-account and partner-access assignment states. Those describe access grants, not whether an asset is visible, so an eye icon would be misleading.
- Destructive, recovery, consent, review and analysis states, where an icon alone would obscure a consequential distinction.

## Other safe candidates for a later pass

| Candidate | Recommendation | Guardrail |
| --- | --- | --- |
| Copy, open-in-new-window, and preview actions | Keep the existing familiar icon; use an accessible name and tooltip on icon-only buttons. | Preserve a visible text label when the action is destructive, unfamiliar, or hard to infer from context. |
| Repeated date, location, and count metadata labels on compact cards | Consider adding small icons to support scanning. | Keep the value and a programmatic label; do not replace the only language-independent context with a glyph. |
| “Default” and “Shared with children” badges | Consider star/share icons when cards are crowded. | Retain a tooltip and accessible name, and distinguish a child-level hide from a parent-level stop-share. |
| Scope labels such as Global, Partner, and Event | Keep text. | Scope determines ownership and permissions; similar icons alone are too easy to confuse. |

## Review rule

Replace text only when it repeats a familiar visual status or action. Every icon-only meaning needs a localized accessible name; interactive icons also need a keyboard-operable control and a visible focus state. Keep words for instructions, decisions, warnings, and states whose distinctions matter to the next step.
