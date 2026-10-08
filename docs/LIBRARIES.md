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
| `PUT /api/partners/<id>/library` | `{ kind, add?, remove?, defaults? }`. Manager and above. Cascades changed defaults to the events that have not edited their own list. |
| `POST /api/partners/<id>/library/upload` | Multipart `kind`, `file`, `name`: an item that belongs to the partner. Manager and above. |
| `DELETE /api/partners/<id>/library/items/<itemId>?kind=frames` | Delete the partner's own upload (refused while one of its events has it). |
| `GET /api/events/<id>/library?kind=frames` | What the event assigned (with pictures, with a flag for items its partner no longer has) and what it can still take. |
| `POST /api/events/<id>/library/upload` | An upload for the event, assigned at once, sets `framesOverridden`. |
| `DELETE /api/events/<id>/library/items/<itemId>?kind=frames` | Delete the event's own upload (unassigns it first). |
| `POST /api/events/<id>/frames` | Assign: now checked by the one-way rule (400 with a plain message). |
| `PATCH /api/partners/<id>` | `defaultFrames` must be items of the partner's library. |

`<id>` is the Mongo `_id` of the partner or the event, as in the other admin routes. The code is in `lib/library/` (`kinds.ts`, `rules.ts`, `db.ts`, `upload.ts`, `types.ts`)
and `components/admin/library/` (the thumbnail, the item card and the upload form shared by every library page).

## The capture page

The capture page reads the frames of an event from the event data itself (the library item behind each active assignment, active, newest first) and no longer from
a separate list of the whole library: an event's own upload is not in the global list, and the list stopped at 100. For every event that has frames today the result
is the same as before (checked on the real data: 14 of 14 events).

## What is done and what comes next

- **Done (LIB-1, LIB-2):** the core, the partner and event pages for frames, upload at both levels, the one-way rule in the API, the global list global-only.
- **Next:** LIB-3 each message chooses its frame (and the message area of a frame), LIB-4 logos on the same three levels (the messmass logo is a partner library item, decision 120),
  LIB-5 an Images library, LIB-6 the MTK migration, LIB-7 the audit fixes (frame deletion that also cleans the libraries, paging of long lists).
- A **logo** or an **image** joins a kind by adding it to `LIBRARY_KINDS` and `KIND_META` (`lib/library/kinds.ts`) and its upload to `lib/library/upload.ts`.
