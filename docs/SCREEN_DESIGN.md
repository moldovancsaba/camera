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

- **Layout:** the MTK x Vasas measures above are the default layout (`DEFAULT_STAGE` in `lib/screen/default-stage.ts`): photo window, QR code, a line of text under the QR code, and a band under
  the window for the written address. One layout, in percent of the 16:9 stage, used by the live stage and (next) by the picture of the welcome page.
- **Picture:** drawn by the server (`renderDefaultOverlay`, `@napi-rs/canvas`) in the event's own colours (its page colour and its button colour, from the messmass style): a night-stadium
  background (gradient, floodlight glows, a faint pitch circle and half-way line), panels for the QR code and the texts, an accent border round the window, and a transparent window.
  The same colours give the same picture. Stored in Vercel Blob under `screens/<event uuid>/default-<hash>.png`.
- **QR code and address:** the event's tracked **"Giant screen"** link (placement "Giant screen", kind QR, `lib/short-links/store.ts`) is made if the event has none, and reused if it has one, so
  the scans are counted on their own and reach messmass like every tracked link. The QR points at `https://go.messmass.com/<slug>`; under the window the same address is written without
  the protocol.
- **Call to action:** one short line picked **once at random** from the dictionary (`screen.qrText.1` to `4`, English and Hungarian; the language is the event's `uiLanguage`) and stored in the
  design, so the screen does not change between visits. The Hungarian wording is a draft for MTK to review. Every line fits one line of the panel (a test checks it).
- **When it is made:** for every **new** event, after the response (the admin form, messmass provisioning, savetheworld provisioning); on demand with **Create the default slideshow** on the
  event's slideshows list when it has none (`POST /api/admin/events/<id>/default-slideshow`). Making it twice changes nothing. **Existing events get nothing automatically**; a backfill
  needs the owner's go.
- **The default flag:** `Slideshow.isDefault`, at most one per event. **Make default** on any slideshow's card sets it (`PUT` of the same route; the new one is flagged before the old flag is
  taken off, so an event is never without one). The default slideshow cannot be deleted: make another the default first.
- **Not yet:** the sample selfie in the window when no photo exists (needs the picture slots, step 5), the stored picture of the welcome page screen drawn from this layout (step 8), the
  text levels (global, partner, event) for the call to action (step 6).

## Limits

- 16:9 only: the design is positioned for the designers' 1920×1080 stage; another stage aspect shifts it.
- The QR code points to the address given. Counting scans per placement (a short link for each place the QR is shown) is a separate step.
- The text stays on one line and is not shrunk to fit: shorten it if it is too long for its box.
