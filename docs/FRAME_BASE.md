# Frames from the designers' picture (frame base)

A club's designers deliver the frame of an event as a text-free picture (transparent 1920×1080 PNG: header and footer bands, crest, ribbon…) and
camera writes the messages into it, in the event's own font: the font of its messmass report style, like every other text of the user journey
(owner, 2026-10-07; camera#311). This is the generated frame (docs/DEFAULT_FRAME_PLAN.md) with the designers' picture instead of the generated
layout, so everything that follows is the same: one image per message, a random one at every shutter press, the images stored in camera's own Blob
store, a user's photo recording the image it used, the messmass font refreshed with the snapshot.

## What is stored

`Event.frameDesign.base` (lib/frame/base.ts, `FrameBase`), next to the messages (`frameDesign.messages`, `messagesOverridden: true`):

| Field | Meaning |
|---|---|
| `images[] {key, imageUrl}` | One text-free frame per colourway (up to 6), e.g. `blue` and `pink`; https, on an allowed host (R2 logo bucket, Blob, imgbb). The first is the default. |
| `messageImages {<message text>: <key>}` | Which colourway a message uses; a message that is not listed uses the first image. |
| `messageBox {x, y, width, height}` | Where the message is written, in pixels of the 1920×1080 frame; the text is centred in it, bold, 80% of the box height, shrunk to fit the width. |
| `messageColor` | Hex colour of the message; white when omitted. |
| `layers[] {id: header\|footer, x, y, width, height}` | The boxes the live camera view shows as 50% black territories (the bands). |

The picture is only an input: each variant is drawn by `renderBaseFrame` and stored under `frames/generated/<eventId>/<key>.png`; the key covers the
picture, the box, the message and the font, so a change redraws exactly what it changes. A design without a base is unchanged, and keeps the keys it
had, so no event is redrawn by this feature. A picture that cannot be fetched fails the run and leaves the images as they were.

While the event has a frame of its own (a picture assigned in the frame library), that frame is used and the generated frames are not.

## Setting it up

**The way to set it up now is the library (camera#366, docs/LIBRARIES.md):** upload the designers' text-free frames at the event level (or the partner level), give each a
**message area** (where the message is written: the same box, colour and territories as the fields above, edited on the frame's card), and choose a **frame for each
message** in the generated frame panel of the event. The `base` below is the older way (data on the event, the MTK x Vasas event was set this way) and keeps working:
for each message the order is **the frame the message chose, else the base picture, else the generated layout**, and a design with neither keeps the keys it had, so
nothing is redrawn. The font follows the messmass report style of the event: change it there, and the next refresh redraws the messages.

## Moving the base into the library (camera#369)

The generated frame panel of an event that still has a base offers **Move it into the library** (`POST /api/admin/events/<id>/frame-design/migrate-base`, `lib/frame/migrate-base.ts`).
It creates one **event frame** for each picture of the base (the picture's address is kept, the message box, colour and territories become the frame's message area), assigns the
frames to the event (the event then has its own list), and makes every message choose the frame of the picture it uses today (the picture named in `messageImages`, else the
first). The images are drawn again once; a test proves that each one is **byte for byte** the image the base drew, so users see the same pictures. The base stays on the event
until the editor checks the images and presses **Remove the old data** (`{ "retire": true }`), which is refused while a message would lose its picture (a message with no frame,
or a frame that is gone, switched off, or has no message area). Doing it twice changes nothing more: the same frames are reused and nothing is assigned twice. The panel asks for a
save of unsaved message edits first, because it reloads the messages.

## MTK x Vasas (2026-10-16)

Pictures: the designers' `FRAME1` (blue band: HAJRÁ, MTK!, SZÍVEM KÉK-FEHÉR!) and `FRAME` (pink band: MTK SZÍV!, MINDEN NŐ SZÁMÍT!), stored in the R2
bucket under `frames/mtk-vasas/base/`. Message box `x 520, y 8, width 880, height 90` (between the crest and the ribbon; the designers' texts are
centred at x 960 and about 51 px high), territories: header `0,0,1920,100`, footer `0,980,1920,100`.
