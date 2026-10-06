# Camera module plan

**Status**: approved by the owner 2026-10-06; tracker [camera#203](https://github.com/moldovancsaba/camera/issues/203), board [#24](https://github.com/users/moldovancsaba/projects/24).
**Scope**: `components/camera/CameraCapture.tsx` and the capture flow in `app/capture/[eventId]/page.tsx`.

## Problems reported

1. Black photos about 25% of the time; a second or third try works.
2. The black-photo rate differs by device and browser.
3. The camera view is not used in full: most of the raw image is not visible in the frame.
4. The back camera opens first; the default must be the front camera.
5. No way to choose between all lenses.

## Owner decisions (2026-10-06)

- The default camera is the **front camera, globally** (no per-event setting, no remembered choice).
- **Anonymous capture diagnostics are approved** (no images, no personal data); the privacy text gets a line.
- The owner **tests on phones**; every phase ships to a Vercel preview first.
- **Record the full frame first, then scale and crop to the frame as a second step**, so the pure full image is stored and the frame gets the maximum available view.

## What the code does today (read 2026-10-06)

| Problem | Cause in the code |
|---|---|
| Black photos | The shutter renders as soon as `stream` exists, before the first real frame (`CameraCapture.tsx:917`). The black test samples one center pixel for exactly (0,0,0) (`:505-512`), so dark but not pure-black frames pass; retries use `setTimeout(..., 100)` with no limit or feedback (`:409-431`, `:476`, `:509-511`). Mobile asks for up to 2160x3840 with an aspect-ratio hint (`:301-307`). |
| Device and browser differences | Not reproducible without devices; plausible factors are the heavy mode request, Safari's `drawImage(video)` black-canvas class of bugs ([WebKit 217578](https://bugs.webkit.org/show_bug.cgi?id=217578)) versus `requestVideoFrameCallback` ([web.dev](https://web.dev/articles/requestvideoframecallback-rvfc), Chrome 83, Firefox 132, Safari 15.4), iOS Safari's canvas limit of 16,777,216 pixels ([pqina](https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/)), and two JPEG encodes. Diagnostics settle it. |
| Lost view | Preview and capture use `object-fit: cover` into a box forced to the frame aspect (`:760`, `:451-461`). Browsers may also crop for an `aspectRatio` constraint ([MDN](https://developer.mozilla.org/en/docs/Web/API/ConstrainBooleanParameters)); not yet verified. |
| Back camera first | `initialFacingMode` defaults to `environment` (`:92`); the capture page passes none (`page.tsx:1335-1356`). |
| No lens choice | The control flips `facingMode` only and appears only when more than one camera is listed (`:239-270`, `:386-392`). `isMobileDevice` sniffs the user agent (`:118-124`), so iPads and desktops ignore facing mode and the button only flips the mirror flag. |
| No stored original | `originalImageUrl` is set to the composite (`app/api/submissions/route.ts:260`). |

Share of the camera image that survives `cover` into a frame:

| Camera (as delivered) | 9:16 frame | 1:1 | 4:3 | 16:9 |
|---|---|---|---|---|
| Phone portrait, 3:4 | 75% | 75% | 56% | 42% |
| Phone portrait, 9:16 | 100% | 56% | 42% | 32% |

## Target flow

1. **Capture.** The live preview shows the entire camera view (`object-fit: contain`); the chosen frame is drawn as a dimmed guide. The shutter saves the image exactly as the camera delivers it: no crop, no scale, no frame, unmirrored.
2. **Reframe.** The fan sees the full image under the frame. Default: the largest crop that fills the frame, centred. Drag and pinch (with keyboard alternatives) move and zoom; **Show everything** fits the whole image with a blurred backdrop; **Reset**.
3. **Preview and submit**, as today.

## Data model and storage

- `originalImageUrl` becomes the real full-frame capture; `originalWidth/Height/FileSize/MimeType` describe it. `finalImageUrl` and `imageUrl` stay the framed composite. Old submissions are unchanged.
- New `reframe` record: `mode` (fill, fit, custom), `zoom`, crop box in source pixels, frame aspect, `mirrored`.
- The original is uploaded directly from the browser to Vercel Blob through a small token route (event, size and type checked), because a full-resolution original plus the composite can exceed the 4.5 MB Vercel Functions request-body limit.
- Originals skip the imgbb mirror (`uploadImage` always mirrors when a key is configured, `lib/imgbb/upload.ts:338`) and are never returned by public routes. The pledge wall already excludes them.
- Readers of `originalImageUrl` that will start receiving the true original: the fanmass media feed (it asks for the raw fan photo), event exports, admin try-on moderation, the try-on email fallback.
- Try-on keeps receiving the reframed, frame-free crop, so try-on and image.direct inputs do not change.
- Public Blob URLs stay (unguessable path, not listed). Private Blob access would need an authenticated image proxy; revisit if wanted.

## Privacy

A full-frame original shows more background and bystanders than the cropped result. Deleting a submission currently removes only the database row (`app/api/submissions/[submissionId]/route.ts:135`); the Blob files and the imgbb mirror stay online. The plan includes deleting the files with the submission, updating the privacy and consent text, and stating retention (camera#211). Wording needs owner or counsel sign-off.

## Phases

| Phase | Issue | Content |
|---|---|---|
| 0 Measure | #204, #205 | Anonymous diagnostics beacon; fake-camera Playwright harness; phone test checklist |
| 1 Reliable capture | #206, #207 | Front default, shutter gated on the first frame, sampled brightness check with bounded retries; native camera modes, no UA sniffing, one JPEG encode |
| 2 Full frame | #208, #209, #210, #211 | Full-frame capture and engine split; reframe step; storage and data model; file deletion and consent text |
| 3 Lenses | #212 | List every camera by device id, picker, zoom where supported |
| 4 Rollout | #213 | Preview tests, one canary event, before and after comparison |

Overlaps: camera#185 (GDS work package A, handover PR 10 restores the guest camera overlays) and camera#191 (autoStart under `next dev`). The engine is split from the presentation so the restyle lands on the new component.

## Phone test protocol (owner)

See `docs/CAMERA_DEVICE_TEST.md` once camera#205 lands. Until then, per device and browser: open the preview, take three photos with the front camera, switch cameras, and note whether any photo is black or dark, how much of the scene was visible, and which cameras the switch offered. Add `?cameraTest=<label>` to the URL once the diagnostics exist so the runs can be found in the logs.

## Progress (2026-10-06)

| Issue | State |
|---|---|
| #204 diagnostics, #206 front camera and shutter gating, #207 constraints (4:3 mode, no UA sniffing, canvas cap), #208 full-frame capture | merged; waiting for the owner's phone tests |
| #209 reframe step | merged (live from 21c6eda) |
| #210 storage of the original and the reframe record | merged (7f35bf9); waiting for the owner's live test |
| #211 privacy: file deletion, orphan report | in review; consent and retention wording waits for sign-off |
| #222 app-like capture (no page scroll, no zoom, fits the viewport) | planned, not started |
| #212 lenses, #205 harness, #213 canary | not started |

## Open questions

- iOS lens exposure (front and back only, or every lens); settled by the phone test.
- Whether Chrome crops for `aspectRatio` before the page sees the frame; settled by the diagnostics (`track.getSettings()`).
- Wording of the consent and privacy text; needs sign-off.
