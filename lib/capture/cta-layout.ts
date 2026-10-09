/**
 * What a CTA page with a picture shows and what a tap does (camera#491, owner report 209): the picture fits the page, the title, the text and the
 * buttons can be hidden, and the whole picture can be a link to the page's address. Pure, so it is unit-tested.
 *
 * Buttons only go when something else leads on: the picture is the link, or the page is the last one (no continue button), so a page can never be a dead end by
 * accident. On a page that is not the last, a tap on a picture whose buttons are hidden opens the address in a new tab and goes on to the next page (there is no
 * continue button to press); on the last page it goes to the address in the same tab.
 */

export interface CtaLayoutConfig {
  /** The address to visit (the page's `checkboxText`). */
  url: string;
  /** Show the continue button (false: this is the last page). */
  hasButton: boolean;
  hideTexts?: boolean;
  hideButtons?: boolean;
  pictureLink?: boolean;
}

export type CtaPictureTap = 'visit' | 'visit-and-continue';

export interface CtaLayout {
  showTexts: boolean;
  showVisitButton: boolean;
  showContinueButton: boolean;
  /** The whole picture is a link. */
  pictureLink: boolean;
  pictureTap: CtaPictureTap;
}

export function ctaLayout(config: CtaLayoutConfig): CtaLayout {
  const pictureLink = config.pictureLink === true && config.url.trim() !== '';
  const hideButtons = config.hideButtons === true && (pictureLink || !config.hasButton);
  return {
    showTexts: config.hideTexts !== true,
    showVisitButton: config.url.trim() !== '' && !hideButtons,
    showContinueButton: config.hasButton && !hideButtons,
    pictureLink,
    pictureTap: hideButtons && config.hasButton ? 'visit-and-continue' : 'visit',
  };
}
