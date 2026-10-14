/**
 * The pages of the user journey split by where they are in the flow (issue 535): before the photo (onboarding), after the confirmed upload (presubmit), and after an explicit Submit marker
 * (thank you). The photo is saved when the user confirms the reframe. Every configured page after the camera and before Submit is shown after that upload; without a Submit marker, all pages after
 * the camera run after upload. A submit page that is not active, or before the take-photo page, does not count. Pure; unit-tested (split-pages.test.ts).
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
    return { onboardingPages, presubmitPages: after.filter((page) => page.pageType !== 'submit'), thankYouPages: [], takePhotoPage, submitSeparate: false };
  }
  return {
    onboardingPages,
    presubmitPages: after.slice(0, submitIndex).filter((page) => page.pageType !== 'submit'),
    thankYouPages: after.slice(submitIndex + 1).filter((page) => page.pageType !== 'submit'),
    takePhotoPage,
    submitSeparate: true,
  };
}
