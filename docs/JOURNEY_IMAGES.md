# Pictures of the guest journey: the CTA page picture and the email footer

Two more places where a club's own design can be used without anyone laying it out by hand (camera#310). Both come from the designers as text-free
pictures; camera writes the words.

## CTA page with a picture

A CTA page (`cta`) can carry `backgroundImageUrl`. The page then shows the **whole picture, fitted to the screen with its aspect ratio kept** (`object-fit:
contain`, centred, in any orientation; the event's page colour shows around it; before 2026-10-09 it was cropped to fill, owner report 209, camera#491), puts a
soft dark veil over it, and writes the page's own title (big, uppercase), its text (italic) and its buttons over it in
white: a round visit button (`visitButtonText`, opens the page's address) and a quieter outline button for the next step (`buttonText`). The
buttons use the club's colours (`buttonColor`, `buttonTextColor`, `buttonBorderColor`, hex). Without a picture the page is the plain card it
always was. Set in the admin pages editor of the event (CTA page, "Picture page") with the picture picker: chosen from the event's images library
(its partner's library and its own uploads, `docs/LIBRARIES.md`), uploaded there (PNG, JPEG, WebP or SVG, up to 4 MB), or pasted as an address; the
page keeps the plain address either way. Settings of the page: `lib/db/schemas.ts` (`CustomPage.config`), component `components/capture/CTAPage.tsx`,
the round buttons `components/capture/PillButton.tsx` (shared with the welcome step).

Three optional switches on a picture page (camera#491; `lib/capture/cta-layout.ts` decides, `ctaLayout`): **`hideTexts`** hides the title and the text (the title stays for a screen
reader, visually hidden), **`pictureLink`** makes the **whole picture a link** to the page's address (a full-page button, `aria-label` = the visit button text), and **`hideButtons`**
hides the visit and continue buttons. The buttons only go when something else leads on: the picture is the link, or the page is the last one (continue button off), so a page is
never a dead end by accident (the editor says so). A tap on a picture whose buttons are hidden opens the address in a **new tab and goes on to the next page** when the page is not the
last, and goes to the address in the **same tab** on the last page. When nothing is written over the picture the dark veil is not drawn. A page with no address has no visit button and no
link (before, a page with no address but a known photo id linked to "?submissionId=…").

Hand over to the designers: a portrait-safe picture (guests are on phones; the picture is cropped to the screen), dark enough at its middle for
white text, no text and no button drawn in it.

## Email footer picture

`Event.emailFooterImageUrl`: a strip shown under the card of **every** guest email of the event (approved photo, not approved, the "after
save" emails). It is part of the event's theme (`EventTheme.emailFooterImageUrl`, only an https address on a host the pages may load images
from) and drawn by `lib/email/themed-html.ts`, 560 px wide on the page, with the event name as its alt text, rounded like the card. Set in the
event edit form ("Email footer picture") with the picture picker: chosen from the event's images library, uploaded there, or pasted as an https
address; it is stored as the plain address, as before. The picker offers PNG, JPEG and WebP only, as the old upload did: email apps do not show SVG. A 1120 px wide picture is sharp on phones; the designers' strip is 1920×200, so it is made
1120×117 first.

Emails are not drawn with a CSP, but an image that is not on an allowed host is dropped by the theme (so a typo cannot put a stranger's picture in
a guest's inbox).
