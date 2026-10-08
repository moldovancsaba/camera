# Default pages of the user flow and the global switch

Planned with the owner on 2026-10-07 (`docs/WELCOME_AND_DEFAULTS_PLAN.md`, items 26, 34 to 48); delivered by camera#330. Main rule: every element is generated into a ready-to-go default and the editor can always replace it; what an event has set is never deleted.

## The default order

Welcome page, **consent page**, **login page** ("Who are you?"), selfie taking, the rest. The two defaults are added **at read time** (`GET /api/events/[eventId]?audience=guest`, `lib/events/default-pages.ts` and `lib/events/identity-page.ts`), never stored in the event's own pages:

- **Consent page** (`DEFAULT_CONSENT_PAGE_ID`): added right after the leading welcome page(s) when the event gets the journey defaults and has no consent page ("accept" page) before the photo. Three required checkboxes, each with a link that opens in a new tab: "I accept the Terms and conditions" (`https://seyuselfies.com/en/legal/terms`), "I accept cookies" (`https://seyuselfies.com/en/legal/cookies`), "I have read the Privacy policy" (`https://seyuselfies.com/en/policies`). English by default; another language is typed per event. No consent text is drafted: the wording is the legal pages.
- **Login page**: unchanged in content; added for an event that requires vetting (all events now) when it has no login page before the photo. It now sits after the consent page: an event's own consent page right after the welcome page keeps the login behind it.
- **An event's own pages win**: an own consent or login page before the photo is kept and no default of that kind is added.

## The consent page

The `accept` page type takes a **list of checkboxes** (`config.checkboxes`: a text and an optional https link each, up to ten), all required: Continue works only when every one is ticked. A page that only has the older single `checkboxText` shows one checkbox, exactly as before. The finished page leaves **one consent record per checkbox** in the submission's `consents` list (the exact text, the link, the time; `UserConsent.linkUrl` is new and optional). The server does not refuse a photo without a recorded consent (owner decision, item 43): the page itself blocks the user. The admin pages editor edits the list (add, remove, text, link); saving drops a link that is not https and any checkbox without a text.

## The login page rules

Social login and the email form are each optional, but **at least one stays on**: with both switched off the default (both on) applies (`loginOptions`). An empty heading, text, label or button text falls back to its default text (`DEFAULT_IDENTITY_TEXTS`).

## The global switch (item 26)

`Event.journeyDefaults` is set on every event created from now on (camera admin and provisioning from messmass), and such an event gets the defaults. **Existing events get them only when the switch is on**: Admin, Settings, **Journey defaults** (`/admin/settings/defaults`, `GET/PATCH /api/admin/settings/defaults-rollout`, global admins, stored in `admin_settings` as `defaults-rollout`; off until an admin turns it on). Turning it on shows the default consent page at once on every existing event that has no consent page of its own, including events that are running; turning it off takes them away again. Nothing in an event's own pages is ever changed.

## Not part of this

The rest of the planned defaults (the default slideshow and the global defaults library, the welcome page screen, the share page, the editable texts) are separate packages, see the plan.
