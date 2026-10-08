# Building bricks: one way to build every element of an event

Research and proposal of 2026-10-09 for [camera#412](https://github.com/moldovancsaba/camera/issues/412) (register item 151, the first step of item 139). The facts come from [ELEMENT_INVENTORY.md](ELEMENT_INVENTORY.md) (477 rows read from the code of `main`, nothing run). **This is a proposal: nothing in it is built yet.** Parts the owner already decided are marked **(decided)**; the rest is confirmed by number in section 9.

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
- **No places (the owner, 155):** the library does not ask where a logo shows. The logo shows wherever a logo shows (the pages, the loading screens, the share page, the e-mail). The four ticks, the scenario on each assignment and the "Users see this one" marker go away; the library cards say only "default" and "from messmass".
- **One question remains (156):** when an event has more than one logo, the system picks one at random (a feature the code half has, `selectRandomLogo` is unused, but nothing agreed it) or always the first. I recommend one random pick per user visit, so the logo does not change between pages. Until the owner answers, the first by order is shown, as today.
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
3. **Following means no copy.** An event stores only what an editor set. A change of the partner or the global default shows at once on every event that follows, and never touches an event's own values. Today colours, frames and logos are copied into the event and a cascade replaces whole lists, which drops what an event assigned itself; that goes against "nothing already set is deleted" (data-model reading, finding 2). Existing copies are measured first and migrated without deleting anything.
4. **Empty means follow.** A text field saves empty while it shows the default (grey placeholder). The English default is never saved as the event's own. Today the edit forms freeze English defaults into events and a heuristic (`textOr`, the stored English counts as unset in Hungarian) repairs it afterwards.
5. **"Use the default" clears one slot and nothing else.**
6. **Nothing is deleted by following.** A library item in use cannot be deleted (built, #392); a page the editor deletes returns the default of its place (#378).
7. **One resolver per brick type in code**, so a screen asks and does not hold its own truth. It replaces or wraps the ones that exist today: `resolveEventTheme` and the theme loader, `textOr` and its relatives (`own`, `sharePageText`, `pendingTryOnText`, `emailTemplateIn`), the `normalize*` functions, the journey defaults, the frame and logo picks, the try-on setup resolver. The library rules (an offer filter, not a value resolver) and the messmass snapshot stay.

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

The picture is the composition of the event's **main slideshow**. Today they share nothing: the stage is live in the browser, the welcome picture is a hand-made image pasted into the page.

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

**Main slideshow rule (proposal, question 160):** no flag exists. The main slideshow of an event is the default slideshow every event gets (items 1 to 5), unless an editor marks another slideshow as main.

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

Fix first, whatever else happens: the partner-user dead ends (Queue and Analytics tabs, dashboard tiles, the try-on setup list, the landing logo upload, the delete-event button); the partner link to a `#logos` section that does not exist; per-event access checks on the slideshow, layout and landing editor pages; the empty states that read a different list than the cards.

**Design system:** the audit of whether the admin screens use GDS tokens or hard-coded styles (register item 152) is a separate result; its recommendation (shared admin building blocks and a gate for inline styles) is added here when it lands.

## 8. Proposed order for 139

Each step ships alone, is checked in a real browser at phone width where it is visible, and updates its issue and docs. No step changes what a user sees on the day of the match without the owner's go.

| Step | Content | Issues |
|---|---|---|
| **0 Logo** | the messmass logo is collected into the partner library and made a default automatically (153); the partner page reads the same list as the cards (fixes "No logos assigned yet"); the places go (155); which logo shows when there are several waits for 156 | #369, #367 |
| **1 Journey view** | the page editor shows the whole journey with the default pages (welcome, consent, login, selfie taking), "Customise", the steps that are not pages; the default welcome page | #378, #330 |
| **2 Parts and default slideshow** | stadium background and sample selfie as Images library items with tags; the default slideshow with its overlay, window, QR, QR text and the **URL text** field; the main slideshow rule | #326, #328 |
| **3 Welcome page screen** | the layout and the renderer of 6.2; the picture follows its sources; the welcome page uses it | #327 |
| **4 Toggles** | random or user-selected frame and message; frame toggles with positions | #329, #331 |

The image gallery in the editor (#368, the acceptance of #369) stays unaccepted until the owner accepts 139 (owner, 139). After 139: text levels and the Dictionary screen, the editor regrouping of section 7 one editor at a time, the design-system fixes (152), and the logged defects of section 5. The order differs from my first sketch (the picture of step 3 is rendered from the parts of step 2, so the parts come first).

## 9. Questions for the owner

Numbers continue the register. 153, 154 and 155 are answered; 156 is the only logo question left.

- **156** When an event has more than one logo: a) a random pick, once per user visit (my recommendation), b) always the first.
- **157** One rule for every brick: event's own, partner's own, global default, built-in; messmass fills the partner or event level flagged "From messmass". Confirm, or say what differs.
- **158** Following, not copying: from now an event stores only what an editor set; partner and global changes show on every event that follows; existing copies stay, nothing is deleted (I measure before any migration). a) yes b) keep copying for colours, frames, logos.
- **159** Texts get a partner level and a global level (the Dictionary screen of item 19), empty follows, the partner chooses its default language (#353). a) yes, after the 16th b) only what 139 needs now.
- **160** The main slideshow of an event is the default slideshow, unless an editor marks another as main. Yes, or another rule.
- **161** The editors move to the Global, Partner and Event workspaces of section 7, one editor at a time. a) yes, starting after steps 1 to 3 b) differently (say how).
- **162** The order of 139 as in section 8. a) yes b) change it.
- **163** What of 139 must be live on Friday 16 October: a) nothing (the MTK event keeps its hand-made welcome page screen picture, 139 lands after), b) steps 0 and 1 only, c) all of steps 0 to 4.
