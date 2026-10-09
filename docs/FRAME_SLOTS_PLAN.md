# Frames in general: twelve optional slots (issue 502, client request 2026-10-09, owner answer 218: full delivery now)

The client wants a frame to be composed of **up to twelve optional slots**: six **text** slots (💬) and six **picture** slots (🏞️), at the same six positions: top left, top centre, top right, bottom left, bottom centre, bottom right. The top-centre and bottom-centre picture slots are **bars** (full width). Every slot is optional and has a source. The default frame is four slots: top-left text = team 1 over team 2, bottom-centre text = the fan supporter message, top-right picture = the partner logo, bottom-centre picture = the generated message background (the coloured bar).

This document is the design. The feasibility check (one server renderer, every channel uses the finished PNG) is in the issue; read that first.

## 1. The decisions (to change at the first look, not before)

| # | Decision | Why |
|---|---|---|
| D1 | The slots belong to the event's **generated frame** (`Event.frameDesign.slots`). An event without `slots` is drawn exactly as today, by the old code path, untouched. | The default frame cannot change by accident: no event is redrawn until somebody turns slots on. |
| D2 | `DEFAULT_SLOTS` (the four slots above) must give **the same layout numbers** as the old `layoutFrame` for the same input (a test with a fixed text measure and with real MTK data), so an editor starts from an identical frame. | The client's own example is the default. |
| D3 | Precedence per message: a **library frame the message chose** (epic 444) > the older base picture > **slots** > the generated layout. Slots replace the generated layout; they do not touch uploaded frames. | Nothing that works today changes meaning. |
| D4 | **Text sources:** `teams` (team 1 over team 2), `team1`, `team2`, `title` (the event name), `message` (the fan supporter message of epic 444), `custom` (a fixed text typed by the editor, up to 120 characters). A text slot may have its own colour. `teams`, `team1`, `team2`, `title` and `message` may appear once each. | Everything the client's example names, plus a fixed line (a hashtag). |
| D5 | **Picture sources:** `partnerLogo` (corners), `bar` = **generated message background** (the coloured bar of the messmass style, centre positions only), `picture` (a picture of the Images library, any position; at a centre position it is a **bar**). A `picture` slot may hold up to six pictures and say which message uses which (blue for the club's messages, pink for the pink-month ones): this is how the client's blue and pink strips work. | The client's attached strips; no random choice inside a slot is needed because the design choice of epic 444 and the message-to-picture map cover it. |
| D6 | **Geometry** (fractions of the 1920 × 1080 frame, the 5 % safety margin kept): corner pictures fit a box of 15 % × 15 % (a `size` of 5 to 40 % per slot) in the corner of the safety area, aspect kept; a **bar** is full width, as tall as the picture is at full width (at most 30 % of the height), on the top or the bottom edge; the generated bar is 20 % high with its 1 % line, as today. Corner texts have a 20 % × 25 % box (left, right) anchored to the corner; the top-centre text is 30 % wide. **A centre text lies in the bar of its edge when there is one** (the message in the bottom bar, as today). A top text moves below a top bar and a bottom text above a bottom bar. Pictures are drawn first, texts on top. | The client's strips are 1920 px wide: they land at natural size. Today's values are kept for what exists. |
| D7 | **Text fit:** wrapping to the box, at most 10 % of the height, at least 3 %; what still does not fit is cut with an ellipsis, **and the editor is told** in the preview. The message in a bar stays one line shrunk to fit, as today. | The same rules the teams and the event name already follow. |
| D8 | **Overlaps** between different positions are allowed and **reported** in the editor (a text over another position's picture can be meant: a hashtag on a bar). The same position's text over its own picture is by design. | A hard ban would forbid the client's own bottom bar. |
| D9 | Layer ids for the dark area: `logo`, `bar`, `teams`, `message` keep their names; the new ones are `picture-<position>` and `text-<position>`. | The territories (`FrameTerritories`) key on the id. |
| D10 | The variant key includes the resolved slots only when the event has them, so no stored image is redrawn. `FRAME_RENDER_VERSION` is not bumped. | Same as the older base picture. |
| D11 | Partner and global **defaults** (segment 7): a partner and the general level can hold a default slot set, which an event uses until it makes its own (one way, parent to child; docs/BUILDING_BRICKS.md). | The brick rules the owner set. |

## 2. Segments (each ships alone)

1. **Model and checks** (`lib/frame/slots.ts`): the types, `DEFAULT_SLOTS`, `parseSlots` (defensive, for the admin input), the geometry of the positions, the overlap report. Tests.
2. **Layout and drawing** (`lib/frame/layout.ts`, `render.ts`): `layoutSlots`, `renderSlotFrame`; the check that the default equals the old layout; a real render of a sample; the variants pipeline uses slots (D3) with the key rule (D10); the dark area of slots.
3. **The save and a preview**: `PUT /api/admin/events/<id>/frame-slots` (validate, save, generate), `POST …/frame-slots/preview` (a PNG of the draft, nothing stored), the refresh of the messmass snapshot keeps `slots`.
4. **The admin panel** on the event's Frames page: twelve rows, source pickers, the picture chooser, the message-to-picture map, the preview, the overlap and fit notes, "back to the default frame".
5. **Defaults of the partner and the general level** (D11).
6. **Guide** (English and Hungarian) in the messmass repo, release notes, ARCHITECTURE, the MTK set-up from the client's files (a runbook, not done by me on the live event without the owner's go).

## 2a. Status (2026-10-09)

| Segment | Status |
|---|---|
| 1 Model and checks | built (`lib/frame/slots.ts`, `slots-draft.ts`) |
| 2 Layout and drawing | built (`slot-layout.ts`, `renderSlotFrame`, the variants pipeline); the default slots equal the generated frame in numbers and in pixels |
| 3 Save and a preview | built (`PUT /frame-slots`, `POST /frame-slots/preview`, the snapshot refresh keeps `slots`) |
| 4 The admin panel | built (`FrameSlotsPanel` on the event's Frames page) |
| 5 Partner and general defaults | not built |
| 6 Guide and the MTK set-up | the guide is not written; the set-up is the owner's go (it changes a live event) |

## 3. Not in this plan

A frame in portrait; a fan-typed message (the message is the event's list, epic 444); team logos as a picture source (the logos are stored in the snapshot but not fetched today); text in several fonts; moving a slot freely (positions are the six).

## 4. Risks and how each is handled

Tiny text in a corner (minimum size and the ellipsis report); overlapping slots (reported); a stored image set that no longer matches the drawing (D10: the key changes only for events that turn slots on); a picture host that is not allowed (the same host check as the older base picture: https, own storage, no redirects, size capped; a picture that cannot be fetched fails the generation and leaves the old images); more images (one per message and design; the cap of 40 stays).
