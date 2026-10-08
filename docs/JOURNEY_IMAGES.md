# Pictures of the guest journey: the CTA page picture and the email footer

Two more places where a club's own design can be used without anyone laying it out by hand (camera#310). Both come from the designers as text-free
pictures; camera writes the words.

## CTA page with a picture

A CTA page (`cta`) can carry `backgroundImageUrl`. The page then fills the screen with the picture (scaled to cover, centred, in any
orientation), puts a soft dark veil over it, and writes the page's own title (big, uppercase), its text (italic) and its buttons over it in
white: a round visit button (`visitButtonText`, opens the page's address) and a quieter outline button for the next step (`buttonText`). The
buttons use the club's colours (`buttonColor`, `buttonTextColor`, `buttonBorderColor`, hex). Without a picture the page is the plain card it
always was. Set in the admin pages editor of the event (CTA page, "Picture page") with the picture picker: chosen from the event's images library
(its partner's library and its own uploads, `docs/LIBRARIES.md`), uploaded there (PNG, JPEG, WebP or SVG, up to 4 MB), or pasted as an address; the
page keeps the plain address either way. Settings of the page: `lib/db/schemas.ts` (`CustomPage.config`), component `components/capture/CTAPage.tsx`,
the round buttons `components/capture/PillButton.tsx` (shared with the welcome step).

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
