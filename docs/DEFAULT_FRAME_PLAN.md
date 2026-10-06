# Default event frame from messmass data

**Status**: planned, owner answers recorded 2026-10-06; tracker [camera#231](https://github.com/moldovancsaba/camera/issues/231), board [#24](https://github.com/users/moldovancsaba/projects/24).
**Scope**: a generated, general-purpose frame for every event that has no frame of its own, built from the partner logo, the home and visitor teams and the messmass reporting theme, with a random message from a list the event editor controls.

## What the owner asked for

Every event gets a default frame that can be overwritten or modified in camera admin. The frame is a 1920x1080 landscape frame on every device and in both orientations (decision 9). Layers, bottom to top:

1. the camera image
2. the partner logo, top right
3. the teams text, top left
4. a bar at the bottom in the partner reporting colour, with a thin top line
5. a message over the bar

All logo and text layers stay inside a safety area of 90% of the frame, centred. In the live camera view every layer is shown as a 50% transparent black area ("territory"). The real composition appears at the Love it / Try again step and is also the shared image.

## Geometry (percent of the frame, pixels at 1920x1080)

| Layer | Rule | At 1920x1080 |
|---|---|---|
| Safety area | 5% margin on every side | x 96 to 1824, y 54 to 1026 (1728x972) |
| Logo | inside a box of 15% width by 15% height, anchored top right of the safety area, aspect kept, never enlarged past the box; omitted when the partner has no logo. **Live view: only a 50% black box at the logo's fitted rectangle, never the logo image. Final render: the logo with no background of any kind** | box 288x162, right edge 1824, top 54 |
| Teams text | x from 10% to 30% (20% wide), top at 10% of the height; two lines, home then visitor; font size scaled so the first line is exactly the box width | x 192 to 576 (384 wide), top 108 |
| Bar | full width, bottom 20% | x 0 to 1920, y 864 to 1080 (216 tall) |
| Bar line | 1% of the height, top edge only, drawn outside the bar so the sides and bottom are clipped away | about 10.8 px, y 853.2 to 864 |
| Message | 90% wide, 5% tall, bottom edge 10% above the frame bottom, one line | 1728x54, x 96 to 1824, y 918 to 972 |

All four layers fit inside the safety area and none overlap (the logo box starts at x 1536, the teams box ends at x 576, the bar starts at y 864 and the logo and teams text end well above it).

Colours and font come from the event's effective messmass style: text, the bar line and the message use `headingColor`, the bar uses `heroBackground`, the font is the style's `fontFamily`. Colours are `#RRGGBBAA`; the alpha is kept.

Rules the owner set:

- No logo: the logo layer is not drawn.
- No home and visitor: the teams text shows the event name, broken into several lines to fit the box.
- The message is chosen at random from a list that is editable per event (decision below).

## Decisions

| # | Question | Answer |
|---|---|---|
| 1 | Message source | A random message from a list set in the camera event editor. Default list: "Go! Go! Go!", "Let's Go, {partner1}", "We are the Best!", "Together for Victory!", "🫶 Let's Go 🫶" |
| 2 | Message box | 1728x54, bottom edge 108 px above the frame bottom (table above) |
| 3 | Live view territory | Each layer's own box at 50% black, through the reframe step; the real composition from the preview step on |
| 4 | Colours | The event's effective style; `headingColor`, `heroBackground`, line in `headingColor` |
| 5 | Fonts | Load the style's font and fall back to Inter when it is unavailable |
| 6 | Freshness | A snapshot taken at provisioning, with a "Refresh from messmass" action |
| 7 | Logo | The home partner's logo only, in the 288x162 box |
| 8 | Teams text | Box x 192 to 576, top 108; font size scaled so the first line is 384 px wide |
| 9 | Portrait | None. Every device, in both orientations, uses the landscape frame |
| 10 | Scope | All events, backward as well |
| 11 | Try-on | The generated frame applies wherever the event has no camera frame of its own, for every event |
| 12 | Logo background | Live view: a 50% black box where the logo will be, no logo image. Final render: the logo without any background (decided 2026-10-06; how a logo's own opaque background is removed is the open point below) |
| 13 | Teams font rule, message size | The longer of the two lines is fitted to 384 px; the 54 px message box and its small text are accepted |

### Assumptions taken (owner to correct)

- `{partner1}` means the home team's name (the list said `{partner1Id}`, which would print a database id); `{partner2}` is the visitor. A message whose token cannot be filled is skipped; if every message is skipped there is no message layer.
- A new random pick on every shutter press, never the same message twice in a row; the pick is stored with the submission.
- At most 10 messages per event. The list lives on the event first; a partner-level default is a later step.
- "No camera frame of its own" means: the event has no active frame assigned. Events with frames keep them and are not touched by the backfill.
- Text alignment: teams text left, message centred, logo right.
- The teams font size has a cap of 10% of the frame height (108 px), so a very short name does not become huge; when the visitor line is longer than the home line the size is reduced until the longer line fits 384 px.
- "Without any background" is read as: no box or fill behind the logo, and the logo image's own flat opaque background (usually white) is made transparent. A flat background connected to the image border is keyed out with a tolerance and a soft edge, so white inside the crest stays; a logo that is already transparent is untouched; a logo whose background is not flat (photo, gradient) cannot be keyed out safely and is drawn as it is. Owner to confirm, see Open.
- An event name used as the teams text wraps inside the 384 px box at the largest size at most the cap that keeps its longest word inside the box.

## What messmass has

- **Logo**: `partners.logoUrl` (ImgBB URL; a report variant can carry its own `logoUrl`).
- **Home and visitor**: `projects.partner1Id` (home) and `partner2Id` (visitor), resolved to `partners.name`, with `sportsDb.strTeamShort`, `footballData.shortName` and `tla` available.
- **Templates**: `projects.reportTemplateId`, `partners.reportTemplateId`. A template is the block layout plus a pointer to a style. Resolution: event, then partner (partner1), then the default of that type, then a hardcoded one.
- **Style**: `report_styles` (the 26-colour `ReportStyle`). The style id resolves event (`styleIdEnhanced`), then partner (`styleId`), then template (`styleId`). When none is selected messmass applies its codified `DEFAULT_STYLE` (Inter, light colours) in the browser; no API returns it.
- **Fonts**: the style stores a font name; `available_fonts` maps custom names to `.woff` files in messmass `public/fonts` (AS Roma, Aquatics, CHL Hypercharged x2, Industry Light); the others are Google fonts.
- **Today** messmass sends camera only the partner name and logo and the event name and date, and it uses partner1 as the partner. Nothing exposes styles, templates, fonts or the visitor team. The public and style routes are guarded, so camera needs its own secret-authenticated endpoint.

## Architecture

The frame is rendered on the server, once per message, as a transparent 1920x1080 PNG. The capture flow then treats it like any frame, so the reframe step, the composite, the shared image and the try-on composer need no new drawing code.

```text
messmass  --GET frame-context (secret)-->  camera sync  -->  event.frameDesign.context (snapshot)
                                                                    |
                    layout engine (pure, percent based)  -->  renderer (server canvas + fonts)
                                                                    |
                                  one PNG per message in Vercel Blob, layer boxes stored with it
                                                                    |
     capture: pick a variant at random on each shutter press, draw territories from the stored boxes,
     composite photo + PNG, record the variant on the submission
```

- **Why server rendering**: fonts are fetched server to server (messmass `/fonts/*` is public static, no CORS change, no camera CSP change), the emoji font is bundled once, and the try-on composer (`sharp`, no text engine) can reuse the PNG.
- **Why one PNG per message**: the message changes per photo, so one image per event is not enough. A message costs one render and one stored PNG, hence the cap of 10.
- **Territories** are drawn in the browser from the layer boxes stored with the variant (text boxes depend on font metrics, which the browser does not have).
- **Picker**: an event that has no frames of its own and a generated design skips the frame picker (like an event with a single frame today) and goes straight to the camera. Variants are not shown as separate frames.
- **Data**: `Event.frameDesign = { mode, source, context, messages, messagesOverridden, variants: [{ message, imageUrl, width, height, layers, inputHash }], generatedAt }`. A submission records `frameVariant: { index, message }` and a synthetic `frameId` (`generated:<eventId>:<index>`); the stored variant URL is what try-on later composes with.
- **Camera-native events** (no messmass link): context falls back to the camera partner's name and logo, no teams, and the system default style, so the event name becomes the teams text.

### messmass endpoint (new, in the messmass repo)

`GET /api/integrations/camera/events/{messmassEventId}/frame-context`, shared-secret authenticated like the other camera integration routes:

```json
{
  "event":    { "id": "", "name": "", "date": "", "homeTeam": { "id": "", "name": "", "shortName": "", "logoUrl": "" }, "visitorTeam": null },
  "partner":  { "id": "", "name": "", "logoUrl": "" },
  "template": { "id": "", "name": "", "resolvedFrom": "project | partner | default | hardcoded" },
  "style":    { "id": null, "name": "System default", "resolvedFrom": "project | partner | template | system-default",
                "fontFamily": "Inter", "fontSource": "google | custom | system", "fontFile": null,
                "headingColor": "#1f2937ff", "heroBackground": "#f8fafcff" }
}
```

The endpoint returns the already resolved style, including the system default, so camera never re-implements the resolution chain.

## Work packages

| # | Package | Repo | Depends on |
|---|---|---|---|
| F1 [camera#232](https://github.com/moldovancsaba/camera/issues/232) | Layout engine: safety area, boxes, text fit and wrap, message pick, pure and tested | camera | none |
| F2 [camera#233](https://github.com/moldovancsaba/camera/issues/233) | Spike: server canvas with woff and woff2 fonts and the emoji on Vercel; decides the renderer | camera | none |
| F3 [messmass#429](https://github.com/moldovancsaba/messmass/issues/429) | `frame-context` endpoint with the resolution chain and system default | messmass | none |
| F4 [camera#234](https://github.com/moldovancsaba/camera/issues/234) | Data model, messmass sync, refresh action, message list storage and the default list | camera | F3 |
| F5 [camera#235](https://github.com/moldovancsaba/camera/issues/235) | Renderer and variants: one PNG per message in Blob, layer boxes, regeneration on input change | camera | F1, F2, F4 |
| F6 [camera#236](https://github.com/moldovancsaba/camera/issues/236) | Capture flow: skip the picker, territories, random variant per shutter press, record the variant | camera | F1, F5 |
| F7 [camera#237](https://github.com/moldovancsaba/camera/issues/237) | Event editor panel (GDS): message list, preview, refresh, reset, replace with an uploaded frame | camera | F4, F5 |
| F8 [camera#238](https://github.com/moldovancsaba/camera/issues/238) | Backfill every event without a frame of its own, try-on consistency, runbook and rollout | camera | F5, F6 |

F1, F2 and F3 can start at once.

## Risks

- **Emoji**: the 🫶 needs a colour emoji font bundled with the renderer; colour emoji ignore the text colour. F2 decides; the fallback is browser rendering of the message or dropping the emoji.
- **Fonts**: custom partner fonts are fetched from messmass at render time; if a font cannot be fetched the frame uses Inter and records that in the variant. A font that is a partner's property is only read, never stored in camera.
- **Logos**: partner logos are ImgBB images of any aspect ratio; some have an opaque white background. The renderer removes a flat border-connected background (see assumptions); a logo with a photo or gradient background keeps it. Anti-aliased edges can leave a faint halo on dark photos, so the keying softens the edge and the golden-image tests include a white-background logo.
- **Small message**: the message box is 54 px tall, so the text is about 4% of the frame height.
- **Stale snapshot**: the frame does not follow messmass changes until the refresh action runs (decision 6).
- **Backfill volume**: one render per message per event; the backfill runs in batches and is idempotent (inputs are hashed).

## Testing

- Layout engine: exact pixel boxes at 1920x1080 and at other sizes, text fit with long, short and missing names, no logo, no teams.
- Renderer: golden-image comparison for the five default messages with Inter, plus a custom font and the emoji.
- messmass endpoint: the resolution chain at every level, including the system default and a missing partner.
- Capture: Playwright on the same 16 viewports as the app-like work, territories visible in the live view, real composite at the preview step, variant recorded.
- Backfill: dry run with counts per outcome before the real run.

## Open

- Logo background: confirm the reading above, and what to do when the background cannot be removed (default: draw the logo as it is). Alternative sources in messmass that are usually transparent (`sportsDb.strTeamBadge`, `strTeamLogo`, `footballData.crest`) could be preferred over `partners.logoUrl`; F3 would then return them.

## Not covered

- Per-event frame editing beyond the message list, colours and logo toggle (F7 starts with those).
- A partner-level default message list.
- A portrait frame.
- Live data coverage in messmass (how many partners have a logo or a selected style): not measured; the dry run in F8 reports it.
