# Giant-screen design (slideshow screen design)

A slideshow can carry a **screen design** (camera#309): a picture drawn over the stage with a transparent window where the photos play, a QR code
made by camera, and a few short texts. It is how a club's giant-screen layout (the stadium LED wall of MTK x Vasas) is shown without anyone
laying it out by hand. Stored as `Slideshow.screenDesign`, edited in the slideshow editor ("Screen design"), checked by
`lib/slideshow/screen-design.ts` (`parseScreenDesign`) on save, sent to the player with the playlist settings.

## What it is made of

All positions are percentages of the stage (a 16:9 stage, like the designers' 1920×1080 picture), so the screen looks the same at any size:
the player makes the stage a size container and the sizes are `cqh`/`%` units.

| Part | Field | Notes |
|---|---|---|
| Overlay picture | `overlayImageUrl` | A 1920×1080 PNG drawn over the whole stage, transparent where the photos play. https only. Chosen in the editor with the picture picker, from the images library of the slideshow's event (PNG, WebP or SVG: a JPEG cannot be transparent), uploaded there, or pasted (docs/LIBRARIES.md); stored as the plain address. |
| Photo window | `window {left, top, width, height}` | Where the photos play. The photos are cropped to it (`photoFit: cover`) or shown whole (`contain`). The overlay's own rounded corners and border cover the edge of the photos. |
| QR code | `qr {url, x, y, size, color}` | `url` is where it points (https, up to 300 characters), `x`/`y` its top left corner, `size` its side as % of the stage **width**. The server draws it as an SVG of its dark modules (level M correction), by default white, so it is light on the dark overlay like the designers' example (a QR reader that reads inverted codes scans it; a phone camera does). |
| Texts | `texts[] {text, x, y, width, size, align, color}` | Single line, up to 8, each at most 120 characters; `size` is % of the stage height; white with a soft shadow by default. |
| Font | `fontFamily` (optional) | The texts are written in the event's own font, from its messmass report style (a Google font, or the style's custom font file), loaded by the player. A `fontFamily` set on the design replaces it with a Google font; leave it out. |

## MTK x Vasas (2026-10-26)

Overlay: the designers' `Seyu_MTK_VASAS_Overlay2.png` (stored in the R2 bucket under `landing/mtk-vasas/`). Measured from their size panel
(`39.84, 33.28, 1330.05 × 748.15` px of 1920×1080): window `left 2.075, top 3.081, width 69.274, height 69.273`; QR `x 73.54, y 2.78, size
24.375` (468 px); text "SZKENNELJ BE!" `x 73.44, y 48.7, width 24.48, size 5.6` in the event's font. At 1920×1080 the rendered QR is 468×468 at
(1412, 30), the window 1330×748 at (40, 33), as in the example.

## The default screen of every event (camera#326, camera#327; step 7 of docs/BUILDING_BRICKS.md section 8)

Every event gets a **default slideshow** with a ready-made screen design, so no event starts with an empty stage and nobody has to lay one out. It is what the welcome page screen
and the giant screen start from; an editor changes it, or makes another slideshow and sets that as the default.

- **Layout:** the MTK x Vasas measures above are the default layout (`DEFAULT_STAGE` in `lib/screen/default-stage.ts`): photo window, the QR code centred alone in its panel, and a **band under the
  window with one big line, the written address** (owner, 2026-10-09: one line, as wide as the window, scaled to fill that width; the earlier two-line band of camera#487 with the call to action above the address is gone). One layout, in percent of the 16:9 stage, used by the live stage and by the picture of the welcome page.
- **Picture:** drawn by the server (`renderDefaultOverlay`, `@napi-rs/canvas`) in the event's own colours (its page colour and its button colour, from the messmass style): a night-stadium
  background (gradient, floodlight glows, a faint pitch circle and half-way line), panels for the QR code and the texts, an accent border round the window, and a transparent window.
  The same colours give the same picture. Stored in Vercel Blob under `screens/<event uuid>/default-<hash>.png`.
- **QR code and address:** the event's tracked **"Giant screen"** link (placement "Giant screen", kind QR, `lib/short-links/store.ts`) is made if the event has none, and reused if it has one, so
  the scans are counted on their own and reach messmass like every tracked link. The QR points at `https://go.messmass.com/<link slug>`. **The address written under the window is the event's own short address
  whenever it has one** (`Event.shortUrlSlug`, e.g. `go.messmass.com/mtk-vasas`), else the tracked link's (`go.messmass.com/<link slug>`), without the protocol (`writtenAddress` in
  `lib/slideshow/default-slideshow.ts`; owner, 2026-10-09: the written address is never the link's random code when the event has an address of its own). Both addresses reach the capture page and both are counted; only the QR's scans are counted as "Giant screen". What an editor types in a text is kept as typed.
- **A text that fills its box (`fit`, owner, 2026-10-09):** a screen design text can be one line scaled so that it fills the width of its box (`ScreenDesignText.fit`); `size` is then not used: the line takes the size that fills the box exactly (at most 30 % of the stage height, the largest size a text can have), so a long one never wraps and a short one grows to the box width. A first version capped the line at its stored size, and a short address stayed at 80 % of the box (owner, 2026-10-09: "it is not scaled"). The default band is drawn for a nominal line of 12 % of the stage height.
  The live stage measures the line at a reference size and scales it by box over line (again when the font arrives or the box changes, `components/slideshow/ScreenDesignLayers.tsx`); the server picture of the welcome page does the same with the canvas measure; both use `fitSize` (`lib/slideshow/screen-design.ts`).
  The default address text is `fit`, with a box as wide as the photo window. In the slideshow editor a text typed into an empty row is put under the window, as wide as the window, with **Fill the box** ticked (the Size field is then greyed out); a text without it keeps its fixed size. A QR code address typed without `https://` gets it when the design is saved; a refused save names the part that is wrong (the address, or the place and size) and is logged (`slideshow.save_refused`).
- **No call to action line by default:** the earlier default had a call to action picked at random from the dictionary (`screen.qrText.1` to `4`) above the address; it is not part of the default any more. The wordings stay in the Dictionary, and a designed screen
  (like the MTK x Vasas one) keeps its own call to action next to its QR code.
  **Existing default slideshows keep the layout they were made with**: only a new event, or a default slideshow made again, gets this layout (an editor can also move the texts of a design by hand).
- **When it is made:** for every **new** event, after the response (the admin form, messmass provisioning, savetheworld provisioning); on demand with **Create the default slideshow** on the
  event's slideshows list when it has none (`POST /api/admin/events/<id>/default-slideshow`). Making it twice changes nothing. **Existing events get nothing automatically**; a backfill
  needs the owner's go.
- **The default flag:** `Slideshow.isDefault`, at most one per event. **Make default** on any slideshow's card sets it (`PUT` of the same route; the new one is flagged before the old flag is
  taken off, so an event is never without one). The default slideshow cannot be deleted: make another the default first.
- **Not yet:** the sample selfie in the window when no photo exists (needs the picture slots, step 5), the stored picture of the welcome page screen drawn from this layout (step 8), the
  text levels (global, partner, event) for the call to action (step 6).

## The welcome page screen picture (issue 327; step 8a of docs/BUILDING_BRICKS.md section 8)

The welcome page shows the giant screen as a picture above the Start button. For an event with a default slideshow that picture is **drawn on the server from the default slideshow**, the way
the stage draws it live, so the welcome page and the stage show one design (`lib/screen/welcome-screen.ts`, `lib/screen/welcome-screen-store.ts`).

- **What is drawn, back to front** (the player's own order): what is in the photo window, the overlay picture with its transparent window, the QR code (its dark modules, from the same `qrcode` library) and
  the texts (bold, one line, soft shadow, the event's font through `lib/frame/fonts.ts`). The window shows the event's frame over a stand-in (a head and shoulders in the event's colours) until the
  library has sample selfies (step 5); a real photo is not used: the picture is a stored image, not a live view.
- **Stored on the event** as `Event.welcomeScreen` `{ url, key, generatedAt, renderVersion }`, under `screens/<event uuid>/welcome-<key>.png` in Vercel Blob. The `key` is the hash of everything it is drawn
  from (the design, the colours, the font, the frame, the drawing version), so asking again costs nothing and a change in any of them draws it again. **It lives next to the pages, never in them: a page's own
  `screenImageUrl` is never touched and always wins when the page is shown.**
- **When it is drawn:** for a new event, right after its default slideshow is made (after the response; `lib/screen/new-event-screen.ts`); on request with **Draw the welcome page screen** on the event's slideshows list
  (`POST /api/admin/events/<id>/welcome-screen`, which also makes the default slideshow when there is none: this is how an existing event gets one, by an admin's choice); and **every time the
  default slideshow is saved with a screen design or made the default (Make default)**, also for an event that had no picture yet (owner, 2026-10-09: "the welcome composition with the big screen has to use exactly the one created for
  the slideshow, so whenever a slideshow is updated, it has to be updated as well"; an earlier rule only redrew a picture that already existed). So the picture is always the default slideshow's own screen: its overlay, QR code and texts (a `fit` text is scaled to its box here as on the stage).
  What the picture is drawn from changing in another way (the event's colours, font or frame) draws it again the next time anything asks for it. **A welcome page that has a picture of its own keeps it** (that is the page's explicit choice): an event whose welcome page should follow its screen has none on the page.
- **Limits:** a text that is wider than its box is drawn like the stage draws it (not shrunk); the line is placed in the middle of a 1.15 line box, which is the stage's within a pixel or two, not identical.
- **Fixed 2026-10-09 (issue 520): the capture page never copied `Event.welcomeScreen` from the public event into its state** (`lib/events/welcome-screen-url.ts` does it now), so a welcome page without a picture of its own showed no giant screen at all; the line below described what was meant, not what happened, until then. It was found when the owner's MTK welcome page lost its static picture to follow the slideshow and showed an empty space.
- **Shown on the welcome page (step 8b):** the capture page's welcome step shows it on any welcome page with no picture of its own (`event.welcomeScreen.url`), and an event that gets the journey defaults, has the picture and has no welcome page of its own gets a default welcome page (docs/JOURNEY_DEFAULT_PAGES.md). An event without the picture is unchanged.
- **Not yet:** the sample selfie in the window (step 5). It is planned in `docs/WELCOME_SCREEN_PHOTO_PLAN.md` (a general sample selfie from a library that the partner and the event follow, a photo of the event, the latest approved photo; owner request 2026-10-10, issue 540); the renderer already takes a `windowPicture`.

## Limits

- 16:9 only: the design is positioned for the designers' 1920×1080 stage; another stage aspect shifts it.
- The QR code points to the address given. Counting scans per placement (a short link for each place the QR is shown) is a separate step.
- The text stays on one line and is not shrunk to fit: shorten it if it is too long for its box.
