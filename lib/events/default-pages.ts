/**
 * The default consent page and the default order of the user flow (camera#330, docs/WELCOME_AND_DEFAULTS_PLAN.md items 38 to 48): welcome page,
 * consent page, login page, selfie taking, the rest. Like the default login page (identity-page.ts) the default consent page is added at read
 * time, not stored: an event that has its own consent page before the photo keeps it, and nothing is backfilled into the events' own pages.
 * It is added to an event only when the event gets the journey defaults (lib/admin/defaults-rollout.ts). Pure; unit-tested (default-pages.test.ts).
 */

import type { CustomPage } from '@/lib/db/schemas';
import type { ConsentCheckbox } from './consent';
import { withRequiredIdentityPage } from './identity-page';

export const DEFAULT_CONSENT_PAGE_ID = 'default-consent';

/** The three legal pages every user accepts (owner, 2026-10-07): all required, English by default, another language typed per event. */
export const DEFAULT_CONSENT_CHECKBOXES: readonly ConsentCheckbox[] = [
  { text: 'I accept the Terms and conditions', linkUrl: 'https://seyuselfies.com/en/legal/terms' },
  { text: 'I accept cookies', linkUrl: 'https://seyuselfies.com/en/legal/cookies' },
  { text: 'I have read the Privacy policy', linkUrl: 'https://seyuselfies.com/en/policies' },
];

export function defaultConsentPage(order: number, now: string = new Date().toISOString()): CustomPage {
  return {
    pageId: DEFAULT_CONSENT_PAGE_ID,
    pageType: 'accept' as CustomPage['pageType'],
    order,
    isActive: true,
    config: {
      title: 'Before we start',
      description: 'Please accept all of the following to continue.',
      buttonText: 'Continue',
      checkboxText: '',
      checkboxes: DEFAULT_CONSENT_CHECKBOXES.map((checkbox) => ({ ...checkbox })),
    },
    createdAt: now,
    updatedAt: now,
  } as CustomPage;
}

/** True when an active consent ("accept") page comes before the photo (before the take-photo page, or anywhere if there is none). */
export function hasConsentPageBeforePhoto(pages: readonly CustomPage[]): boolean {
  const active = [...pages].filter((page) => page.isActive).sort((a, b) => a.order - b.order);
  const photoIndex = active.findIndex((page) => page.pageType === 'take-photo');
  return (photoIndex === -1 ? active : active.slice(0, photoIndex)).some((page) => page.pageType === 'accept');
}

/**
 * The event's pages as the user sees them: the default consent page right after the leading welcome page(s) when the event gets the defaults and has
 * no consent page before the photo, then the default login page after it (identity-page.ts) when the event requires vetting and has none.
 */
export function withDefaultJourneyPages(
  pages: readonly CustomPage[] | null | undefined,
  options: { vettingRequired: boolean; consentDefault: boolean; now?: string },
): CustomPage[] {
  const own = [...(pages ?? [])];
  let withConsent = own;
  if (options.consentDefault && !hasConsentPageBeforePhoto(own)) {
    const sorted = [...own].sort((a, b) => a.order - b.order);
    let leading = 0;
    while (sorted[leading]?.pageType === 'welcome') leading += 1;
    const order = leading > 0 ? sorted[leading - 1].order + 0.25 : (sorted.length > 0 ? sorted[0].order : 0) - 2;
    withConsent = [defaultConsentPage(order, options.now), ...own];
  }
  return withRequiredIdentityPage(withConsent, options.vettingRequired, options.now);
}
