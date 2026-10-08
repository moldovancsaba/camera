# Library audit: what bypasses the libraries or cannot be seen (2026-10-08)

Epic camera#361, issue camera#370. Owner request, 2026-10-08: "fix the frame anomaly than the logo than do an audit for all the elements i believe you just hardcoded like these".
The audit was done on 2026-10-08 by reading the code and by a **read-only** look at the data of the MTK Budapest x Vasas FC event. The model it measures against is in
`docs/LIBRARIES.md` (three libraries, one way only: Global -> Partner -> Event; pictures always visible).

| # | Finding | Where | Fix | Carried by | State |
|---|---|---|---|---|---|
| 1 | The designers' frame pictures of MTK live only as data on the event (`frameDesign.base`), in no list. | `Event.frameDesign.base` | Frames get a message area; every message chooses its frame; a button moves the base into the library, byte-identical images. | camera#366, camera#369 | Built; the move is not applied to any real event (MTK last, after the owner has seen the libraries work). |
| 2 | The messmass partner logo is not a library item. | partner `logoUrl` (messmass) | A button imports it as a **partner library** item that points at the same R2 file; assigned to nothing (decision 120). | camera#367 | Built, under review. |
| 3 | Five parallel logo channels: the event logo, `Event.logos[]`, the theme logo, `Partner.logoUrl`, the emoji. | several | `Event.logos[]` follows the library model; the other channels stay as they are until one channel is decided. | camera#367 (part), camera#393 | `Event.logos[]` done; the decision on one channel is a backlog issue (camera#393). |
| 4 | Pictures are invisible in several lists. | frame, logo and other lists | One shared thumbnail, item card and upload form show a picture or the words "No picture" in every library list. | camera#357, camera#364, camera#367, camera#368 | Frames done and live; logos and images built, under review; garments not done. |
| 5 | The event logos overview counts only; it does not show the logos. | event logos page | The page lists the logos with their pictures. | camera#367 | Built, under review. |
| 6 | The logo scenario `slideshow-transition` has no consumer: it is stored and listed, and no screen shows it. | `lib/db/schemas.ts`, the logo pages | The logo pages say so. | camera#394 (backlog: build it or remove it) | Noted on the pages. |
| 7 | Pictures are typed as raw addresses with no library or preview: the email footer, the four welcome page pictures, the call-to-action background, the screen overlay; no check of the address. | event editor, page editor, screen design | A picture picker (preview, choose from the library, upload here, clear, plain address kept). | camera#368 | Built, under review. |
| 8 | A generic upload route outside the library. | `POST /api/upload-logo`: the new event and event edit pages (event logo), the landing page editor, `lib/admin/upload-image-client.ts` | The picture fields move to the picker (7). The event logo upload stays until finding 3 is decided. | camera#368 (the picture fields), camera#395 (backlog: the event logo upload) | Partly carried by camera#368. |
| 9 | Fonts and colours come only from messmass; they are not library items. | event theme | By design: messmass is the source. Since camera#380 the colours follow messmass by default with an overwrite. | camera#397 (ideabank) | Not a defect; ideabank if a library is ever wanted. |
| 10 | Default messages, consent links and page texts are in the code (editable per event, not in a library). | `lib/` defaults | The defaults program. | camera#326 to camera#331 | Backlog. |
| 11 | The garment allowlist is names only. | try-on | A garment library with pictures. | camera#398 (ideabank) | Not for the 16 October event. |
| 12 | No per-event app icon (PWA): `public/fff/manifest.webmanifest` is the only manifest. | `public/fff/` | Owner question on the PWA is open. | camera#399 (ideabank) | Ideabank until the question is answered. |
| 13 | No write path to R2 from the app: the MTK assets were put there by hand. Uploads in the app go to Vercel Blob. | storage | An R2 write path, or keep Blob for uploads and R2 for what is imported. | camera#305, camera#306 | Backlog. |
| 14 | Library lifecycle gaps: deleting a global frame removes only its document (events and partner libraries keep the id, the pages list it as missing); an item's scope used to be only inferred; lists showed the newest 20. | `DELETE /api/frames/[id]`, `lib/library/` | Scope is now stored on new items and old ones read as global; the library lists return up to 500 items; **deleting a global frame or logo that an event, a partner library or a partner default uses is refused with the counts** (camera#392). Still to do: paging beyond 500. | camera#392 (done), camera#396 (backlog: paging) | Refusal done; paging in the backlog. |
| 15 | Two leftover files under `public/fff/` (`fff_frame.png`, `manifest.webmanifest`). | `public/fff/` | Remove them if nothing refers to them. | camera#400 (ideabank) | Open. |

## Triage of the open findings (confirmed by the owner, 2026-10-08)

- **Before 16 October:** finding 14, refuse deleting an item that is in use (camera#392, done).
- **Backlog, after the 16th, each its own issue:** 3 one logo channel (camera#393), 6 `slideshow-transition` (camera#394), 8 the event logo upload (camera#395), 13 the R2 write path (the existing camera#305 and camera#306), paging beyond 500 (camera#396).
- **Ideabank:** 9 fonts and colours as library items (camera#397), 11 a garment library (camera#398), 12 an app icon per event (camera#399), 15 leftover files (camera#400).
- Findings 1, 2, 4, 5 and 7 are carried by LIB-2 to LIB-6 and need no new issue; 10 is carried by the defaults program (camera#326 to camera#331).
