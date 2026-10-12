/**
 * The layout of the preview step (the photo and the card beside it: waiting for approval, the share page, the saved page), issues 222 and 619.
 *
 * Phones and tablets keep exactly the classes they always had (the first part of each string). Only a large landscape window (`min-[1280px]:landscape:`,
 * a desktop or a laptop; the widest tablets, iPad Pro 12.9 and 13 inch held sideways, are 1366 px or more) gets the rest (owner feedback 2026-10-12, a
 * 2000 px window: the photo was 650 px wide in a huge empty page, because the row was capped at 896 px and the card had a fixed 22 rem):
 *  - the row is no longer capped and its content is centred as one group;
 *  - the photo's box takes the shape of the photo (`--preview-aspect`, width over height) at the full height of the row, so the photo is as large as the
 *    window's height allows and, when the width is the limit, as wide as the card leaves, and the card stays next to it instead of far at the edge;
 *  - the card grows with the window (26 rem at 1280 px, 24 vw above, at most 36 rem), so its text stays readable and the four share buttons fit.
 *
 * `preview-layout.test.ts` holds the phone and tablet classes fixed and requires every other class to carry the large-window prefix.
 */

/** The row holding the photo and the card. */
export const PREVIEW_ROW_CLASS =
  'mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col items-center gap-3 landscape:flex-row landscape:gap-4 min-[1280px]:landscape:max-w-none min-[1280px]:landscape:justify-center min-[1280px]:landscape:gap-8';

/** The box of the photo: it takes the space the actions leave and is never scrolled past (camera#222). */
export const PREVIEW_PICTURE_CLASS =
  'relative min-h-[20dvh] w-full flex-1 landscape:h-full landscape:min-h-0 landscape:min-w-0 min-[1280px]:landscape:w-auto min-[1280px]:landscape:flex-initial min-[1280px]:landscape:aspect-(--preview-aspect)';

/**
 * The actions beside or below the preview image. The options scroll inside the panel; the buttons stay
 * pinned, so a tall try-on selector never pushes them off screen (camera#222).
 */
export const PREVIEW_PANEL_CLASS =
  'flex w-full max-w-md min-h-0 shrink flex-col gap-2 overflow-y-auto px-3 [&>:first-child]:my-auto landscape:h-full landscape:w-[22rem] landscape:max-w-[45%] landscape:shrink-0 min-[1280px]:landscape:w-[clamp(26rem,24vw,36rem)]';
