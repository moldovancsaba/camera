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

- **Scope of an item.** `frames`, `logos` and `images` documents may carry `scope` (`global`, `partner`, `event`), `partnerId` (the partner UUID) and `eventId` (the
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
have it: they keep it, and their page says "No longer in the partner library" (the API tells how many events still use a removed item). An event that follows the partner's defaults and has the removed item stops following them (`framesOverridden`, `logosOverridden`): the change of the defaults replaces the whole list of an event that follows them, so without this the event would lose the item (decision 116).

## The rules (lib/library/rules.ts, pure)

- A partner takes **global** items only (`canPartnerAssign`).
- An event takes an item that is in its **partner's library**, or the partner's own upload, or its **own upload** (`canEventAssign`); an event with no partner takes only its own uploads.
- An item that is switched off in its library cannot be newly taken.
- The same item is not assigned to an event twice.
- A **global** frame or logo that an event has assigned, a partner library holds or a partner makes a default for new events **cannot be deleted** (`DELETE /api/frames/<id>`, `DELETE /api/logos/<id>`: 409 with the counts, `usageOfItem` and `inUseSentence` in `lib/library/db.ts`, camera#392). Switching it off retires it: nobody can take it any more, and the events that have it keep it. An upload at the partner or event level is deleted on its own page, which refuses while an event of the partner has it.

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

## Messages choose their frame (LIB-3)

- **A message area on a frame** (`Frame.messageArea`, `lib/frame/message-area.ts`): where a message is written on a text-free frame (a box in the 1920 x 1080 frame, a colour,
  optional top and bottom territories): the same data the older `frameDesign.base` holds. A frame **with** a message area carries the messages of an event and is **not** a frame
  the user picks; a frame without one is a complete frame, as before. It is edited on the card of a frame the level owns (the Message area button of a partner or event
  upload) and on the global frame's edit page, with a preview of the boxes on the picture; saving redraws the events whose messages are written on that frame.
- **The frame of each message** (`frameDesign.messageFrames`: the text of a message to a frame id): chosen in the generated frame panel of the event, one frame per message, among
  the event's frames that are assigned, switched on, switched on in the library, and have a message area. The choice goes by the text of the message, so it stays with the
  message when messages are moved; it is checked on save (400 with a plain message) and dropped when its message goes or the list is reset. A snapshot refresh keeps it.
- **Drawing** (`lib/frame/variants.ts`): for each message: the chosen frame (written with the event's font, `renderBaseFrame`), else the older base picture, else the generated
  layout. The image key covers the frame's picture and message area, so only the messages of a changed frame are drawn again; a message with no frame keeps the key it had.
  A chosen frame that is no longer usable falls back quietly (the panel says so); a picture that cannot be fetched fails the run and leaves the images as they were.
- **Users:** an event whose only active frames carry messages has **no frame of its own**, so the generated frames apply (`captureFrameOf`, the capture page, the rollout in
  `lib/frame/backfill.ts`); the event data tells the capture page which assigned frames carry messages (`hasMessageArea`).

## Logos (LIB-4, camera#367)

> **Replaced on 2026-10-09 (camera#419):** the scenario ticks and per-scenario lists described in this section gave way to the slot model described at the end of it. The old data is read and kept until an event or a partner is migrated.

The same three levels as frames (pages `/admin/partners/<id>/logos` and `/admin/events/<id>/logos`), with what is particular to logos (`lib/library/logos.ts`):

- **Scenarios.** An event assigns a logo per scenario (`Event.logos[]`: `logoId`, `scenario`, `order`, `isActive`): `onboarding-thankyou` (on top of the pages of the user journey), `loading-capture` (the capture page while it loads), `loading-slideshow` (the slideshow while it loads) and `slideshow-transition` (no screen shows it yet). One logo can
  be in several scenarios: the defaults gave every event that has logos the same logo in all four (10 of 10 events, 2026-10-08). In a scenario a user sees the **first active logo** by `order` (the event's own order for equal ones), never a random one: the capture page and the slideshow pick it so, and the event page marks it ("Users see this one").
- **Defaults keep their scenario and order** (`Partner.defaultLogos[{ logoId, scenario, order }]`), set per scenario on the partner page, each a logo of the partner's library;
  a changed list follows into the events that have not edited their own logos (`logosOverridden`), as before. Removing a default logo from the library removes its default rows
  too (the page asks first), but an event that has the logo keeps it: it stops following the defaults, as for frames (camera#385).
- **Event page.** Per scenario: Assigned, in the users' order, and Available: the partner's library and the event's own uploads not assigned in that scenario (a logo the event
  shows in one scenario stays available for the others). Switching off and removing act on that scenario only and make the list the event's own. An upload on the event page is
  assigned at once in the scenario the editor chooses (`onboarding-thankyou` by default) with order 0, like an assignment.
- **Global list.** `GET /api/logos`, `/admin/logos` and the logo picker of the landing page editor show global logos only; `/admin/logos?scope=all` lists every logo.
- **The logo from messmass** (decision 120: in the partner library only; owner answers 153 and 169, 2026-10-09). messmass provisioning keeps the partner's logo as `Partner.logoUrl`,
  a file on the logo bucket (`docs/LOGO_STORAGE.md`). It is **collected automatically**: when messmass creates or links a partner that has a logo, camera imports it after
  the response (`collectPartnerLogo`, `lib/messmass/provision.ts`; best effort, a failure is logged), and the button "Import the logo from messmass" on the partner page does
  the same for a partner that has none yet (`POST /api/partners/<id>/library/import-messmass-logo`). Importing makes it a logo of the partner: `scope: 'partner'`,
  `source: 'messmass'`, `sourceUrl`, pointing at the same file (the bucket's files never change, so no copy is made), after a checked download (https, a host camera trusts
  for logos, no redirect, 8 seconds, 5 MB, an image) and measured with sharp. **A new import also makes it one of the partner's logos** (`makeMessmassLogoDefault`,
  `Partner.slots.logo`, after the logos the partner already has; a partner not on the slot model yet keeps what its old default rows amount to): the default of its events, which
  look at the partner, so **nothing is copied into them**; an event with a choice of its own keeps it. **Importing the same address again changes nothing**, so a logo an editor took
  out later is not put back. The scenario ticks are gone (owner, 2026-10-09: the library must not ask where a logo shows). On 2026-10-08, 192 partners had a logo address,
  all on the logo bucket (135 distinct files: 129 PNG, 5 JPEG, 1 WebP, at most 678 KB), every one importable.
- **What users see did not change:** read-only on the real data, the event logo API (`GET /api/events/<id>/logos`, what the capture page and the slideshow read) answered the
  same before and after this change for all 214 events, by both ids (428 answers), and the event page shows the same order and the same shown logo as that API for the 10 events
  with logos. `components/capture/CaptureStageShell.test.tsx` keeps the order of the stage pages: the event's logo for those pages, else the theme's logo, else the emoji.

### The logo on the slot model (camera#419, step 4 of the order in docs/BUILDING_BRICKS.md; data and API done, the pages follow)

The owner's model (2026-10-09): the logo is chosen **at the place of use**, the default by default; the library does not say where a logo shows. Stored as **slots** (`lib/slots/`), only what an editor set, never a copy:

- **`Partner.slots.logo = { items?, useDefault? }`**: the partner's logos, the default of its events. A global logo it picks is added to its library in the same step; its own uploads are fine. "No logo" is `{ items: [] }`. Nothing is pushed into events: they look at it.
- **`Event.slots.logo`** and one place of use per former scenario: `logo-pages` (the pages of the user journey), `logo-capture-loading`, `logo-slideshow-loading`, `logo-slideshow-transition` (no screen shows it yet). A place uses the event's logo by default; the event's logo uses the partner's. **Use the default** stores nothing; **add more** is own items next to the default; **replace** is own items with `useDefault: false`; **none** is no items with `useDefault: false`. One logo is used as it is; several are picked at random by the page.
- **Resolution** is `lib/slots/resolve.ts` (pure); `lib/slots/logo.ts` builds the chain for a place; `GET /api/events/<id>/logos` answers from it **for an event on the model** (`Event.slots` exists, even empty) and, for an event not on it, exactly as before from its own `logos` list: nothing changes for an existing event until it is migrated.
- **The first save of an event not on the model seeds its slots from its old list** (`eventSlotsFromLegacy`): an event that follows its partner and shows what the partner's defaults give stays following; otherwise its list is kept as it showed (one `logo` slot when every scenario is the same, else one place per scenario), all as "replace". The old `logos` list and `logosOverridden` are never deleted or changed. A partner not on the model is read from its `defaultLogos` rows until it saves a choice.
- **API:** `GET` and `PUT /api/events/<id>/logo-slots` (`{ slotId, value }`; the panels with what each place uses now, what it takes from above, what it chose itself, and the logos that can be picked; Events managers to save) and `GET` and `PUT /api/partners/<id>/logo-slot` (`{ value: { items } }`; managers to save). The same one-way rules as before: an event picks from its partner's library or its own uploads, a partner from the global library or its own uploads.
- **Who uses a logo** (`usageOfItem`, the refusal to delete a global logo in use, `deleteLibraryUpload`, removing a logo from the partner library) counts and cleans the slots too, so a logo cannot be deleted from under the slot model.
- **The pages (camera#419, 4.3):** `/admin/partners/<id>/logos` and `/admin/events/<id>/logos` are built on the slot panel (`components/admin/kit/SlotPanel.tsx`): the partner chooses its logos; the event chooses its logo and, for each place of use that has a screen (the pages of the user journey, the loading screen of the capture app, the loading screen of the slideshow), uses the default, picks one from the partner's library, uploads a new one (the upload routes take `slot`), adds more, replaces the default, or shows nothing. The ticks per scenario are gone. An event not on the model shows what it shows today, and its first saved change moves it to the model (seeded from its old list).
- **A new logo from messmass replaces the earlier one (owner answer 169):** when messmass sends a different logo address for a partner (`POST /api/internal/messmass/partners`), the partner's address is replaced **only if the one it has is the one camera took from messmass** (or it has none), the new logo is imported, and it **takes the place of the earlier one in the partner's logos** (the earlier one stays in the library); **never over an own choice**, and if the editor took the earlier one out, the new one is not put in (`makeMessmassLogoDefault`, `nextPartnerLogoUrl`). The events look at the partner, so they show it at once.
- **The random pick (owner decision 156):** the capture page (the loading screen and the pages of the user journey) and the slideshow loading screen pick one of the logos of a place at random; one logo is used as it is. The capture page makes **one draw per visit** and uses it for every place, so a user sees the same logo throughout; the slideshow picks on load.
- **Still to come in this step:** the migration and the collect for existing partners and events (the owner decided on 2026-10-09 to run them now; the numbers and the undo file are in the issue).

## Images (LIB-5, camera#368)

The pictures of the picture fields: the welcome page (background, left image, right image, giant screen), the CTA page picture, the email footer and the
slideshow screen overlay. Collection `images` (`LibraryImage` in `lib/db/schemas.ts`), id `pictureId` (not `imageId`: on a frame that is the asset id of
the imgbb mirror), on the same three levels: Global Images, the partner's images (taken from the global library, plus its own uploads), the event's images
(from its partner's library, plus its own uploads).

- **An image is not assigned.** A picture field keeps the plain address of one picture, as it always did; the capture page, the emails and the slideshow
  read that string, never this collection. So an event has no list of images: its images library is what its fields can choose from. Images have no
  defaults for new events. In the code (`isAssignedKind`, `lib/library/kinds.ts`): `eventAssignedIds` and `partnerDefaultIds` give none for images;
  `partnerSavedIds` reads `Partner.library.images`, the global images the partner took (a partner that has not saved a library has its own uploads only:
  nobody had images before); `loadEventLibrary` gives an empty `assigned` and the whole library in `available` (active pictures, newest first);
  `savePartnerLibrary` writes `library.images` with the other kinds (the first save of any kind saves all of them), reports no event for a removed image
  (`removedInUse` stays empty) and refuses `defaults`; an event upload is not added to the event.
- **Removing or deleting an image never changes a field.** The file stays in the store, so a page that shows it keeps showing it; the picker then marks
  the address "Not in the library". Deleting a global image also takes it out of every partner library (`lib/library/images.ts`).
- **Uploads:** PNG, JPEG, WebP or SVG, up to 4 MB (checked in the page before it is sent, and on the server), with the size in pixels read from the file
  (`lib/library/uploaders/images.ts`): at the global level (`POST /api/images`), for a partner and for an event.
- **Pages:** Global Images `/admin/images` (global admins, menu Libraries: upload, switch off or on, delete; `?scope=all` lists every upload with whose it
  is, changed only on its own page), partner Images `/admin/partners/<id>/images` (add from the global library, upload, remove, delete an own upload),
  event Images `/admin/events/<id>/images` (the pictures the event can use, upload, delete an own upload; it links to the partner's Images page). The
  style sections of the partner and event pages link to them. Every list shows the pictures and where each comes from.
- **The picture picker** (`components/admin/library/ImagePicker.tsx`, helpers in `lib/library/picker.ts`): the current picture, or "No picture";
  "Choose from the library" lists the images of the level of the page (an event editor: the event's library; a partner page: the partner's; a global
  page: the global one) with their pictures, and one click chooses one; "Upload here" uploads at that level and chooses the picture; "Clear the
  picture". The plain address field stays next to it: an address typed or pasted by hand (the MTK pictures on R2 are in no library yet) keeps working
  and shows its preview, and an address that does not load says so. The picker has no form of its own, no submit button and no required field, so it
  works inside the editors' forms.
- **Wired in** at the event level: the four welcome page pictures and the CTA page picture (page editor), the email footer picture (event editor), the
  overlay of the screen design (slideshow editor). The check of each field is unchanged: the email footer and the overlay take an https address
  only, the page pictures are stored as given. Two fields are offered only the file types their own uploads took before (`lib/library/image-files.ts`):
  the email footer PNG, JPEG or WebP (email apps do not show SVG), the overlay PNG, WebP or SVG (a JPEG cannot be transparent where the photos play);
  an address of another type typed by hand is kept and marked.

| Route | Does |
|---|---|
| `GET /api/images` | The global images, newest first (`?scope=all`: every image, each with whose upload it is). Global admins. |
| `POST /api/images` | Multipart `file`, `name`, `description?`: an image of the global library. Global admins. |
| `PATCH /api/images/<pictureId>` | `{ isActive }`: switch a global image off or on. Global admins; refused for a partner's or an event's upload. |
| `DELETE /api/images/<pictureId>` | Delete a global image and take it out of every partner library. Global admins; refused for a partner's or an event's upload. |
| `GET`, `PUT /api/partners/<id>/library?kind=images`, `POST .../upload`, `DELETE .../items/<pictureId>?kind=images` | As for frames, without defaults. |
| `GET /api/events/<id>/library?kind=images`, `POST .../upload`, `DELETE .../items/<pictureId>?kind=images` | As for frames; an upload is not assigned. |

Not yet: the sample selfies and stadium backgrounds of the default slideshow (camera#326); the slideshow background picture keeps its own upload; the MTK
pictures move into the libraries with LIB-6 (camera#369). The index definitions of `images` (`lib/db/ensure-indexes.ts`) exist only once
`npm run db:ensure-indexes` has run; nothing depends on them.

## What is done and what comes next

- **Done (LIB-1 to LIB-5):** the core, the partner and event pages for frames, upload at both levels, the one-way rule in the API, the global list global-only, the message area of a
  frame and the frame of each message, logos on the three levels with the logo from messmass as a partner library item (section Logos), and the Images library on the three levels
  with the picture picker of the picture fields (section Images).
- **Done (LIB-6, camera#369):** the move of an event's older base picture into the library, a button in the generated frame panel (docs/FRAME_BASE.md, "Moving the base into the
  library"). **Applied to the MTK x Vasas event on 2026-10-08:** its two frames, its logo (in the partner library of MTK Budapest, assigned to nothing) and its six pictures (welcome page
  background, left image, right image and screen picture, e-mail footer picture, giant screen overlay: items of the event's Images library that point at the addresses the event already
  uses) are library items, and nothing a user sees changed. The old base data of that event was removed afterwards.
- **Next:** LIB-7 the audit fixes (docs/LIBRARY_AUDIT.md: refuse deleting an item that is in use, paging of long lists).
- A kind joins by adding it to `LIBRARY_KINDS` and `KIND_META` (`lib/library/kinds.ts`) and its uploader to `lib/library/upload.ts`; a kind that events do not
  assign (images) answers false in `isAssignedKind`.
