# Libraries: Global -> Partner -> Event

Epic camera#361. Owner direction, 2026-10-08: three libraries, **one way only, Global -> Partner -> Event**, for frames, logos and every other visual
element. This file is the reference for the model, the data, the rules and the pages. The decisions (110 to 121) are in the epic.

## The model

| Level | What it holds | Who manages it |
|---|---|---|
| **Global** | The items the global admins collect. Every item that existed before the libraries is global. | Global admins (`/admin/frames`, `/admin/logos`) |
| **Partner** | The items the partner **took from the global library**, plus the partner's **own uploads**. | Partner managers and global admins (`/admin/partners/<id>/frames`) |
| **Event** | The items the event **took from its partner's library**, plus the event's **own uploads**. This is the "Assigned" list of the event. | Events managers of the partner and global admins (`/admin/events/<id>/frames`) |

Nothing flows upwards or sideways. **An event cannot take an item from the global library directly**: it takes it from its partner's library, or it uploads
its own. A partner can only take items that are global. The pictures are always visible in every list (a picture, or the words "No picture").

## The data

- **Scope of an item.** `frames` and `logos` documents may carry `scope` (`global`, `partner`, `event`), `partnerId` (the partner UUID) and `eventId` (the
  event UUID, `Event.eventId`). A **missing scope means global**, so nothing that existed changes. The global lists (`GET /api/frames`, `/admin/frames`)
  show global items only; `/admin/frames?scope=all` lists every upload.
- **Partner library.** `Partner.library.frames` and `Partner.library.logos` hold the ids the partner took from the global library. The partner's own
  uploads are not listed there (they carry `scope: 'partner'` and the partner's UUID). `Partner.defaultFrames` (and `defaultLogos`) mark the items that are
  assigned to every **new** event of the partner; a default is always an item of the partner's library.
- **Event library.** `Event.frames[]` and `Event.logos[]` are the assignments, as before. An upload at the event level is a frame with `scope: 'event'`, assigned at once.
  `framesOverridden` / `logosOverridden` say that the event has its own list; the partner's defaults then no longer replace it. Uploading, removing or switching off
  a frame on an event sets `framesOverridden`.

## What the partner had before the libraries (nothing is lost)

A partner that has not saved a library yet has **what it already had**: its default frames and logos and the frames and logos its events already use (only global
items; an event's own upload is not a partner item). That list is computed, nothing is written and nothing is deleted. **The first change saved on the partner library
page makes it the partner's own list**, for every kind at once. Removing an item from the partner library does **not** take it away from the events that already
have it: they keep it, and their page says "No longer in the partner library" (the API tells how many events still use a removed item).

## The rules (lib/library/rules.ts, pure)

- A partner takes **global** items only (`canPartnerAssign`).
- An event takes an item that is in its **partner's library**, or the partner's own upload, or its **own upload** (`canEventAssign`); an event with no partner takes only its own uploads.
- An item that is switched off in its library cannot be newly taken.
- The same item is not assigned to an event twice.

## The API

| Route | Does |
|---|---|
| `GET /api/partners/<id>/library?kind=frames` | The partner library with pictures, what is a default, and the global items it can still add. Viewer and above. |
| `PUT /api/partners/<id>/library` | `{ kind, add?, remove?, defaults? }`. Manager and above. Cascades changed defaults to the events that have not edited their own list. For logos, `defaults` is `[{ logoId, scenario, order }]` and the answer carries the saved `defaultLogos`. |
| `POST /api/partners/<id>/library/upload` | Multipart `kind`, `file`, `name`: an item that belongs to the partner. Manager and above. |
| `DELETE /api/partners/<id>/library/items/<itemId>?kind=frames` | Delete the partner's own upload (refused while one of its events has it). |
| `GET /api/events/<id>/library?kind=frames` | What the event assigned (with pictures, with a flag for items its partner no longer has) and what it can still take. |
| `POST /api/events/<id>/library/upload` | An upload for the event, assigned at once, sets `framesOverridden`. |
| `DELETE /api/events/<id>/library/items/<itemId>?kind=frames` | Delete the event's own upload (unassigns it first). |
| `POST /api/events/<id>/frames` | Assign: now checked by the one-way rule (400 with a plain message). |
| `POST /api/events/<id>/logos` | Assign a logo to a scenario: checked by the one-way rule as well. |
| `DELETE`, `PATCH /api/events/<id>/logos/<logoId>` | Remove, switch off or reorder a logo; with `scenario` (query on `DELETE`, body on `PATCH`) in that scenario only. Sets `logosOverridden`. |
| `GET`, `POST /api/partners/<id>/library/import-messmass-logo` | Whether the partner's logo from messmass can be imported; import it as the partner's own logo (manager and above). |
| `PATCH /api/partners/<id>` | `defaultFrames` and `defaultLogos` must be items of the partner's library. |

`<id>` is the Mongo `_id` of the partner or the event, as in the other admin routes. The code is in `lib/library/` (`kinds.ts`, `rules.ts`, `db.ts`, `upload.ts`, `types.ts`)
and `components/admin/library/` (the thumbnail, the item card and the upload form shared by every library page).

## The capture page

The capture page reads the frames of an event from the event data itself (the library item behind each active assignment, active, newest first) and no longer from
a separate list of the whole library: an event's own upload is not in the global list, and the list stopped at 100. For every event that has frames today the result
is the same as before (checked on the real data: 14 of 14 events).

## Logos (LIB-4, camera#367)

The same three levels as frames (pages `/admin/partners/<id>/logos` and `/admin/events/<id>/logos`), with what is particular to logos (`lib/library/logos.ts`):

- **Scenarios.** An event assigns a logo per scenario (`Event.logos[]`: `logoId`, `scenario`, `order`, `isActive`): `onboarding-thankyou` (on top of the guest pages of the
  flow), `loading-capture` (the capture page while it loads), `loading-slideshow` (the slideshow while it loads) and `slideshow-transition` (no screen shows it yet). One logo can
  be in several scenarios: the defaults gave every event that has logos the same logo in all four (10 of 10 events, 2026-10-08). In a scenario a guest sees the **first active
  logo** by `order` (the event's own order for equal ones), never a random one: the capture page and the slideshow pick it so, and the event page marks it ("Guests see this one").
- **Defaults keep their scenario and order** (`Partner.defaultLogos[{ logoId, scenario, order }]`), set per scenario on the partner page, each a logo of the partner's library;
  a changed list follows into the events that have not edited their own logos (`logosOverridden`), as before. Removing a default logo from the library removes its default rows
  too (the page asks first), so the events that follow the defaults lose it; the events with their own list keep it.
- **Event page.** Per scenario: Assigned, in the guests' order, and Available: the partner's library and the event's own uploads not assigned in that scenario (a logo the event
  shows in one scenario stays available for the others). Switching off and removing act on that scenario only and make the list the event's own. An upload on the event page is
  assigned at once in the scenario the editor chooses (`onboarding-thankyou` by default) with order 0, like an assignment.
- **Global list.** `GET /api/logos`, `/admin/logos` and the logo picker of the landing page editor show global logos only; `/admin/logos?scope=all` lists every logo.
- **The logo from messmass** (decision 120: in the partner library only). messmass provisioning keeps the partner's logo as `Partner.logoUrl`, a file on the logo bucket
  (`docs/LOGO_STORAGE.md`); the guest pages show it through the event's theme when the event has no active logo of its own for those pages (then the event's emoji). The button
  "Import the logo from messmass" on the partner page (`POST /api/partners/<id>/library/import-messmass-logo`) makes it a logo of the partner: `scope: 'partner'`,
  `source: 'messmass'`, `sourceUrl`, pointing at the same file (the bucket's files never change, so no copy is made), after a checked download (https, a host camera trusts for
  logos, no redirect, 8 seconds, 5 MB, an image) and measured with sharp. It is **assigned to nothing**, no event, scenario or default, so the guest pages do not change until an
  editor assigns it. Importing the same address again returns the same logo. On 2026-10-08, 192 partners had a logo address, all on the logo bucket (135 distinct files: 129 PNG,
  5 JPEG, 1 WebP, at most 678 KB), every one importable; none is imported yet, and provisioning does not import it.
- **What guests see did not change:** read-only on the real data, the event logo API (`GET /api/events/<id>/logos`, what the capture page and the slideshow read) answered the
  same before and after this change for all 214 events, by both ids (428 answers), and the event page shows the same order and the same shown logo as that API for the 10 events
  with logos. `components/capture/CaptureStageShell.test.tsx` keeps the order of the stage pages: the event's logo for those pages, else the theme's logo, else the emoji.

## What is done and what comes next

- **Done (LIB-1, LIB-2):** the core, the partner and event pages for frames, upload at both levels, the one-way rule in the API, the global list global-only.
- **Done (LIB-4):** logos on the three levels, the pages with pictures, the logo from messmass as a partner library item (see Logos above).
- **Next:** LIB-3 each message chooses its frame (and the message area of a frame), LIB-5 an Images library, LIB-6 the MTK migration (assigning the imported logo where MTK needs
  it), LIB-7 the audit fixes (frame deletion that also cleans the libraries, paging of long lists).
- A **logo** or an **image** joins a kind by adding it to `LIBRARY_KINDS` and `KIND_META` (`lib/library/kinds.ts`) and its upload to `lib/library/upload.ts`.
