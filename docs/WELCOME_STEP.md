# Welcome step (step 0 of the guest journey)

The first thing a guest sees on an event: a picture that fills the screen, two design layers on the bottom edge and one clear Start button in
the middle. Start leads on to the next step (the login step of a vetted event, which is placed right after it). Tracked in camera#308.

## What the page is made of

Five elements, **each one optional** (owner, 2026-10-07): the giant screen (needs its picture), the left image, the right image, the background picture, and
the Start button (always there; its text is a setting, so it can be written per event and per language). A setting that is empty means that element is not
drawn: no screen picture, no giant screen; no left image, no left image; no right image, no right image; no background, no background (the page colour of the
event shows). Each one stands alone, none needs another. In the admin (event, Pages, Welcome step) the fields carry these names: Start button text,
Background picture, Left image (bottom left), Right image (bottom right), Giant screen picture (and its description for screen readers), plus the three button
colours. `WelcomePage.test.tsx` keeps the rule ("every element is optional").

- **Background picture** (`backgroundImageUrl`): scaled to cover the screen and centred, in portrait and in landscape; a square photo is
  cropped, never stretched.
- **Bottom layer** (`bottomImageUrl`) and **corner layer** (`cornerImageUrl`): transparent PNGs on the bottom edge, always at one scale. In portrait each is as
  wide as the screen (the corner layer is drawn over the bottom one and carries its design in the bottom right corner). In landscape (the shape of the page box
  decides, through a container query, `WELCOME_LAYER_CSS`) each is half the width of the screen: the bottom layer at the left edge, the corner layer at the right
  edge (owner, 2026-10-07: full width made them huge on a phone held sideways, camera#318). The designers deliver both at 600×400 (3:2) with their art in the
  lower part only (the bottom layer is a full-width blue band with the "10" and the laurel at its left, the corner layer is the club badge in its bottom right
  corner), so in landscape the blue band ends at the middle of the screen and the badge stays in the corner.
- **Start button** (`buttonText`, `buttonColor`, `buttonTextColor`, `buttonBorderColor`): a real button in the middle of the screen (with the giant screen above it, when there is one), 4.25 rem
  high, uppercase, with a ring; the colours are hex values from the page's settings (the club's official colours), anything else is ignored.
- **Giant screen** (`screenImageUrl`, `screenImageAlt`; camera#315): a 16:9 LED wall made in CSS 3D (`components/capture/LedScreen3D.tsx`): a box with a
  bezel and depth, tilted towards the guest, swaying slowly, with a faint pixel grid and a reflection on the glass, showing the one picture above the Start
  button. Only CSS and that picture: nothing else is downloaded, it is sharp on any screen, and it holds still for a guest whose device asks for less
  motion. **The screen and the Start button are one group** (`data-welcome-group` in `WelcomePage`): a column, the screen above the button, centred as a
  whole in the visible screen (horizontally and vertically, below the top inset of the notch), so on every device they sit in the middle together. The group is as
  big as it can be: the screen is as wide as the smallest of 88% of the screen width, 90 rem, and what makes the group about 90% of the height of the page box
  (`--led-w`, in `cqh`, 1% of the box height; `svh` is not used because it is about 100 pt too small on a phone held sideways, camera#318). So in portrait
  it is as wide as the screen allows, and on a phone held sideways, a tablet or a desktop it fills the height, and it never touches the button or leaves the
  screen. Leave `screenImageUrl` empty and the button alone is centred.
  `screenImageAlt` says what the picture shows, for screen readers.
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
in the page's settings once the real picture (a real guest photo) exists. **The QR code in that picture is the tracked link of the real screen** (`https://go.messmass.com/<slug>`, the event's "Giant screen" link, owner 2026-10-07), so the picture
is the real screen as guests will see it; a scan of it counts as a giant-screen scan. It must never be another event's address: the first picture carried the test event's
address because it was made by a one-off script with a hard-coded address, and was only noticed on a screenshot. The QR belongs to the admin (Tracked links panel, "QR code (SVG)"),
not to a script; until the picture is generated by the product (planned: the default slideshow and the global defaults), decode the finished picture and compare the text with the intended link before uploading it,
then decode it again from the live page (a decoder helper must read the file it is given).

## The colour behind the page on a phone

On iPhone Safari with the floating bottom bar (iOS 26) the page box (and anything `fixed`) ends above the bar, and Safari ignores `theme-color`: it tints
its top and bottom from the body background or from a fixed element at the edge. The GDS provider wraps the app in a full-height div painted with
Mantine's body colour (white), over the document background, so that wrapper showed as a white band between the page and the bar (owner, 2026-10-07,
after #313 had fixed only the box height). `EventThemeScope` now renders `pageColourCss` (`lib/theme/css.ts`): the document and `--mantine-color-body`
take the event's page colour, as the messmass report does (`html` background, transparent body). A page can still end above the bar (an iOS rule for
fixed content); what shows below it is the page colour, never white. So `FullScreenPage` is exactly the visible screen (no `min-height: 100lvh`: the
part under the bar is not drawn, and the bottom layers anchored there were cut off, camera#317), the bottom layers sit on its bottom edge, and the giant screen
and the Start button are one group centred in the box. Not testable on a desktop: check on a phone.

## Known limits

- The layers are 600 px wide: on a phone (3× screens) and on a large screen they are enlarged and look soft. Ask for 1800×1200.
- The background is 1254 px square: on a 1920 px wide screen it is enlarged 1.5×. Ask for at least 2400 px on the long side.
- In landscape the bottom layer's blue band ends at the middle of the screen (half the width, same scale as the corner layer); if that edge should fade or the band
  should run on, the designers need to deliver a wider band or a matching second piece.
