# A selfie in the welcome page screen (plan)

Owner request 2026-10-10 (task 254, issue 540): upload or use a selfie for the **Welcome page screen**: (a) upload a general one, (b) assign one from the event's clean selfies, (c) use the real slideshow. "I want to have it by design generated from the general elements including general selfies in the system, so that I should be able to add images to that, and the system provides them to the partner until the partner selects or uploads their own, and the event receives a random photo from the parent. Break it down, check the existing solution and make a plan to make it UX friendly, layout and consequent."

Status: **decided by the owner on 2026-10-10 (answers 255 to 260, section 7); steps 1 to 5 are being built, steps 6 to 8 follow after the match.** It continues step 5 of `docs/BUILDING_BRICKS.md` (the sample selfie, owner question 181) and the "photo window" row of section 6.2.

## 1. What the three letters mean (my reading)

The welcome page shows the giant screen as one picture (`Event.welcomeScreen`, drawn on the server from the event's default slideshow, `docs/SCREEN_DESIGN.md`). Inside it there is a **photo window**. Today the window shows a drawn head-and-shoulders stand-in. The request is: what can be in that window?

| Letter | What goes in the window | Who adds it |
|---|---|---|
| **a. A general sample selfie** | a picture from a **library of sample selfies** that exists in the system itself (global), that a partner can add to or replace, and that an event can add to or replace | an admin uploads once (global), a partner or an event uploads its own |
| **b. The event's clean selfies** | a photo of **this event**: the plain photos an editor uploaded to the event gallery (kept unframed as the original), or an approved guest photo | the event's editor picks it |
| **c. The real slideshow** | **the latest approved photo** as the real slideshow shows it, so the welcome page matches what is on the giant screen | nobody: it follows the event |

And the rule behind (a), which is the owner's own model, already decided for logos: **a place of use uses the default by default; the system gives the partner the global ones until the partner chooses or uploads its own; the event gets what its partner has; one item is used as it is, several are picked at random; a parent is never copied into a child.**

## 2. What exists today (checked in the code and in production, read only)

| Piece | State | Where |
|---|---|---|
| The welcome page screen picture | drawn on the server: overlay, QR, texts, the window; stored as `Event.welcomeScreen {url, key, generatedAt}`; redrawn when its sources change; shown on any welcome page without its own picture | `lib/screen/welcome-screen.ts`, `welcome-screen-store.ts`, `docs/SCREEN_DESIGN.md` |
| **The window hook** | the renderer **already takes a `windowPicture`** and draws the event's frame over it; the store passes `null`, so the stand-in is drawn. "A sample selfie once the library has them" is in the code comment | `renderWelcomeScreen`, `ensureWelcomeScreen` |
| The slot model | one mechanism for "the default by default, own, replace, add more, none, random pick", generic over any slot id (`Partner.slots` and `Event.slots` are `Record<string, {items, useDefault}>`), built for logos | `lib/slots/resolve.ts`, `logo.ts` |
| The slot panel | one admin component for every slot, with `noun` as a parameter: use the default, choose from the parent's library, upload, add more, replace, none | `components/admin/kit/SlotPanel.tsx` |
| The Images library | three levels (global, partner, event), upload, switch off, delete; **no tags, no defaults, no slot** (a picture field keeps a plain address) | `docs/LIBRARIES.md`, `lib/library/*` |
| A partner's default pictures | six fields (welcome page pictures, CTA picture, e-mail footer) followed by events with an empty field; **no sample selfie** | `Partner.pictures`, the partner's Pictures page |
| The sample selfie | **does not exist**: no library items, no tag, no slot, no screen. Question 181 (generate illustrations, or the owner sends images) was never answered | `docs/BUILDING_BRICKS.md` |
| The event's clean selfies | an editor's gallery upload is a submission with `metadata.adminGalleryUpload`; when the frame is put on it **the plain upload is kept as `originalImageUrl`**. Today: **106 uploads in two events** (MTK x Vasas: 20, all framed with the plain kept; Swiss Ice Hockey: 86, not framed yet). A guest photo's plain original is private, and only **26 of 1,076** photos have an original different from the public picture, so guests' photos are **not** clean selfies today | `app/api/admin/events/[id]/gallery-upload`, `gallery-frame`; the storage plan (issues 509, owner answers 226 and 227) is what would keep more |
| The real slideshow | the stage plays the playlist of approved photos live in the browser; before the first photo the window is empty (no sample selfie, `docs/SCREEN_DESIGN.md` "Not yet") | `components/slideshow/SlideshowPlayerCore.tsx`, the playlist route |
| Rules a new picture must follow | the one visibility rule for photos (`lib/submissions/visibility.ts`) and the broken-picture rule (`lib/media/pictures.ts`: a gone picture is hidden, never an error) | CLAUDE.md section 9 |
| The Images and Pictures pages | global Images, partner Images and Pictures, event Images; the event has **no Pictures page**; the Slideshows page holds the "Welcome page screen" card with the picture and **Draw it again** | `app/admin/...`, `components/admin/SlideshowManager.tsx` |

**What this means:** the model, the panel and the renderer hook all exist. What is missing is the **sample selfie as a library and a slot**, the **choice at the event**, and the **rules for photos of the event**.

## 3. The design

### 3.1 The sample selfie is a slot, three levels, one rule

- **Library:** the Images library gets a **tag** on an item (`tags: ['sample-selfie']`, set by the page that uploads it). A new library page **Sample selfies** (the Images library filtered by the tag, the same upload and switch off) is the global place. A partner and an event have the same page filtered to their level (the rule of docs/LIBRARIES.md: partner takes from global plus its own; event takes from its partner plus its own).
- **Slot:** slot id `selfie` (`Partner.slots.selfie`, `Event.slots.selfie`, same shape as the logo slot). The chain is **global default, partner, event**. The **global default** is the set of **active** global sample selfies (a global admin switches one off to take it out of the default; no copying anywhere). A partner with nothing stored **follows the global set**; an event with nothing stored follows its partner. "Add more", "replace" and "none" work as for logos. Resolver and panel are the existing ones (`resolveSlot`, `SlotPanel` with `noun: "sample selfie"`).
- **The random pick:** the resolved set may hold several; the event gets **one**, picked at random **once and stored** with the welcome screen (`Event.welcomeScreen.window = { source, pictureId, pickedAt }`; the earlier plan item 49: "pick one, once, and store the pick"), so the picture does not change on every redraw. It is picked again only when the picked item is no longer in the set (switched off, deleted, a gone picture), or when the editor presses **Pick another**.
- **Never an error:** a gone or missing sample selfie falls back to the next item of the set, and with none to the stand-in that is drawn today. The picture is checked by the broken-picture rule like any other (`picture_health`).

### 3.2 What the window shows, and how it is drawn

The event chooses **one source** for the window (the default is the first):

| Source | Window shows | Drawn how |
|---|---|---|
| **Sample selfie** (default, letter a) | the event's pick from its slot | the **clean** selfie, cropped to the window, with **the event's frame drawn over it** (the renderer does this today) |
| **A photo of this event** (letter b) | the photo the editor picked | a **clean** photo (an editor's upload with its plain original) is drawn like a sample selfie, with the frame; a photo that exists only **framed** is drawn **as it is, without a second frame** |
| **The latest approved photo** (letter c) | the newest photo that passes the one visibility rule, as the slideshow shows it | as it is (already framed), redrawn after approvals, at most every 10 minutes, and the previous stored picture is deleted when the new one is live |
| **Keep the stand-in** | the head-and-shoulders drawing of today | the escape hatch, so an event never has to show a selfie |

- **Only photos that may be shown:** a photo of the event is eligible when it passes the one visibility rule (`isPubliclyVisible`: approved, not hidden, not broken). **No other condition (owner answer 256):** every approved or uploaded image is one the service has the right to use anywhere, any time and in any context, and the library holds only images cleared for commercial use; if there is ever a problem with an image it is declined and never used again. The same rule as the giant screen and the share page applies to the welcome page, no new exception.
- **Stored picture and key:** the key already hashes everything the picture is drawn from; the picked picture's address and the source go into it, so a change redraws and nothing else does.
- **(c) is a snapshot, not a live embed.** Embedding the real player in the 3D screen would load the whole player and its playlist on the first page every visitor sees (data, battery, the iOS 26 bar rules of CLAUDE.md section 7). If the owner wants the live motion, it is a later, separate step (question 258).

### 3.3 The live stage uses the same selfie (consequent)

Before the first approved photo the stage's window is empty. The same resolved sample selfie fills it (the playlist answer carries it as `placeholderPicture`; the player draws it in the window and the playlist's first real photo replaces it). So the giant screen and the welcome page screen start from the same picture. This changes what a live screen shows before its first photo, so **it waits for the owner's go** (question 259).

## 4. The UX: one panel, one vocabulary, one place per level

The same panel and the same words at every level, as for logos: **Use the default, Choose from the library, Upload, Add more, Replace, None**, and under every picture the source in words: **Own**, **From the partner**, **From the global library**, **Built-in**.

```
GLOBAL   Libraries > Sample selfies  (global admins)
         [ + Upload sample selfies ]   (only images cleared for commercial use are uploaded; no tick, owner answer 256)
         grid of pictures, each: name, size, Active switch, Delete.   "Used by N partners and N events"

PARTNER  Partner > Pictures > card "Sample selfies"
         From the global library (4)  [thumbs]            [ Use the default ]
         [ Choose from the library ] [ Upload ] [ Add more ] [ Replace ] [ None ]

EVENT    Event > Slideshows > card "Welcome page screen"
         +-------------------+   What shows in the photo window
         |   preview 16:9    |   ( ) Sample selfie  (default)       From the partner  [ Pick another ]
         |   of the screen   |   ( ) A photo of this event          [ Choose from the gallery ]
         +-------------------+   ( ) The latest approved photo      "Follows the slideshow, redrawn after approvals"
         [ Draw it again ]       ( ) Keep the stand-in
         Sample selfie panel (only when "Sample selfie" is on): the same panel as above

GALLERY  Event > Gallery: select a photo > "Use in the welcome screen"   (letter b, one click; clean uploads are marked "Clean")
```

- **One place per level** (the partner's and event's existing menus), **one panel** (`SlotPanel`), **one preview**: the event card shows the real stored picture beside the choice, with **Draw it again**, so the editor sees the result at once. A choice saves and redraws in one press.
- **Plain states:** no sample selfies yet: "No sample selfies in the system yet. The window shows the stand-in. Ask a global admin to add some." with the link for global admins. A gone picture: "A picture is gone and was left out; the next one is used". Nothing is shown as an error to a visitor.
- **Phone width:** the editors are checked at a phone width like every admin page (cards stack, the preview above the choice, buttons wrap).
- **Words:** these are admin labels, English like the rest of the admin; the Dictionary is not involved (the picture has no text).

## 5. The steps (each ships alone, each checked, each updates docs, the issue and the board)

| Step | Content | Risk | Before the match? |
|---|---|---|---|
| **S1 Library** | the tag on images, the global **Sample selfies** page (upload, switch off, delete), the "who uses it" count | none: an admin page | yes |
| **S2 Slot and resolver** | `selfie` slot at partner and event (`lib/slots/selfie.ts` on `resolveSlot`), the global default set, the stored random pick, routes `GET/PUT` for the partner and the event, tests | none: nothing reads it yet | yes |
| **S3 Partner panel** | the card **Sample selfies** on the partner's Pictures page | none | yes |
| **S4 Window picture (letter a)** | `ensureWelcomeScreen` passes the pick as `windowPicture` with the frame, the key and the redraw, the event card with the source choice, the preview and **Pick another**, **Keep the stand-in** | changes the picture of an event **only when the global set is not empty and the event does not keep the stand-in**; the global set starts empty | yes, with the global set left empty until the owner says |
| **S5 Event photo (letter b)** | the gallery action **Use in the welcome screen**, the "Choose from the gallery" picker, clean versus framed drawing, the visibility rule | low | yes |
| **S6 Latest photo (letter c)** | the source "latest approved photo", the throttled redraw after approvals, deleting the replaced stored picture | medium: writes after approvals, Blob growth, so throttled | after the match |
| **S7 Live stage** | `placeholderPicture` in the playlist, the player draws it before the first photo | changes a live screen | owner's go, after the match |
| **S8 Guide** | the messmass guide, English and Hungarian | none | with S4 |

The first two letters (a, b) are the safe, useful core. Letter c and the live stage follow once the owner has seen a and b.

## 6. Risks and what I will not do silently

- **Rights (owner answer 256).** The library holds only images cleared for commercial use, and every approved or uploaded image may be used anywhere, any time, in any context; there is no tick on upload. An image with a problem is declined (switched off in the library, or rejected) and never used again.
- **Guests' photos in the window** (owner answer 257: yes) are shown to visitors who have not accepted anything yet; the one visibility rule applies (approved, not hidden, not broken), and the editor chooses the photo; it is never a default.
- **Clean selfies are scarce.** Only an editor's gallery uploads are clean today (106 in two events). More need the storage plan (issue 509, owner answers 226, 227); until then letter b offers uploads first and framed photos as they are.
- **Blob growth** for letter c: throttled and the replaced picture is deleted.
- **A live event changes only on purpose:** the global set starts empty, an event can keep the stand-in, and the MTK x Vasas page changes only if the owner uploads a sample selfie and presses Draw it again (or saves the slideshow).

## 7. The owner's decisions (2026-10-10)

- **255, where general selfies live:** **a page of their own**, Libraries > Sample selfies, with the Images library underneath.
- **256, rights:** no tick. "We have only cleared for commercial use images; if any problem, we decline and never use. Every approved or uploaded image we have the right to use anywhere, any time, in any context."
- **257, letter b:** yes: an editor can pick their own gallery uploads (clean) and approved guest photos, drawn without a second frame.
- **258, letter c:** ok: a picture of the latest approved photo, redrawn after approvals (at most every 10 minutes); the live player inside the screen is not built.
- **259, the empty giant screen:** yes, the stage window shows the same sample selfie before the first approved photo (after the match, step 7).
- **260, timing:** ok: steps 1 to 5 now (admin only, the global set empty until the owner uploads, MTK x Vasas unchanged), steps 6 to 8 after the match.
