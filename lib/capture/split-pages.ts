/**
 * The pages of the user journey split by where they are in the flow (issue 535): before the photo (onboarding), between taking the photo and saving it (presubmit), and after it
 * (thank you). The photo is taken on the take-photo page; by default saving it is part of that page (Continue on the reframe screen saves). An event whose editor unticked "Submit is part
 * of this page" has a `submit` page after the take-photo page: the pages between the two run after the photo is taken and before it is saved (a login, a CTA), the pages after the
 * submit page run after the save as before. Without a Submit page, a Who-are-you page after the camera still runs before save so same-tab SSO can resume the uploaded photo draft. A submit page
 * that is not active, or before the take-photo page, does not count. The frame/message selector can also be placed after capture: before Submit it is followed by a final reframe with the chosen design; after saving it sets the next photo's choices. Pure; unit-tested (split-pages.test.ts).
 */

import type { CustomPage } from '@/lib/db/schemas';

export interface SplitPages {
  onboardingPages: CustomPage[];
  presubmitPages: CustomPage[];
  thankYouPages: CustomPage[];
  takePhotoPage: CustomPage | undefined;
  /** True when saving happens after a page between the camera and the usual save point. */
  submitSeparate: boolean;
}

export function splitCustomPages(pages: readonly CustomPage[]): SplitPages {
  const sorted = [...pages].sort((a, b) => a.order - b.order);
  const takePhotoIndex = sorted.findIndex((page) => page.pageType === 'take-photo');
  if (takePhotoIndex === -1) {
    // Without a take-photo page everything is before the photo, as it always was; a submit page means nothing there.
    return { onboardingPages: sorted.filter((page) => page.pageType !== 'submit'), presubmitPages: [], thankYouPages: [], takePhotoPage: undefined, submitSeparate: false };
  }
  const takePhotoPage = sorted[takePhotoIndex];
  const onboardingPages = sorted.slice(0, takePhotoIndex).filter((page) => page.pageType !== 'take-photo' && page.pageType !== 'submit');
  const after = sorted.slice(takePhotoIndex + 1).filter((page) => page.pageType !== 'take-photo');
  const submitIndex = after.findIndex((page) => page.pageType === 'submit' && page.isActive);
  if (submitIndex === -1) {
    // Keep a login after the camera before saving, whether or not consent was merged into that page.
    const whoAreYouIndex = after.findIndex((page) => page.pageType === 'who-are-you' && page.isActive);
    if (whoAreYouIndex >= 0) {
      return {
        onboardingPages,
        presubmitPages: after.slice(0, whoAreYouIndex + 1),
        thankYouPages: after.slice(whoAreYouIndex + 1),
        takePhotoPage,
        submitSeparate: true,
      };
    }
    return { onboardingPages, presubmitPages: [], thankYouPages: after.filter((page) => page.pageType !== 'submit'), takePhotoPage, submitSeparate: false };
  }
  return {
    onboardingPages,
    presubmitPages: after.slice(0, submitIndex).filter((page) => page.pageType !== 'submit'),
    thankYouPages: after.slice(submitIndex + 1).filter((page) => page.pageType !== 'submit'),
    takePhotoPage,
    submitSeparate: true,
  };
}
