# Layout and message selection at an event (client feedback 2026-10-09)

Tracker: epic [#444](https://github.com/moldovancsaba/camera/issues/444) on board [#24](https://github.com/users/moldovancsaba/projects/24). Status: **answered by the owner 2026-10-09 (section 6), delivery mandatory for the MTK x Vasas match on Friday 2026-10-16**. Segment status is in section 7. Nothing changes for any event until an editor sets it.

## 1. What the client asked (my reading, to be confirmed)

The final picture of a user is: **the selfie**, a **layout** and the **supporter message**.

- A **layout** is made of: uploaded graphic elements, generated graphic elements, the team logo, the event title (team 1 + team 2), and other elements.
- The **default generated layout** is: generated graphic elements, the team logo, the event title, and a randomly chosen supporter message.

Which layouts an event has gives three situations (nothing to choose between them, it follows from what the editor made):

- **A** only the generated default exists: it is used.
- **B** the editor made one layout: it is the default.
- **C** the editor made more than one layout (the MTK event): the editor chooses **how the layout is selected at the event**: **1** the editor says which one is used, **2** the app picks at random, **3** the user selects in the app.

For **messages** the same three ways apply when the event has more than one message. When the user selects, the order is **design first, message second**, and only then the photo shoot, because every design uses the screen differently, so it has its own **dark area** (the part of the picture covered by the design) that the user must keep clear while zooming and moving the selfie.

## 2. What the system already has (read from the code and the real data)

| Need | What exists | Where |
|---|---|---|
| Layouts made by designers | **Library frames** (global, partner or event level) assigned to an event (`Event.frames`, switched on or off). A frame with a **message area** is a text-free layout that carries messages; a frame without one is a complete frame | docs/LIBRARIES.md, `lib/frame/message-area.ts` |
| The generated default layout | `Event.frameDesign`: messmass snapshot (team logo, teams or event title, colours, font), the **message list** (up to 10, editable), one **generated image per message** with its layer boxes | docs/DEFAULT_FRAME_PLAN.md, `lib/frame/*` |
| Message on a chosen layout | `frameDesign.messageFrames`: each message chooses the frame it is written on (issue 366). The images are generated once and reused while nothing they depend on changes | `lib/frame/message-frames.ts`, `variants.ts` |
| Dark area of a design | Message-area frames carry **layers** (boxes shown as territories at 50 % black in the live view and the reframe step); the generated layout has its own; a complete own frame is shown as a **silhouette** for a vetted photo | `FrameTerritories`, `silhouette.ts`, `ReframeStep` |
| User selection | A step **select frame** when an event has more than one complete own frame; a step **Choose your message** when the user chooses the message (issue 329, 2026-10-09, **all** images with their text at once: the design is implied by the message) | capture page |
| Random | A new random message at every shutter press, never the same twice in a row; the pick is stored with the photo | `pickVariant`, `frameVariant` on the submission |
| Where the choice shows afterwards | The final picture (photo plus the image used), the message and image recorded on the submission, the slideshows, the share page, try-on | submissions, `lib/photo-vetting/compose.ts` |
| Admin | Event frames page (assign, upload, message area editor), the generated frame panel (messages, refresh), the event editor setting "How a user gets the frame message" (replaced by S1) | `app/admin/events/[id]/frames`, `GeneratedFramePanel`, event edit |
| Levels | The slot model (partner default, event own, nothing copied), the text levels | docs/BUILDING_BRICKS.md, docs/TEXT_LEVELS.md |

**The real MTK x Vasas event today** (read-only check): two library frames, **blue** and **pink**, both text-free with a message area; four messages; two messages are written on blue and two on pink (the pink design carries "MINDEN NŐ SZÁMÍT!"); four generated images; no setting for how the user selects. 13 of 212 events have assigned frames, 1 has messages that choose frames.

## 3. What is missing

1. **No setting for how the layout is selected.** Today it follows from what exists: more than one complete own frame, the user picks; messages on library frames, a random image; otherwise random. The editor cannot say "this one", "random" or "the user chooses" for the layout, nor for the message.
2. **No design-first-then-message selection.** The user message step shows every image of every design at once.
3. **A message belongs to one design** (the editor's mapping). Whether a user choosing a design may then pick any message or only that design's messages is not decided (question 185).
4. **No layout built from elements.** A layout today is a whole picture (uploaded) or the one generated layout. The list of elements in the request (uploaded graphics, generated graphics, team logo, title, other) and "editor created layout" suggest composing a layout in the admin: that is issue #331 (toggles and positions on uploaded frames), a separate and large build (question 186).
5. **No partner level** for layouts and message lists (the brick model says every element has global, partner and event levels).
6. **No reporting** of which layout and message users chose.

## 4. The plan: deliverable segments

Each segment ships alone behind "nothing changes until an editor sets it", is tested, documented and checked in a browser at phone size where it is visible; the board is updated in the same step. Order follows dependency.

| # | Segment | Reuses | What the owner sees | Risk |
|---|---|---|---|---|
| **S1** | **Selection settings.** A setting per event for the layout and one for the message: **the editor chooses / random / the user chooses**, plus the editor's pick (which layout, which message). Shown in the event editor only when there is more than one layout or message, with the A / B / C situation named. Replaces the message-only setting of issue 329 (nobody has set it). Defaults = what happens today | `Event.frameChoice` pattern, event editor, PATCH route | A new section in the event editor | none (stored, not yet used) |
| **S2** | **The selection in the capture flow**, one pure function that decides the layout and the message from the settings, used by the capture page. **Design step, then message step**, then the camera; random per photo or per visit (question 187); the editor's pick; a **Change design / Change message** control on the camera step | `pickVariant`, select frame step, Choose your message step (issue 329) | Only an event with the setting sees anything new | medium: the capture page |
| **S3** | **Messages per design.** Which messages are offered after a design is chosen (question 185); if every message may go on every design, the images of every pair are generated (the images are reused by key, at most layouts times messages, 10 messages) | `generateFrameVariants`, `messageFrames`, the image key | Nothing until used | medium: generation and storage |
| **S4** | **Previews of the layouts** for the design step: each layout drawn with its first message, an uploaded complete frame as it is; the same previews in the admin | frame images, variants | The design step shows pictures | low |
| **S5** | **The dark area of the chosen design in the shoot**, checked for every kind of layout: message-area layers, generated layers, the silhouette of a complete frame (and for a vetted photo); the zoom and move step follows a change of design; tests with the real MTK frames | `FrameTerritories`, `silhouette.ts`, `ReframeStep` | The dark area matches the design chosen | low to medium |
| **S6** | **A page "Layouts and messages" in the event menu**: the situation A / B / C, the layouts with their elements and dark area, the messages and their designs, the two selection settings, a preview of every combination, a link to try it. Brings the frames page, the generated frame panel and the settings together | the three admin pages that exist | One place for all of it | low |
| **S7** | **Layouts composed from elements** (issue #331): toggles and positions for the team logo, the event title and the message on an uploaded graphic; the generated layout as the layout with every element on | the generated layout code, the message area | Editors compose layouts | high: how frames are drawn |
| **S8** | **Partner level** for layouts and message lists (the partner's default layouts and messages that its events use unless they have their own) | slot model, text levels | Partner pages | medium |
| **S9** | **Reporting**: how many users chose which layout and message, per event | what is recorded on the submission | A table for the client | low |

Issues: S1 #445, S2 #446, S3 #449, S4 #448, S5 #447, S6 #450, S7 #451 (with #331), S8 #452, S9 #453. All on the board: S1 to S6 in Backlog, S7 to S9 in Roadmap.

**Order (settled, 2026-10-09):** S1, S3, S2, S4, S5 before the match, each its own pull request, merged after Verify and shown to the owner on the phone; S6 and S7 after the match, S8 (partner level, wanted) right after, S9 later. S3 comes before S2 because the capture flow must handle one message on several designs from the start.

## 5. What does not change

Every existing event keeps what it does today until its editor sets the selection: events with several complete own frames keep the user's frame step, events with messages on library frames keep the random image, and every event with no own frame keeps the random generated message. Stored photos and their records are untouched.

## 6. The owner's answers (2026-10-09)

| # | Question | Answer |
|---|---|---|
| 184 | Two settings or one? | **Yes**: layout and message are two independent settings. |
| 185 | Which messages after a design? | **a), set in the admin**: the editor says which message can appear with which design, so it can be fully mixed. A message can be on one design, on several, or on all. |
| 186 | "Editor created layout" | **Both**: a designer-made frame uploaded by the editor plus the generated default now, a layout composed from elements (S7, #331) after the match. |
| 187 | Random | **Every photo**, as the message is today. |
| 188 | Live for MTK on 16 October? | **Yes, mandatory** for the next event. |
| 189 | Dark area of a complete uploaded frame | **Yes**: the whole non-transparent graphic at 50 % black. |
| 190 | Partner level | **Absolutely yes**: a partner-specific, well-designed default if the partner makes it (S8, right after the match). |
| 191 | Change design during the shoot | **Yes**: the message stays if the new design offers it, else the user chooses again. Also: the original cropped clean photo is stored, so a layout can be re-applied to a photo later. |

### What this settles in the build

- **Settings (S1, built):** `Event.frameSelection = { layout: { mode, pick }, message: { mode, pick } }`, `mode` is `editor` (with a `pick`: a layout id, or the message as listed), `random` or `user`. Missing means what the event always did (`todaysSelection`). Saved from the panel **How users get the layout and the message** on the event's Frames page (`GET`/`PUT /api/admin/events/<id>/frame-selection`); the panel shows only what can be chosen (more than one layout, more than one message) and names the situation A, B or C.
- **Layouts of an event:** its own complete frames when it has any (the generated frame is not used then), otherwise the designs its messages are written on plus the generated layout for messages written on none (`layoutOptionsOf`).
- **Messages on designs (S3):** `frameDesign.messageFrames[message]` becomes one frame id **or a list** (`framesOfMessage` reads both); one image per (message, design) pair, reused by key; an admin table of messages by designs.
- **Capture (S2):** design step, then message step (the messages that design offers), then the camera; **Change design** and **Change message** on the camera step; a design change keeps the message if the new design offers it, else asks again; random is a new draw at every photo, never the same pair twice in a row.

## 7. Segment status

| Segment | Status |
|---|---|
| S1 #445 selection settings | built, pull request #455 |
| S3 #449 messages per design | built (this pull request); S1 #445 merged as #455 |
| S2 #446 capture flow | after S3 |
| S4 #448 layout previews | after S2 |
| S5 #447 dark area | after S4 |
| S6 #450, S7 #451, S8 #452, S9 #453 | after the match |
