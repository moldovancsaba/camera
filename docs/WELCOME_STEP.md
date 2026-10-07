# Welcome step (step 0 of the guest journey)

The first thing a guest sees on an event: a picture that fills the screen, two design layers on the bottom edge and one clear Start button in
the middle. Start leads on to the next step (the login step of a vetted event, which is placed right after it). Tracked in camera#308.

## What the page is made of

- **Background picture** (`backgroundImageUrl`): scaled to cover the screen and centred, in portrait and in landscape; a square photo is
  cropped, never stretched.
- **Bottom layer** (`bottomImageUrl`) and **corner layer** (`cornerImageUrl`): transparent PNGs, each as wide as the screen and on its
  bottom edge, so both always have the same scale; the corner layer is drawn over the bottom one and carries its design in the bottom right
  corner. The designers deliver both at 600×400 (3:2); they are a design of the whole bottom of the screen, so on a wide screen they grow with
  its width and are cropped at the top.
- **Start button** (`buttonText`, `buttonColor`, `buttonTextColor`, `buttonBorderColor`): a real button in the middle of the screen, 4.25 rem
  high, uppercase, with a ring; the colours are hex values from the page's settings (the club's official colours), anything else is ignored.
- **Giant screen** (`screenImageUrl`, `screenImageAlt`; camera#315): a 16:9 LED wall made in CSS 3D (`components/capture/LedScreen3D.tsx`): a box with a
  bezel and depth, tilted towards the guest, swaying slowly, with a faint pixel grid and a reflection on the glass, showing the one picture over
  the Start button. Only CSS and that picture: nothing else is downloaded, it is sharp on any screen, and it holds still for a guest whose device
  asks for less motion. It is as wide as the smallest of 88% of the screen width, 52 rem, and what fits above the button with a margin at the top
  (`--led-w`), so it never touches the button or leaves the screen, in portrait, landscape, tablet and desktop. Leave `screenImageUrl` empty and
  the page has no screen. `screenImageAlt` says what the picture shows, for screen readers.
- **Title** (`title`): read by screen readers, not shown. The design carries no text; the only words on the page are the button label.

## Setting it up

Admin, event, Pages (custom pages): "+ Welcome (step 0)" adds the page as the first step; the pictures can be pasted as addresses or uploaded
(PNG, JPEG or WebP, up to 4 MB, through `/api/upload-logo`). A vetted event shows its default login step right after the welcome step
(`withRequiredIdentityPage`, `lib/events/identity-page.ts`); an event with its own login page keeps it. After the last photo the guest goes
straight to the camera again, not back to the welcome step.

## Pictures of MTK x Vasas (match on 2026-10-16)

Stored by hand in the public R2 bucket `messmass-logos` under `landing/mtk-vasas/<sha256>.<ext>` (see `docs/LOGO_STORAGE.md`): the background
as a 264 KB JPEG made from the designers' 2.4 MB PNG (1254×1254), the two layers as delivered. Camera's CSP already allows that address. The picture on the giant screen is composed from the designers' slideshow overlay (`Seyu_MTK_VASAS_Overlay2`),
their sample selfie in its window, our QR code and "SZKENNELJ BE!" in the event font (1600×900 JPEG, `landing/mtk-vasas/screen/<sha256>.jpg`); replace it
in the page's settings once the real picture (a real guest photo, the tracked QR link) exists.

## The colour behind the page on a phone

On iPhone Safari with the floating bottom bar (iOS 26) the page box (and anything `fixed`) ends above the bar, and Safari ignores `theme-color`: it tints
its top and bottom from the body background or from a fixed element at the edge. The GDS provider wraps the app in a full-height div painted with
Mantine's body colour (white), over the document background, so that wrapper showed as a white band between the page and the bar (owner, 2026-10-07,
after #313 had fixed only the box height). `EventThemeScope` now renders `pageColourCss` (`lib/theme/css.ts`): the document and `--mantine-color-body`
take the event's page colour, as the messmass report does (`html` background, transparent body). A page can still end above the bar (an iOS rule for
fixed content); what shows below it is the page colour, never white. So `FullScreenPage` is exactly the visible screen (no `min-height: 100lvh`: the
part under the bar is not drawn, and the bottom layers anchored there were cut off, camera#317), the bottom layers sit on its bottom edge, and the Start
button and the giant screen are placed from `50svh` at the top. Not testable on a desktop: check on a phone.

## Known limits

- The layers are 600 px wide: on a phone (3× screens) and on a large screen they are enlarged and look soft. Ask for 1800×1200.
- The background is 1254 px square: on a 1920 px wide screen it is enlarged 1.5×. Ask for at least 2400 px on the long side.
- On a landscape phone the layers are cropped at the top (they are scaled to the width), which is what "same scale at full width" means.
