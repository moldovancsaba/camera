# Event design on the guest journey (plan)

Owner request (2026-10-06): "use the messmass reporting design for the user journey as we use it for the frames: we already have the
background colour, the logo and the text colours, so use it for all pages, to have beautiful login, selfie and photo pages."

Status: **in delivery** (owner decisions below, 2026-10-06). Built: J1 (theme and following messmass), J2–J4 (pages), J5 (fonts), J6 (emails). Epic [camera#285](https://github.com/moldovancsaba/camera/issues/285).

## What we already have

The generated default frame is built from a snapshot of messmass data stored on the event (`events.frameDesign.context`, camera#234). It
already carries what the pages need:

| Need | Where it is | Notes |
|---|---|---|
| Page background | `style.heroBackground` (`#RRGGBBAA`) | the colour behind the frame's bar |
| Text colour | `style.headingColor` (`#RRGGBBAA`) | |
| Font | `style.fontFamily`, `fontSource` (`google` / `custom` / `system`), `fontFile` | the frame draws it server side; pages would load it as a web font |
| Logo | `partner.logoUrl`, else the event emoji (camera#274), else none | the same fallback as the frame |
| Accent / buttons | the event's own `brandColor`, `brandBorderColor` (set in the event editor) | already used for buttons; messmass has no accent in the snapshot |

Coverage today (messmass answered for 171 of 177 events asked): the style comes from the **project or partner** for 52 events (25 partner,
27 project) and is the **system default** for 119. So a quarter of the events would look different; the rest would get the default look.

## What the pages look like today

Capture pages use the GDS shell with the event's `brandColor` on buttons and, optionally, the event logo. The "who are you", accept, CTA,
thank-you and restart pages share `CaptureStageShell`; the camera, reframe and preview steps are full-screen with a neutral background; the
waiting / share card is `ShareOverlay`; `/share/<id>` and the new waiting / not-approved notices use `PublicShell`.

## Proposed design

One resolved **event theme**, computed on the server from the event, used by every guest page:

```
EventTheme { background, text, accent, logo, fontFamily, fontUrl | null, source: 'messmass' | 'event' | 'default' }
```

- **Source order:** the messmass style snapshot (partner / project) → the event's own `brandColor` → the system default look. The frame and the
  pages therefore always agree.
- **Contrast is guaranteed, not trusted.** Text on the background must reach WCAG 4.5:1; when the messmass pair does not, the text falls back to
  white or black, whichever reads better. Buttons keep a readable label colour the same way. A theme is applied only when it passes; otherwise the
  default look.
- **GDS stays the rule.** The theme is data turned into CSS variables on a wrapper (`--event-bg`, `--event-text`, `--event-accent`); no raw colour
  literal enters the source (the `forbidden-color` gate stays green), and the components are the existing GDS ones.
- **Capture routes only.** Admin is untouched. The `/capture/[eventId]` layout, `/share/[id]` and the new vetting notices get the theme.
- **Fonts:** phase 2 and gated on licences. System and Google fonts are straightforward; a custom partner font (14 events) is served from the
  messmass origin and needs CORS and the partner's licence for web use.

## Work packages

| # | Package | Notes |
|---|---|---|
| J1 [camera#286](https://github.com/moldovancsaba/camera/issues/286) | `EventTheme`: resolve and validate (colours, contrast, logo fallback), unit-tested; exposed by `GET /api/events/<id>` for guests | pure, no visual change |
| J2 [camera#287](https://github.com/moldovancsaba/camera/issues/287) | Apply to the capture shell: identity, accept, CTA, loading, thank-you, restart pages; logo at the top | Playwright on the viewport matrix, dark and light backgrounds |
| J3 [camera#288](https://github.com/moldovancsaba/camera/issues/288) | Apply to the camera, reframe, preview and waiting card (background behind the camera, text and buttons) | the camera view itself stays neutral |
| J4 [camera#289](https://github.com/moldovancsaba/camera/issues/289) | Apply to `/share/<id>` and the waiting / not-approved pages; link preview colours | no change to what is shown |
| J5 [camera#290](https://github.com/moldovancsaba/camera/issues/290) | Web fonts (Google / system first, custom fonts after the licence check) | |
| J6 [camera#291](https://github.com/moldovancsaba/camera/issues/291) | Email: the same colours and logo in the guest emails | optional, owner to say |

## Decisions (owner, 2026-10-06)

1. **The default reporting themes apply too:** every event gets its messmass style, including the system default, and the defaults will be
   managed in messmass from now on. When a theme (or a logo) changes in messmass, camera follows: messmass notifies camera, which takes a new
   snapshot and redraws the frame if needed (J1).
2. A messmass pair that fails the contrast rule is corrected, not shown as is.
3. The camera view and the guest's own photo are never tinted; the theme colours the pages around them.
4. Fonts (J5) and the guest emails (J6) are delivered after the pages.
