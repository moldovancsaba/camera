# Building bricks: one way to build every element of an event

Research and proposal of 2026-10-09 for [camera#412](https://github.com/moldovancsaba/camera/issues/412) (register item 151, the first step of item 139). The facts come from [ELEMENT_INVENTORY.md](ELEMENT_INVENTORY.md) (477 rows read from the code of `main`, nothing run). **Status 2026-10-09 evening:** the owner answered questions 156 to 164 (section 9) and the model below follows those answers. Built so far: the first form of the messmass logo default (PR #414, to be replaced in step 4 of section 8) and the repair of the undefined design tokens (camera#415). Parts the owner decided are marked **(decided)**.

## 1. In one page

- Everything an event shows, a text on a page, a button colour, a logo, a frame, the welcome page screen picture, an e-mail, is built from **five kinds of brick**: **Words**, **Picture**, **Look**, **Link**, **Switch**. Pages, screens, frames and e-mails are **compositions**: they hold slots and each slot is filled by a brick. A composition owns no content of its own.
- **One rule decides which value a slot gets** (section 4): the event's own value, else the partner's own, else the global default, else the built-in default. The first that exists wins, and the screen says where the value comes from. This is the agreed Global, Partner, Event relation **(decided, docs/LIBRARIES.md)** applied to text and to every element, not only to pictures.
- **An automatic default is collected automatically and made the default in the same step (decided, main rule item 18, restated by the owner on 2026-10-09 in answers 153 and 154).** What camera collects or imports on its own (the partner logo from messmass, colours, names, sample selfies, QR texts) is the default wherever such an element shows, for every event that follows defaults. The editor replaces it, an own value always wins, nothing already set is deleted.
- **The editors are re-organised, not multiplied** (section 7): the same editor appears at the three levels, showing the value, its source and "use the default".
- **A screen never keeps its own copy of the truth.** The partner page that said "No logos assigned yet" next to a logo that was default was reading a different list than the card below it. Every screen asks the same resolver.

## 2. The worked example: the partner logo (owner, 2026-10-09)

The owner's observation: camera imports the partner logo from messmass, says so ("From messmass"), and then says "no default logo". And the library asks, per logo, where it shows.

| Where | What it does today | Truth it holds |
|---|---|---|
| messmass provisioning | stores `Partner.logoUrl` once, only if missing | a frozen address, no editor |
| "Import the logo from messmass" button | makes a library logo flagged "From messmass", **assigned to nothing** (my choice, wrong against item 18) | the logo exists, but is not a default |
| Partner overview, logos card | "No logos assigned yet" when the partner's default list is empty | a stale empty state that reads a different list than the library cards |
| Logo library, per logo | four ticks: Slideshow Transition, Onboarding/Thank You Pages, Loading Slideshow, Loading Capture App | the place is chosen per logo; two logos can claim the same place and only the first by order is ever shown; Slideshow Transition has no screen that shows it |
| Event, per scenario list | the first active logo of the scenario | the event's copy of the partner defaults, a copy that cascades |
| Pages the user sees | event logo, else the theme logo (messmass partner or home team), else the emoji | a fifth truth; loading screens have no theme fallback |

How it reads with bricks:

- A logo is a **Picture brick**, a library item. The slot is simply "logo". It resolves: the event's logos, else the partner's logos (the messmass import is one of them, flagged), else the global default, else none.
- **Automatic (decided, 153 yes, 154 keep):** provisioning collects the partner logo from messmass into the partner's library and makes it a default in the same step. The people who set up and tune an event find it there and replace it if they want. The six MTK Budapest events keep it.
- **The perspective is the place of use, not the logo (decided, 155 and 156).** "We choose logos for the event, never events for the logos." The library never asks where a logo shows, and no logo is pushed to events. Every place where the system uses a logo uses **the default by default**, and the editor chooses there: in the event's settings for the whole event, and where a place has settings of its own (a page, the slideshow, the loading screen of the capture app) in those. The four former scenarios are only four places of use; they are not set in the library any more. At every place the options are the same:
  - **use the default** (what the parent has; the default logo is itself an item of the library);
  - **upload** a new logo and assign it;
  - **select** one from the parent's library (the partner from the global library, the event from the partner's library);
  - **replace** the default;
  - **add more**.
- **One logo: it is used. More than one: always a random one (decided, 156).** (`selectRandomLogo` exists and nothing calls it.) Decided (168): "add more" keeps the default in use next to the added ones, and the random pick is among all of them; "replace" removes the default for that place.
- **When messmass has a new logo (decided, 156), camera recognises it, replaces the imported default, and it goes down to every child that uses the default.** Decided (169): it never replaces a logo the partner or the event chose itself.
- The partner page, the library card and the event page all ask the same resolver, so none can say "none" while one exists.

## 3. The bricks

| Brick | What it is | Examples from the inventory | Today | What the model needs |
|---|---|---|---|---|
| **Words** | A text with a stable key, a default in each language, and optional own values per level | page headings and buttons, consent labels, e-mail subject and body, share page texts, QR text, URL text, frame messages, loading text, the 228 dictionary keys | Global = the dictionary in code (English and Hungarian). Partner = nothing. Event = the only editable level. Three default patterns exist side by side: grey placeholder (clean), the English default saved as the event's own (frozen), and no dictionary fallback at all | One pattern: empty means follow; the field shows the followed text in grey and says which level it comes from |
| **Picture** | A library item (frame, logo, image) filling a slot | frames, logos, the four welcome page pictures, CTA picture, e-mail footer picture, screen overlay, sample selfie, stadium background | Frames and logos are lists copied into the event; images are plain address strings with no inheritance and no default; nine logo channels; five upload paths | Every picture field is a slot with the same rule; library items carry tags (stadium background, sample selfie) so an automatic default can pick one, once, and store the pick (item 49) |
| **Look** | Colours, font, corner radius | page, text, card, link colours, button colours, font, radius, the generated frame's colours | Page, card, text, link and font come from the messmass style only; buttons come from the welcome page's Start colours, then the event colour, then messmass; several leaks (a blue default, the shutter ring) | The messmass style is the default at partner or event level, flagged; button and leak rules decided once (#336 already fixed most) |
| **Link** | A destination address, with the tracked short link and what derives from it | the event's tracked links (`go.messmass.com/...`), the QR code, the URL text, the CTA address, the consent links | The QR exists in four places and none is made from the others: slideshow SVG from a typed address, welcome picture baked into pixels, an uploaded landing image, a download | One link brick: the QR and the URL text derive from the event's tracked link, so the picture and the stage cannot disagree |
| **Switch** | An on or off, a number, or a choice | photo vetting, tour, share page, sign-in options, random or user-selected frame (#329), button size, show the logo | `null` does not mean follow; the defaults are code constants; some switches do nothing (`showFrameOnCapture`, Back buttons) | `null` means follow; dead switches are removed or wired |

**Compositions** (they hold slots, never content):

| Composition | Slots |
|---|---|
| **Page** (welcome, consent, login, selfie taking, CTA, restart, thank-you) | logo, heading, text, picture, buttons, look |
| **Screen** (the welcome page screen picture and the slideshow stage) | background, photo window, overlay, QR, QR text, URL text, font |
| **Frame** | frame picture, message area, message texts, logo and team toggles (#331) |
| **Message** (the three e-mails) | subject, body, footer picture, logo, look, links |
| **Result** (the in-flow share step and the public photo page, one page per item 77) | texts, photo, buttons, look |

## 4. The one rule

Order, for every slot: **event's own, partner's own, global default, built-in default.**

1. **The first that has a value wins, and the screen says which one it is:** "Own", "From the partner", "From messmass", "Global default", "Built-in". Today only the try-on setup and the button colour record the winner.
2. **messmass is a source, not a fourth level.** What messmass provides lands at the partner or the event as the default there, flagged "From messmass" (the logo, the colours, the names). An own value replaces it; "Use the default again" brings it back.
3. **Following means no copy (decided, 158, 161 and 167).** An event stores only what an editor set. A change of the partner or the global default shows at once on every event that follows, and never touches an event's own values. Today colours, frames and logos are copied into the event and a cascade replaces whole lists, which drops what an event assigned itself; that goes against "nothing already set is deleted" (data-model reading, finding 2). Existing copies are measured first and migrated without deleting anything.
4. **Empty means follow.** A text field saves empty while it shows the default (grey placeholder). The English default is never saved as the event's own. Today the edit forms freeze English defaults into events and a heuristic (`textOr`, the stored English counts as unset in Hungarian) repairs it afterwards.
5. **"Use the default" clears one slot and nothing else.**
6. **Nothing is deleted by following.** A library item in use cannot be deleted (built, #392); a page the editor deletes returns the default of its place (#378).
7. **Choosing happens at the place of use (decided; `lib/slots/resolve.ts`, camera#418).** The same panel at every place, for every brick: use the default, upload and assign, select from the parent's library, replace, add more. One item is used as it is, several are picked at random. A library only holds items; it does not say where they show.
8. **Words (decided, 158):** *default* is what comes from above, *own* is what was set at this level. What a partner sets is the partner's own and its events' default; what an event sets is its own, and a later change of the partner does not override it. In the screens: "Default (from the partner)" and "Own".
9. **One resolver per brick type in code**, so a screen asks and does not hold its own truth. It replaces or wraps the ones that exist today: `resolveEventTheme` and the theme loader, `textOr` and its relatives (`own`, `sharePageText`, `pendingTryOnText`, `emailTemplateIn`), the `normalize*` functions, the journey defaults, the frame and logo picks, the try-on setup resolver. The library rules (an offer filter, not a value resolver) and the messmass snapshot stay.

How each family behaves today against the rule:

| Family | Today | Under the rule |
|---|---|---|
| Colours, frames, logos | write-time: copied at creation, cascaded, three override flags; the user's page reads only the event's copy | read-time follow; one "own value present" per slot instead of one flag per list |
| Texts | read-time dictionary in code; event typed; no partner level | the same read-time rule with a partner level and a global level (the Dictionary screen, plan item 19) |
| Pages | defaults added when the page is read (consent, login); invisible in the editor | the same function feeds the editor, so the editor shows what the user goes through |
| Switches | code constants plus one global switch (journey defaults) | `null` follows; the global switch stays for the rollout |
| Pictures (images) | plain address strings | slots with the rule; the Images library is where a default is picked from |

## 5. The mandatory pages (decided, plan items 34 to 48 and item 38)

Order: **welcome, consent, login, selfie taking, the rest.**

| # | Page | Agreed content | Today |
|---|---|---|---|
| 1 | **Welcome** | START button; the welcome page screen, generated (items 22 to 24); up to four pictures | no default exists: it is there only when an editor adds "Welcome" |
| 2 | **Consent** | three required checkboxes: Terms and conditions, Cookies, Privacy policy (labels of item 48); links open in a new tab; one record per checkbox | default added when the page is read (live since the journey defaults switch, 2026-10-08); not shown in the editor; an own page wins |
| 3 | **Login** ("Who are you?") | heading, text, Google and Facebook, e-mail form, Continue; at least one login stays on; empty text falls back to the default | default added when the page is read for events with vetting (all); not shown in the editor |
| 4 | **Selfie taking** | the built-in steps: frame picker (more than one frame), camera, one photo screen where Continue saves, saving, waiting or share | built in; the page type `take-photo` carries 20 settings, and the editor saves the English defaults as the event's own |
| 5 | **The rest** | CTA, restart, thank-you as the editor adds them; nothing automatic (items 65, 69) | as agreed |

Between and after them are steps that are not pages: the waiting screen, the e-mails, the public photo page (#378 lists them with a link to where their texts are edited).

**A default welcome page comes under the same rule (item 18) and the same global switch (item 26):** every event gets the START button and the generated welcome page screen in first place, until the editor adds its own welcome page. Nothing already set is touched.

**The journey editor (#378, items 134 to 137):** the page list is built by the same function the user's page uses (the stored pages plus the defaults), so the editor and the user cannot disagree. Default pages are rows marked "Default"; **Customise** creates the event's own page filled with the default's texts, in the default's place; deleting that page brings the default back; the defaults cannot be deleted or moved before their place.

Defects found on the way, to fix inside these steps (details in the inventory, section A): the editor creates accept, CTA, restart and welcome pages with English text stored, so a Hungarian event shows English there; a flow restarts at the first page after the last thank-you page, against docs/WELCOME_STEP.md; a CTA page with no address and a Continue button records a consent with an empty text that the server rejects; "Prompt Description" never reaches phones; "Loading text" never shows; the updated-photo e-mail default is never sent.

## 6. Recipes

### 6.1 A journey page

Logo (Picture), heading (Words), text (Words), optional picture (Picture), buttons (Words and Look), look (Look, the messmass style), active (Switch). One list of slots per page type; the page component draws them; the editor edits exactly those slots, at any level.

### 6.2 The welcome page screen picture = the default slideshow stage (item 139)

The picture is the composition of the event's **default slideshow**. Today they share nothing: the stage is live in the browser, the welcome picture is a hand-made image pasted into the page.

| Slot | Brick | Default | Today |
|---|---|---|---|
| Background | Picture | a stadium background from the library, in the event's messmass colours (item 1) | the slideshow's indigo gradient |
| Photo window | Picture | the latest approved photo; until one exists the event's sample selfie (items 2, 30), drawn in the event's frame | exists on the slideshow stage; no sample selfie items exist |
| Overlay | Picture | generated graphics overlay of the event | `screenDesign.overlay`, event level only |
| QR code | Link | generated from the event's tracked "Giant screen" link (item 3) | slideshow: a typed address; welcome picture: baked pixels |
| QR text | Words | random from the general texts, English by default, typed per event (item 4; "SZKENNELJ BE!" on the MTK event) | `screenDesign.texts` per event |
| **URL text** | Words and Link | the tracked link's address, editable separately from the QR target (item 5) | **missing: no field exists** |
| Font | Look | the event's messmass font | the event font |

Build in four parts, each on what exists:

1. One layout in percent of a 16:9 stage, shared by the browser and the server (the split `lib/frame/layout.ts` already has for frames).
2. A server renderer (`@napi-rs/canvas`, the event font through `lib/frame/fonts.ts`, the photo composed with the frame as `lib/photo-vetting/review.ts` does) that draws window photo, overlay, QR (modules drawn from `qrcode`), texts, URL text into a stored image keyed by an input hash, like the frame variants.
3. The QR target comes from the tracked link, so the picture and the stage cannot disagree.
4. A rebuild on any source change (theme refresh, frame change, link change) and a marker that the picture is generated, so an editor's own picture is never overwritten.

**Default slideshow rule (decided, 160):** every event gets a default slideshow made from the default elements; the editor modifies it, or creates another and sets it as the default; wherever a slideshow is needed, the default one is used. There is no "main" flag: it is the default slideshow.

### 6.3 Frame

Frame picture (Picture) with a message area, messages (Words), toggles for team, logo and message with a position each (#331, item 52), the event's colours (Look). The frame's own library item resolves by the rule; the generated frame is the built-in default.

### 6.4 The three e-mails

Subject and body (Words), footer picture (Picture), logo (Picture), look, links. The e-mails use one source of text per language, empty means the default, nothing frozen (today a legacy pair of subject and body is stored next to the three mode fields, and the editor writes it from the after-save pair).

### 6.5 The result (share step and public photo page)

One component draws both, with one canonical set of texts (items 77 and 78, step 2 of #339 still open).

## 7. Re-organising the editors: same editors, fewer places

The reading of the 68 screens (inventory, section D): a partner user sees 3 of 17 menu items; 50 of the 68 screens are reached only by a link; the same data is edited in several places (logos in five, brand colours in four, waiting-for-approval words in three); seven library pages repeat the same helpers; `events/new` is a drifted copy of the edit form; Queue and Analytics tabs lead partner users to pages that bounce them out.

Proposal (a direction, moved one editor at a time, never rebuilt):

| Level | Today | Proposed |
|---|---|---|
| **Global** (menu: Dashboard, Libraries, Operations, People, Settings) | 17 items; Libraries mixes 4 real libraries, 2 try-on lists, 3 read-only inventories | Libraries = tabs Frames, Logos, Images, Garments; Operations = one hub (Vetting, Queue, Analytics, Identity, Maintenance); People = Users and Partners; Settings = Journey defaults, Card display, AI Setups; Landing Pages, Slideshows and Global Galleries leave the menu and become filters of the event list |
| **Partner** workspace | an overview of cards, library pages behind links, no tabs | tabs: Overview, Settings (with the default groups below), Library (one tab, a switch between frames, logos, images), Pages, Users, Events |
| **Event** workspace | 4 tabs; seven editors outside them; Edit event has 9 setting groups on one form | tabs: Overview, Settings (five sections: Details, Look, E-mails, Result page, Try-on), Pages, Library, Screens (slideshows, layouts, landing pages, short links), Photos (gallery, vetting, queue, analytics), Export |

The components that make it possible exist or are one step away:

- **One library page** (`LibraryPage(level, kind)`) replaces the seven copies; per-kind options (frame defaults, message area) stay.
- **One setting group with a source:** value, "Own / From the partner / From messmass / Global default / Built-in" and "Use the default". It generalises the existing `StyleInheritanceIndicator`.
- **One list and form** for frames, logos, garments, setups, partners, events (the new and edit copies collapse).
- **The one unavoidable addition:** the existing pages editor and the text groups of Edit event are mounted at partner and global level with a level prop, so a default exists above the event. This is rule 18 applied to every element.

Fix first, whatever else happens: the undefined design tokens (7.1, step 1); the partner-user dead ends (Queue and Analytics tabs, dashboard tiles, the try-on setup list, the landing logo upload, the delete-event button); the partner link to a `#logos` section that does not exist; per-event access checks on the slideshow, layout and landing editor pages; the empty states that read a different list than the cards.

**First move, done (issue 426, owner idea 2026-10-09): the context menu.** Inside one event or one partner the sidebar shows that item's own menu instead of the main menu, with **Back to the main menu** first and the name of the event or partner under its kind (`lib/adminNavigation.ts`: `adminContextOf(pathname)`, `EVENT_CONTEXT_MENU`, `PARTNER_CONTEXT_MENU`, `adminContextMenu`; `components/admin/AdminChrome.tsx`). The context comes from the path alone (`/admin/events/<id>/...`, `/admin/partners/<id>/...`), so deep links and bookmarks are unchanged; the name comes from a small access-checked call (`GET /api/admin/nav-context`). The event menu: Overview, Edit and pages, Vetting, Queue and Analytics (global admins only: a partner user was sent away from them), Logos, Frames, Images, Slideshows and Landing pages (the lists on the overview; the editors of one slideshow, layout or landing page keep the item active). The partner menu: Overview, Edit, Logos, Frames, Images. The event tab bar is gone (the menu carries its items). A test fails when a page under an event or partner is not in its menu. The admin tour points at the context menu inside an event or partner and starts by itself only on the main pages. Checked in a production build at desktop and phone width (the drawer). Not yet: the partner's events and users as items (they are cards on the overview that lead to main-menu pages), the one library page, the settings sections.

### 7.1 The design system (register item 152, measured 2026-10-09)

The owner feared that GDS tokens are not used and styles are hard-coded. Measured over the 128 files of `app/admin`, `components/admin` and `components/gds` (read-only; per-file numbers in `_research/element-inventory/gds.json`, summary in the inventory, section F): **the fear is confirmed, and it is worse than hard-coded.**

- **213 of 220 `var(--gds-...)` references name tokens GDS never defines** (`--gds-color-border` 85, `--gds-color-muted` 107, surface, shadow). I checked the source: no installed GDS package and no file of this repo defines `--gds-color-border`; GDS defines `--gds-border-card`. By CSS rules an undefined variable makes the declaration invalid, so a card gets no border and "muted" text is not dimmed. This is the likely cause of the unfinished look; it is **not yet confirmed in a browser** (an admin sign-in is needed).
- 835 inline `style={{...}}` objects in 79 files, 28% more in 8 days (the new library screens copied the pattern); 855 px/rem literals; 831 raw div/span/p tags; only 22.5% of element uses are GDS components (the button, form and status layer is good: `SemanticButton`, `InlineAlert`, `FormSection`, `StateBlock`, `LabelTag`); the layout primitives (`GdsStack`, `GdsGrid`, `SectionPanel`), the text roles and `GdsBreadcrumbs` are never used.
- The gates report 0 violations because they only ban the string `@mantine/core` (the `PublicPrimitives` barrel re-exports Mantine, `components/admin` is not scanned) and the colour gate only catches hex values.
- Camera runs the plain `gdsTheme`, which emits colour roles only: GDS spacing and radius tokens do not exist in this lane, so the real scale is the component props (`gap="md"`) and `--mantine-*`.

Recommendation, in this order (each its own change, checked in a browser):

1. **Fix the undefined tokens** (done 2026-10-09 in 39 files, camera#415: borders `--mantine-color-default-border`, muted text `--mantine-color-dimmed`, surfaces `--mantine-color-body` and `--mantine-color-default-hover`, errors `--mantine-color-error`, shadows `--mantine-shadow-*`). **The GDS role tokens that `gds_fix_handover.md` recommends (`--gds-border-card`, `--gds-text-meta`, `--gds-bg-*`) do not work in camera's production build either:** the build turns their `light-dark()` into `var(--lightningcss-light, a) var(--lightningcss-dark, b)`, the two switches are defined nowhere, so the value is the pair "a b" and any declaration that uses it is invalid (measured in the built page: a card with `--gds-border-card` draws no border, with `--mantine-color-default-border` it draws one in both colour schemes). The gate `scripts/check-gds-boundaries.mjs` now refuses both an undefined `--gds-*` name and a `light-dark()` role token. A GDS component or text role stays the better target where one fits; the cause in the build is for GDS to fix.
2. **A small shared admin kit in `components/admin/kit/`**, composed from GDS parts, with no style props and no CSS of its own: `AdminPage` (breadcrumbs, `WorkspaceHeader`, stack), `LibrarySection` (panel, count, empty state, grid; replaces the copy in 7 library files and the header pattern copied 22 times), `LibraryItemCard` on `MediaPreviewCard`, `LinkButton` (ends 38 anchor-around-button sites), `FactList`, `ToolbarSearch`. This is the `LibraryPage(level, kind)` and setting-group component of section 7 built from the same parts.
3. **A gate so it cannot drift**: a script in `gds:check` (undefined `--gds-*` names; inline styles with a size literal; raw layout tags in pages; native `alert`/`confirm`; hand-rolled breadcrumbs; anchor around button) with a per-file baseline that may only fall and new files starting at 0; add `components/admin` to the boundary check and widen the lint globs.
4. Migrate the five worst screens (event overview, partner overview, try-on vetting, event frames, event edit) and the library pages onto the kit.

## 8. The order of 139 (left to me by the owner: by dependency and recommendation, everything is delivered)

Each step ships alone, is checked in a real browser at phone width where it is visible, and updates its issue and docs. A step that changes what users see on the day of the match waits for the owner's go.

| Step | Content | Depends on | Issues |
|---|---|---|---|
| **1 Token repair** | the 213 undefined design tokens replaced, a gate against them (done, PR #416) | none | #415 |
| **2 Journey view** | the page editor shows the whole journey with the default pages (welcome, consent, login, selfie taking), "Customise", the steps that are not pages; the default welcome page | the journey function that exists | #378, #330 |
| **3 Foundation** | the shared admin kit; the slot resolver (own, else the parent's default, follow without copying, random, source shown) and the slot panel at every level (use the default, upload, select from the parent's library, replace, add more) | 1 | new |
| **4 Logo on slots** | the places of use instead of the library ticks, random pick, messmass change detection, migration of the data, the collect for the 190 partners; replaces the first form of PR #414. **4.1 to 4.3 done:** the slot data model, the chain, the answer of the event logos API for events on the model, the save routes, the seed from the old list, who-uses counting, the slot panel and the rebuilt partner and event logo pages (docs/LIBRARIES.md); the random pick, the messmass replacement and the migration follow | 3 | #419 |
| **4b Fail-safe gate** | a deleted or lost parent item is still kept by the children: archive instead of delete, a last-known-good snapshot on the child used only when the item is missing, a lost state in the editor, asset retention and a confirmation gate; introduced in five additive phases starting with a read-only measurement (owner, 2026-10-09). **Done:** the measurement, the last-known-good snapshot an event keeps of the logos it uses and the fallback read (PR #431), and the lost state in the logo editor with Keep as own and Remove (docs/LIBRARIES.md); open: frames, archive instead of delete, the picture check, the backfill of snapshots | 4 | #421 |
| **5 Pictures on slots** | the picture fields as slots; library tags (sample selfie, stadium background, QR text) | 3 | #368 |
| **6 Text levels** | the Dictionary (global default texts, English and Hungarian), partner and event levels, the partner's default language, the default pages' texts at every level | 3 | #353, plan item 19 |
| **7 Default slideshow** | generated per event from the default elements, with the default flag and the written address (URL text). **7a done:** the stage layout, the generated picture, the tracked "Giant screen" link, the call to action from the dictionary, `isDefault`, the creation hook for new events, "Create" and "Make default" on the slideshows list (docs/SCREEN_DESIGN.md). The sample selfie fallback waits for the picture slots | none of 5 and 6 (see the note below) | #326, #328 |
| **8 Welcome page screen** | the layout and the renderer of 6.2; the picture follows its sources. **8a done:** the server renderer, the stored picture `Event.welcomeScreen` keyed by its sources, drawn for new events, on request, and again when the default slideshow changes (docs/SCREEN_DESIGN.md). **8b done:** the capture page shows it on any welcome page without a picture of its own, and the default welcome page (first row, Default) for an event that gets the journey defaults, has the picture and has no welcome page of its own | 7 | #327 |
| **9 Toggles** | random or user-selected frame and message; frame toggles with positions | frames model | #329, #331 |
| **10 Workspaces** | the editors regrouped into global, partner and event workspaces, one editor at a time while 3 to 9 land, the menu last (shown to the owner as screens first) | runs along 3 to 9 | #412 |

**Order decision (me, 2026-10-09): 7 and 8 come before 5 and 6.** The welcome page screen is the top priority of the epic, and it needs only what exists (the event's colours, the dictionary, the tracked link, the stage layout). The picture slots (5) add the sample selfie to the window later; the text levels (6) move the call to action from the one dictionary to partner and event levels later. Nothing built now has to be undone for either.

Why this order: step 2 does not depend on the new model, so the owner sees the whole journey early. Everything from step 4 on needs the slot resolver of step 3. The default slideshow needs the picture and text slots, and the welcome page screen needs the default slideshow. The image gallery in the editor (#368, the acceptance of #369) stays unaccepted until the owner accepts 139.

## 9. The owner's answers (2026-10-09) and what is left

| # | Answer |
|---|---|
| 153, 154, 155 | the messmass logo is the partner's default automatically; it stays on the six MTK events; the library does not ask where a logo shows |
| 156 | the question was framed wrongly: see section 2 (place of use; one logo used, several always random; options at every place) |
| 157 | yes, the one rule (section 4) |
| 158 | the owner asked for an explanation and gave the model: a new partner gets the defaults from messmass and the dictionary, an event gets what its partner has, and what an editor sets is its own and is never overridden (section 4, items 3 and 8) |
| 159 | yes: global default texts (i18n, English and Hungarian), partner and event levels, a new partner imports the global ones and a new event the partner's |
| 160 | yes: the default slideshow (6.2) |
| 161 | yes in principle: a one-way ticket, editors add items at global, partner and event level, the children inherit the default, the editor selects which one is used |
| 162, 163 | left to me: section 8, everything is delivered |
| 164 | do it now: done, PR #416 |

Confirmed by the owner on 2026-10-09: **167** following, not photocopying; **168** "add more" keeps the default next to the added logos, random among all, "replace" removes the default for that place; **169** a new logo from messmass replaces the old imported default and goes down, never over an own choice. All questions of the brick model are answered.
