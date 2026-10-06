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
| Logo | inside a box of 15% width by 15% height, anchored top right of the safety area, aspect kept, never enlarged past the box; omitted when the partner has no logo. **Live view: only a 50% black box at the logo's fitted rectangle, never the logo image. Final render: the logo as it is, with no box or fill behind it; nothing is ever removed from the logo** | box 288x162, right edge 1824, top 54 |
| Teams text | x from 10% to 30% (20% wide), top at 10% of the height, **left aligned**; two lines, home then visitor; the longer line fills the box width; **box at most 25% of the height tall, font between 3% and 10% of the height; a line that still does not fit at the smallest size is cut at its end with an ellipsis** | x 192 to 576 (384 wide), top 108, at most 270 tall, font 32.4 to 108 px |
| Bar | full width, bottom 20% | x 0 to 1920, y 864 to 1080 (216 tall) |
| Bar line | 1% of the height, top edge only, drawn outside the bar so the sides and bottom are clipped away | about 10.8 px, y 853.2 to 864 |
| Message | 90% wide, from the top of the bar to the bottom safety margin (15% of the height), one line, font 80% of the box height, shrunk only when the width requires it | 1728x162, x 96 to 1824, y 864 to 1026, font 129.6 px |

All layers except the bar fit inside the safety area and none overlap (the logo box starts at x 1536, the teams box ends at x 576 and at most y 378, the bar starts at y 864; the message box is inside the bar).

Colours and font come from the event's effective messmass style: text, the bar line and the message use `headingColor`, the bar uses `heroBackground`, the font is the style's `fontFamily`. Colours are `#RRGGBBAA`; the alpha is kept.

Rules the owner set:

- No logo: the logo layer is not drawn.
- No home and visitor: the teams text shows the event name. If the name is a pairing ("A - B", "A x B", "A vs B") it is split into two lines at the separator and the separator is not shown (decision 15); any other name is broken into lines to fit the box.
- The message is chosen at random from a list that is editable per event (decision below).

## Decisions

| # | Question | Answer |
|---|---|---|
| 1 | Message source | A random message from a list set in the camera event editor. Default list: "Go! Go! Go!", "Let's Go, {partner1}", "We are the Best!", "Together for Victory!", "🫶 Let's Go 🫶" |
| 2 | Message box | First 1728x54 at y 918 to 972; **corrected by the owner 2026-10-06** to 1728x162 from the top of the bar to the bottom safety margin (y 864 to 1026) so the message can be larger |
| 3 | Live view territory | Each layer's own box at 50% black, through the reframe step; the real composition from the preview step on |
| 4 | Colours | The event's effective style; `headingColor`, `heroBackground`, line in `headingColor` |
| 5 | Fonts | Load the style's font and fall back to Inter when it is unavailable |
| 6 | Freshness | A snapshot taken at provisioning, with a "Refresh from messmass" action |
| 7 | Logo | The home partner's logo only, in the 288x162 box |
| 8 | Teams text | Box x 192 to 576, top 108; font size scaled so the first line is 384 px wide |
| 9 | Portrait | None. Every device, in both orientations, uses the landscape frame |
| 10 | Scope | All events, backward as well |
| 11 | Try-on | The generated frame applies wherever the event has no camera frame of its own, for every event |
| 12 | Logo background | Live view: a 50% black box where the logo will be, no logo image. Final render: the logo drawn with its own transparency (alpha channel) if it has one; if it has none, drawn exactly as it is. No box or fill behind it and nothing cut from the logo, ever (decided 2026-10-06) |
| 13 | Teams font rule | The longer of the two lines is fitted to 384 px |
| 14 | Teams text limits (owner correction 2026-10-06, numbers confirmed) | Left aligned; box at most 25% of the frame height; font between 3% and 10% of the height; text that still does not fit at the smallest size is cut at its end with an ellipsis (an event name loses its last part) |
| 16 | Message placeholders (owner, 2026-10-06: "Partner1 Yes"; camera#248) | `{partner1}` and `{partner2}` name the two sides the frame shows: the real home and visitor when both exist, otherwise the two sides of a pairing in the event name (decision 15), otherwise `{partner1}` is the home name alone and `{partner2}` the visitor alone, as before. So on an event whose home partner is a competition, "Let’s Go, {partner1}" reads "Let’s Go, Casademont Zaragoza", not "Let’s Go, EuroLeague Women". The teams text uses the same rule (`matchSides`) |
| 15 | Pairing in an event name (owner, 2026-10-06: "If we break into lines do not use these separators") | An event name that is a pairing is split into two lines like home and visitor, without the separator, and fitted by the teams rule. Separators need a space on both sides, strongest first: `x`, `×`, `vs`, `vs.`, `v`; then an en or em dash; then a hyphen. The first level that occurs decides, so "OTP Bank - PICK Szeged x Sporting Clube de Portugal" splits at the `x` and keeps the hyphen inside the home team. More than one separator of the level, an empty side, or no separator: not split, the name wraps as before. Real home and visitor names still win; one team alone does not stop the split |

### Assumptions taken (owner to correct)

- `{partner1}` means the first side shown on the frame and `{partner2}` the second (decision 16): the home team and the visitor, or the two sides of a pairing in the event name (the list said `{partner1Id}`, which would print a database id). A message whose token cannot be filled is skipped; if every message is skipped there is no message layer.
- A new random pick on every shutter press, never the same message twice in a row; the pick is stored with the submission.
- At most 10 messages per event. The list lives on the event first; a partner-level default is a later step.
- "No camera frame of its own" means: the event has no active frame assigned. Events with frames keep them and are not touched by the backfill.
- Text alignment: teams text left, message centred, logo right.
- The teams font size is kept between 3% (32.4 px) and 10% (108 px) of the frame height, so a very short name does not become huge and a long one does not become unreadable; when the visitor line is longer than the home line the size is reduced until the longer line fits 384 px.
- An event name that is not a pairing, used as the teams text, wraps inside the 384 px box at the largest size (at most 10% of the height) that keeps its longest word inside the box and the block inside 25% of the height, smaller down to 3%; if it still does not fit, the last part is cut and the last line ends with an ellipsis.

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
- **Capture flow (camera#236)**: the public `GET /api/events/[eventId]` returns `generatedFrame` (variants with image URL, message and layer boxes; null while the event has an active frame of its own or no image exists) and no longer returns the stored `frameDesign`, which is admin data. The page picks a variant at every shutter press (`pickVariant`, never the one before while another exists), shows the layer boxes as 50% black territories over the live view's frame guide and over the reframe stage (`components/capture/FrameTerritories.tsx`; the logo is a box, never the image; no logo means no box), and draws the real composition from the preview step on, so the saved and shared image is that composite. Try again picks again. The pick is per page load: a reload may repeat the last message once.
- **Data** (built in F4): `Event.frameDesign = { context, messages, messagesOverridden, updatedAt }`, where `context` carries `source` (`messmass` or `camera`), the snapshot and its `inputHash`; whether the generated frame applies is derived (the event has no active frame), not stored. F5 adds `variants: [{ message, imageUrl, width, height, layers, inputHash }]`. A submission records `frameVariant: { index, message, imageUrl }` (checked on the server: the image must be one of this project's `frames/generated/` PNGs) and keeps `frameId: null`; the stored variant URL is what try-on later composes with. (The first draft of this plan had a synthetic `frameId`; the submission route looks every `frameId` up in `frames` and answers 404 for an unknown one, so a generated frame is recorded in its own field instead, camera#236.)
- **Camera-native events** (no messmass link): context falls back to the camera partner's name and logo, no teams, and the system default style, so the event name becomes the teams text.

### messmass endpoint (new, in the messmass repo)

`GET /api/integrations/camera/events/[messmassEventId]/frame-context` (messmass [#429](https://github.com/moldovancsaba/messmass/issues/429), PR [#431](https://github.com/moldovancsaba/messmass/pull/431)), shared secret via `assertCameraSecret` like the other camera routes: 400 malformed id, 404 unknown event, 200:

```json
{
  "success": true,
  "event":    { "id": "", "name": "", "date": null,
                "homeTeam":    { "id": "", "name": "", "shortName": null, "logoUrl": null },
                "visitorTeam": null },
  "partner":  { "id": "", "name": "", "logoUrl": null },
  "template": { "id": null, "name": "System Default", "resolvedFrom": "project | partner | default | hardcoded" },
  "style":    { "id": null, "name": "System default", "resolvedFrom": "project | partner | template | system-default",
                "fontFamily": "Inter", "fontSource": "google | custom | system", "fontFile": null,
                "headingColor": "#1f2937ff", "heroBackground": "#f8fafcff" }
}
```

- `homeTeam` is `partner1Id`, `visitorTeam` is `partner2Id`; either is null when missing. `partner` is the home team, or the event's own partner (`partnerId`) when it has no teams, or null.
- `shortName` is the sports-DB or football-data short name when the partner has one.
- `fontFile` is a path on the messmass origin (for example `/fonts/ASRoma-Regular.woff`) and only set for a custom font; the renderer fetches it server to server.
- Resolution follows `report-config` (template: event, partner, default, none; style: event, partner, template, system default). **One deliberate difference:** the partner is found through `partner1Id`, which is what projects store, because `report-config` reads a legacy `partner1` field that nothing writes any more ([messmass#430](https://github.com/moldovancsaba/messmass/issues/430), report pages unchanged). The frame can therefore show the partner's theme while the event's own report still shows the default one.

The endpoint returns the already resolved style, including the system default, so camera never re-implements the resolution chain.

## Work packages

| # | Package | Repo | Depends on | Status |
|---|---|---|---|---|
| F1 [camera#232](https://github.com/moldovancsaba/camera/issues/232) | Layout engine: safety area, boxes, text fit and wrap, message pick, pure and tested | camera | none | merged ([camera#240](https://github.com/moldovancsaba/camera/pull/240), 0e464cb) |
| F2 [camera#233](https://github.com/moldovancsaba/camera/issues/233) | Spike: server canvas with woff and woff2 fonts and the emoji on Vercel; decides the renderer | camera | none | spike done on macOS and decisions recorded; used by F5 (merged); the Linux and Vercel run is the open "First check on Vercel" |
| F3 [messmass#429](https://github.com/moldovancsaba/messmass/issues/429) | `frame-context` endpoint with the resolution chain and system default | messmass | none | merged ([messmass#431](https://github.com/moldovancsaba/messmass/pull/431), 0a8f624); the endpoint is live once messmass has deployed |
| F4 [camera#234](https://github.com/moldovancsaba/camera/issues/234) | Data model, messmass sync, refresh action, message list storage and the default list | camera | F3 | merged ([camera#241](https://github.com/moldovancsaba/camera/pull/241), 6994bf3) |
| F5 [camera#235](https://github.com/moldovancsaba/camera/issues/235) | Renderer and variants: one PNG per message in Blob, layer boxes, regeneration on input change | camera | F1, F2, F4 | merged ([camera#242](https://github.com/moldovancsaba/camera/pull/242), 35ec112); the check inside a deployed function is open (RUNBOOK, "First check on Vercel") |
| F6 [camera#236](https://github.com/moldovancsaba/camera/issues/236) | Capture flow: skip the picker, territories, random variant per shutter press, record the variant | camera | F1, F5 | merged ([camera#246](https://github.com/moldovancsaba/camera/pull/246), 69c2146); checked on the real capture page in a production build on 16 viewports; inert in production until an event has generated images; no owner phone test yet |
| F7 [camera#237](https://github.com/moldovancsaba/camera/issues/237) | Event editor panel (GDS): message list, preview, refresh, reset, replace with an uploaded frame | camera | F4, F5 | merged ([camera#250](https://github.com/moldovancsaba/camera/pull/250), 72ad9b5); checked on a production build with the API mocked (33 checks); the issue stays open for a real save on a real event and an accessibility audit |
| F8 [camera#238](https://github.com/moldovancsaba/camera/issues/238) | Backfill every event without a frame of its own, try-on consistency, runbook and rollout | camera | F5, F6 | merged ([camera#252](https://github.com/moldovancsaba/camera/pull/252), 4ae2136): dry run, batched run, try-on with the recorded image; checked with mocked APIs; the dry-run report is for the owner to review, and the run has not been done |

Status is updated when a package is delivered, together with its issue and the docs it touches.

F1, F2 and F3 can start at once.

## Risks

- **Emoji**: the 🫶 needs a colour emoji font bundled with the renderer; colour emoji ignore the text colour. F2 decides; the fallback is browser rendering of the message or dropping the emoji.
- **Fonts**: custom partner fonts are fetched from messmass at render time; if a font cannot be fetched the frame uses Inter and records that in the variant. A font that is a partner's property is only read, never stored in camera.
- **Logos**: partner logos are ImgBB images of any aspect ratio. A logo with an opaque (for example white) background is drawn with that background, by the owner's decision: nothing is removed from a logo. The fix for such a logo is a transparent source: messmass keeps `sportsDb.strTeamBadge`, `strTeamLogo` and `footballData.crest`, and F3 can return them as an option later.
- **messmass gap**: until [messmass#430](https://github.com/moldovancsaba/messmass/issues/430) is decided, an event's report and its generated frame can disagree about the theme (the frame follows the documented chain).
- **Stale snapshot**: the frame does not follow messmass changes until the refresh action runs (decision 6).
- **Backfill volume**: one render per message per event; the backfill runs in batches and is idempotent (inputs are hashed).

## F2 spike result (2026-10-06, macOS arm64; Linux and Vercel not yet verified)

Prototype of the renderer in a scratch project (`@napi-rs/canvas` 1.0.10 plus `sharp`), drawing the frame to the geometry table above.

- **Fonts**: registered from in-memory buffers, as a server fetch delivers them: a variable TTF (Inter, weight axis works), a WOFF (messmass AS Roma, drawn in its own typeface), a WOFF2 (Poppins) and the 25 MB Noto Color Emoji (COLRv1). The 🫶 message drew in colour through the font stack `"<family>", "Inter", "Noto Color Emoji"`.
- **Speed**: 35 to 50 ms per 1920x1080 frame, PNG about 40 KB, cold start including the import and registering all four fonts about 110 ms, 142 MB resident.
- **Layout**: the longer team line ended at x 575 inside the 576 px box edge; the logo kept its own transparent corners with nothing behind it; "ø" renders.
- **Size**: the Linux x64 binary is 34.8 MB unpacked, well inside the Vercel function limit.

Decisions for F5:

- Use `@napi-rs/canvas`.
- Bundle the Google fonts messmass lists (Inter, Roboto, Poppins, Montserrat) as full font files; a Google WOFF2 covers only one script subset, so fetching WOFF2 would lose characters. Licences checked when bundling (F5): all five bundled fonts, Roboto included, are SIL OFL 1.1 (the `google/fonts` repository now carries Roboto under `ofl/`), with the licence texts in `assets/frame-fonts/licenses/`.
- Bundle Noto Color Emoji and register it only when a text contains an emoji. Converted to WOFF2 it is 5.5 MB instead of 25 MB and still draws in colour.
- Fetch a custom partner font from messmass at render time, server to server, register it under a unique alias per font file, keep it in memory only, and fall back to Inter when it cannot be fetched.
- Next config for the route that renders: `serverExternalPackages` for the canvas package and `outputFileTracingIncludes` for the font files (verify in F5).
- Known limit: Vercel has no system fonts, and Inter covers Latin, Greek and Cyrillic, so a name in CJK or Arabic would show missing glyphs. Fonts register process-wide, hence the unique alias.

Still open for #233: run the same render on Linux. There is no Docker or Vercel CLI in the build environment, so it happens on the first preview of F5 (a route that renders the sample), or earlier through a manually triggered workflow if wanted.

## Live checks (2026-10-06)

Read-only checks against production, after F1 to F5 and the installable-app work were merged:

- **messmass endpoint (F3):** `GET https://www.messmass.com/api/integrations/camera/events/<id>/frame-context` with the shared secret answered `200` in under a second for three real events, with the documented shape.
- **Installable app (camera#226):** `https://camera.messmass.com/capture/<eventId>/manifest.webmanifest` for a real event answers `200`, `application/manifest+json`, with the event's name, `standalone`, `orientation: any`, start URL and scope inside the event and the three icons (each `200`); the page head carries the manifest link, `viewport-fit=cover`, the theme colour and the iOS web-app tags; a malformed id is `404`.
- **Who gets a generated frame:** of 234 events, 15 have an active frame of their own and keep it; 219 have none (218 linked to messmass) and will get a generated frame, at most about 1,100 images (219 events, at most 5 messages each). Counts only; no event data was changed. Of those 219, 113 have a logo on their camera partner record; the messmass answer may carry more.

What the real data shows, for decisions in later packages:

- **The home team is often a competition.** (Decision 16 answers the placeholder question this raised.) The two newest events are named "Casademont Zaragoza - Basket Landes" and "Valencia Basket Club  - Fenerbahce Tarfin", but their `partner1Id` is the partner "EuroLeague Women" and there is no `partner2Id`. The frame then shows the event name (the owner's rule for events without a home and a visitor) with the competition's logo. Such a name is now split at its separator into two lines without the separator (decision 15, camera#244).
- **Logos can have a background.** The EuroLeague Women logo is a file named "...Logo-with-background...png". By the owner's decision logos are drawn as they are, so such a logo keeps its background.
- **Styles resolve as designed:** one event took its own style (`resolvedFrom: project`), one the partner's, and one fell back to the system default (a partner template without a style); no short names are present in this data (`shortName: null`).

## Testing

- Layout engine: exact pixel boxes at 1920x1080 and at other sizes, text fit with long, short and missing names, no logo, no teams.
- Renderer: golden-image comparison for the five default messages with Inter, plus a custom font and the emoji.
- messmass endpoint: the resolution chain at every level, including the system default and a missing partner.
- Capture: Playwright on the same 16 viewports as the app-like work, territories visible in the live view, real composite at the preview step, variant recorded.
- Backfill: dry run with counts per outcome before the real run.

## Not covered

- Per-event frame editing beyond the message list, colours and logo toggle (F7 starts with those).
- A partner-level default message list.
- A portrait frame.
- Live data coverage in messmass (how many partners have a logo or a selected style): not measured; the dry run in F8 reports it.
