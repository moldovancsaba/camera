# Messages in the capture flow (owner feedback 2026-10-09, MTK x Vasas)

On the real MTK x Vasas event the owner sent two phone screenshots: "Fotó mentése..." (saving) drawn straight over the photo, and a pop-up repeating the words of the card under it while the page behind had turned dark teal instead of the event's blue. His words: messages overlap each other, there are too many types and styles of messages, and the colours show the theme from messmass was not imported properly.

## What was wrong (read from the code and the real event)

- **The theme was imported correctly.** The real event gives page `#00b5e4`, cards `#f3f4f6`, text `#004c87` (`loadEventTheme`, read-only check against the real data). The dark teal was **not** a theme colour: the share and waiting card was drawn with a **black 55 % blurred veil over the whole page** (`bg-black/55 backdrop-blur-sm` in `ShareOverlay`), a leftover of a dark design.
- **The saving text had no surface at all** (the styles of its box had been stripped when the colours were taken out of the classes), so it was a line of text on top of the picture.
- **The same words twice:** the standard "saved" notice (`approval.saved`) was shown as a pop-up while the card under it said the same (`approval.title` and `approval.waiting`), and the pop-up ran into the card.
- **The pop-ups were outside the theme** (Mantine draws them at the root of the page, outside the themed wrapper): a white box with its own fonts and corners.
- Other messages were unthemed too: the sign-in error box (no background) and the try-on status alert (Mantine's blue and yellow).

## The rule now (three kinds, one look)

1. **A message that stays on the screen is a card of the event** (card colours, text, corners, font): the waiting and share cards, an error box. Never text straight on the photo.
2. **A short confirmation or error is one notice** (`notifyCapture`, `components/capture/notify.ts`), drawn in the same card style (`EVENT_THEME_CSS` also styles `.mantine-Notification-root`; `EventThemeScope` sets the theme's variables on the document because Mantine draws the notice at the root). Only one is shown at a time, at the top.
3. **Work in progress is one card over one veil** (`components/capture/ProcessingOverlay.tsx`): a spinner and what is happening on a card in the middle, over a veil in the **page colour of the event** at 80 %. Nothing shows through the card.
4. **Never the same words twice.** The waiting card is the confirmation of a photo that waits, so the standard saved message is not also shown as a notice; a saved message an editor wrote themselves is still shown (their own choice; the editor field says to leave it empty).
5. **No black veil, ever.** A veil is `color-mix(in srgb, var(--event-bg) 80%, transparent)`. `components/capture/no-black-veil.test.ts` fails when a capture file uses `bg-black` (or a dark slate, gray or neutral background).

## Layout of the photo step

The waiting and share cards sit **beside the photo** (landscape) or **under it** (portrait), as cards, and scroll inside their own panel when a short screen cannot show all of them (`PREVIEW_PANEL_CLASS`, centred safely so the top of a tall card is never cut off). Checked in a production build with the real colours of the MTK event at 932 x 430, 844 x 390 and 390 x 844: the photo and the card do not overlap, the page colour is the event's, and the whole card is inside the screen. **Not confirmed on a phone** until the owner's phone shows it (CLAUDE.md section 7).
