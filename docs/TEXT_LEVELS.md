# Text levels: the Dictionary, a partner's texts, an event's texts

Issue 353, step 6 of the order of 139 (`docs/BUILDING_BRICKS.md` section 8), owner decisions 159 (global default texts in English and Hungarian, a partner level and an event level) and 167 (an event looks at its parent, nothing is copied down).

## The model

Every default text of the user journey is a key of the dictionary (`lib/i18n/messages.en.ts` and `messages.hu.ts`, 236 keys, one flat list). A text is found by walking the levels, nearest first:

1. **a text an editor wrote on a page** of the journey (the page's own title, button, description): always wins, as before;
2. **the event's wording** (`Event.texts`), written on the event's Texts page;
3. **the partner's wording** (`Partner.texts`), written on the partner's Texts page: it applies to all events of the partner;
4. **the global wording** (`admin_settings`, `settingId: 'dictionary'`), written on the Dictionary page: it applies to every partner and event;
5. **the code dictionary** (English, or Hungarian for an event in Hungarian).

A level stores **only what an editor wrote**, per language (`{ en: { key: text }, hu: { ... } }`); where it wrote nothing it looks at the level above each time. A new partner or event therefore starts with nothing stored and shows what its parent shows, and a wording written at a level is its own and never changed by a later change above. An empty text means "no wording at this level" and is not stored.

## What a wording may be

Plain text, at most 500 characters, no `<` or `>` (nothing is ever rendered as markup, e-mails included), and a text that has `{name}` markers keeps **exactly the same markers** as the dictionary text, so a changed wording can never break the place where a value is filled in. The check is the same in the editor (shown under the input), in the routes (400 with the reason) and when a stored value is read (a wording that no longer passes, for example after a key was renamed, is dropped alone; the rest is kept). `lib/i18n/overrides.ts`.

## The editors

| Level | Page | Menu | Who |
|---|---|---|---|
| Global | `/admin/dictionary` | Settings, **Dictionary** (last) | global admins |
| Partner | `/admin/partners/<id>/texts` | the partner menu, **Texts** | partner managers write, viewers read |
| Event | `/admin/events/<id>/texts` | the event menu, **Texts** | event managers write, viewers read |

One component for the three (`components/admin/kit/TextLevelEditor.tsx`): a language switch, a search, every key in its group (`lib/i18n/catalog.ts`), with **what is used now** (the nearest wording above, else the dictionary) and where it comes from, an input for this level's own wording, and "Use the one from above" to take a wording away. **Save the texts** stores the draft; **Discard the changes** drops it.

| Route | |
|---|---|
| `GET`, `PUT /api/admin/dictionary` | the global wordings (global admin) |
| `GET`, `PUT /api/partners/<mongo id>/texts` | the partner's own wordings and the global ones it takes from above (viewer to read, manager to write) |
| `GET`, `PUT /api/events/<mongo id>/texts` | the event's own wordings, its language, and what it takes from the global and partner levels (viewer to read, manager to write) |

A `PUT` replaces the level's wordings.

## Where the wordings are used

- **The capture app** (`app/capture/[eventId]/layout.tsx` gives them to `UiLanguageProvider`): every text that goes through `useT()` (`t` and `own`), which is every text of the camera, the frame choice, the reframe step, the login and consent pages, the flow steps and the tour.
- **The default pages** (welcome, consent, login): built with the wordings in `withDefaultJourneyPages` (the event API passes them) and in the page editor's journey view (`journeyContext.texts`), so the editor sees what the user sees.
- **The public photo page** (`app/share/[id]`: its headline, labels, buttons, waiting and not-approved notices, the page titles and the link preview texts), the **waiting-for-approval texts** and the **CTA page's "opening" text** (`lib/events/page-texts.ts`, `share-page-settings.ts`: their helpers take the wordings as the last argument).
- **Not yet:** the e-mail templates, the labels of the try-on pictures on the public photo page, the capture page's own metadata title, and the guided tour still read the code dictionary; they take the same `texts` argument when they are wired (`translate(language, key, values, texts)`, `textOr(..., texts)`). The Dictionary lists their keys already; a wording written for them has no effect until then.

## What does not change

Nothing is stored until an editor saves; an event or partner with no wording shows exactly what it showed. No text an editor wrote on a page is touched. The code dictionary stays the last fallback, so a missing wording can never leave a page without text.
