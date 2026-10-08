# UI language of an event (camera#352)

The language of the user interface is a setting of the **event**: `Event.uiLanguage`, `en` (the default, also when the setting is missing) or `hu`. It decides the language of every **default** text of the user journey (the capture flow), the public photo page and the emails the user gets. It does not touch the admin screens.

## How it works

- **One dictionary per language:** `lib/i18n/messages.en.ts` (the key list and the English texts) and `lib/i18n/messages.hu.ts` (Hungarian, informal "te", owner decision 2026-10-08). The Hungarian file must have every key of the English one (the type checks it, a test checks the `{markers}`).
- **Server code:** `translate(language, key, values?)` from `lib/i18n`.
- **Client code:** the capture layout (`app/capture/[eventId]/layout.tsx`) sets the language of the event in `UiLanguageProvider`; a component calls `useT()` and gets `t(key)` and `own(key, storedText)`. Without a provider the language is English, so nothing changes where none is set. The provider also sets `<html lang>`.
- **An editor's own text wins** over the dictionary (main rule 18): `own(key, storedText)` returns the editor's text when there is one. The page editor used to pre-fill and save the English defaults as if they were the editor's own, so in another language **a stored text that is exactly the English default counts as not set** (`textOr` in `lib/i18n`), and the dictionary text shows. No stored data is changed.

## Setting it

Event editor, "Customization", "User interface language"; `PATCH /api/events/<id>` with `uiLanguage` (`"hu"`, `"en"`, or empty for the default). `GET /api/events/<id>` returns it.

## What uses the dictionary today

- **The capture flow (step 2):** every text of the pages and of the capture page: the default consent and login pages (built on the server in the event's language, with the legal links of that language: `seyuselfies.com/<language>/...`), the camera screens (device camera and webcam), the photo screen (`ReframeStep`), the waiting and share screens, the CTA and restart pages, the social login buttons, the try-on selector, the tour (steps, buttons and replay button), the save and email notices, the tab title and link preview text. The take-photo settings (20 texts), the approval texts and the redirecting message use `own(key, storedText)`.
- **Server error texts** the fan can see in the save notice (`lib/i18n/errors.ts`): English stays the server's own text; in another language a known text is translated, a network failure gets its own text and anything unknown becomes the general "unexpected error" text.
- **The tour** points at `data-tour-id` attributes, not at `aria-label` texts, so translating a label cannot lose a step.

## Not yet (the next steps of #352)

- The public photo page and its notices, and the emails (step 3 and 4); the global error page `app/error.tsx` and `app/capture/loading.tsx`, which sit above the event and do not know its language; the old no-event `/capture` page; the texts of the share page and the emails that an editor stored in English.
- The partner-level default for its events and "same as the partner" on the event (#353, items 104 to 107 of the plan).
