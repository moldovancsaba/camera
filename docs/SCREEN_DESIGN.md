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
| Overlay picture | `overlayImageUrl` | A 1920×1080 PNG drawn over the whole stage, transparent where the photos play. https only. Chosen in the editor with the picture picker, from the images library of the slideshow's event, uploaded there, or pasted (docs/LIBRARIES.md); stored as the plain address. |
| Photo window | `window {left, top, width, height}` | Where the photos play. The photos are cropped to it (`photoFit: cover`) or shown whole (`contain`). The overlay's own rounded corners and border cover the edge of the photos. |
| QR code | `qr {url, x, y, size, color}` | `url` is where it points (https, up to 300 characters), `x`/`y` its top left corner, `size` its side as % of the stage **width**. The server draws it as an SVG of its dark modules (level M correction), by default white, so it is light on the dark overlay like the designers' example (a QR reader that reads inverted codes scans it; a phone camera does). |
| Texts | `texts[] {text, x, y, width, size, align, color}` | Single line, up to 8, each at most 120 characters; `size` is % of the stage height; white with a soft shadow by default. |
| Font | `fontFamily` (optional) | The texts are written in the event's own font, from its messmass report style (a Google font, or the style's custom font file), loaded by the player. A `fontFamily` set on the design replaces it with a Google font; leave it out. |

## MTK x Vasas (2026-10-26)

Overlay: the designers' `Seyu_MTK_VASAS_Overlay2.png` (stored in the R2 bucket under `landing/mtk-vasas/`). Measured from their size panel
(`39.84, 33.28, 1330.05 × 748.15` px of 1920×1080): window `left 2.075, top 3.081, width 69.274, height 69.273`; QR `x 73.54, y 2.78, size
24.375` (468 px); text "SZKENNELJ BE!" `x 73.44, y 48.7, width 24.48, size 5.6` in the event's font. At 1920×1080 the rendered QR is 468×468 at
(1412, 30), the window 1330×748 at (40, 33), as in the example.

## Limits

- 16:9 only: the design is positioned for the designers' 1920×1080 stage; another stage aspect shifts it.
- The QR code points to the address given. Counting scans per placement (a short link for each place the QR is shown) is a separate step.
- The text stays on one line and is not shrunk to fit: shorten it if it is too long for its box.
