/**
 * The default consent page and the default order of the user flow (camera#330, docs/WELCOME_AND_DEFAULTS_PLAN.md items 38 to 48): welcome page,
 * consent page, login page, selfie taking, the rest. Like the default login page (identity-page.ts) the default consent page is added at read
 * time, not stored: an event that has its own consent page before the photo keeps it, and nothing is backfilled into the events' own pages.
 * It is added to an event only when the event gets the journey defaults (lib/admin/defaults-rollout.ts). Pure; unit-tested (default-pages.test.ts).
 */

import type { CustomPage } from '@/lib/db/schemas';
import type { ConsentCheckbox } from './consent';
import { DEFAULT_IDENTITY_PAGE_ID, withRequiredIdentityPage } from './identity-page';
import { translate, type UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';

export const DEFAULT_CONSENT_PAGE_ID = 'default-consent';
export const DEFAULT_WELCOME_PAGE_ID = 'default-welcome';

/**
 * The three legal pages every user accepts (owner, 2026-10-07): all required, in the language of the event (camera#352); the links go to the legal
 * pages of the service in that language (they exist in English and Hungarian).
 */
export function defaultConsentCheckboxes(language: UiLanguage = 'en', texts?: TextOverrides | null): readonly ConsentCheckbox[] {
  return [
    { text: translate(language, 'consent.terms', undefined, texts), linkUrl: `https://seyuselfies.com/${language}/legal/terms` },
    { text: translate(language, 'consent.cookies', undefined, texts), linkUrl: `https://seyuselfies.com/${language}/legal/cookies` },
    { text: translate(language, 'consent.privacy', undefined, texts), linkUrl: `https://seyuselfies.com/${language}/policies` },
  ];
}

/** The English default checkboxes, for code that has no language. */
export const DEFAULT_CONSENT_CHECKBOXES: readonly ConsentCheckbox[] = defaultConsentCheckboxes('en');

export function defaultConsentPage(order: number, now: string = new Date().toISOString(), language: UiLanguage = 'en', texts?: TextOverrides | null): CustomPage {
  return {
    pageId: DEFAULT_CONSENT_PAGE_ID,
    pageType: 'accept' as CustomPage['pageType'],
    order,
    isActive: true,
    config: {
      title: translate(language, 'consent.title', undefined, texts),
      description: translate(language, 'consent.description', undefined, texts),
      buttonText: translate(language, 'consent.button', undefined, texts),
      checkboxText: '',
      checkboxes: defaultConsentCheckboxes(language, texts).map((checkbox) => ({ ...checkbox })),
    },
    createdAt: now,
    updatedAt: now,
  } as CustomPage;
}

/**
 * The default welcome page (issue 327, docs/BUILDING_BRICKS.md 6.2): step 0 with the giant screen and the Start button. It carries no picture of its own: the capture page shows the picture
 * drawn from the event's default slideshow (`Event.welcomeScreen`) on every welcome page that has none, so the page follows it and an own picture on a page always wins.
 */
export function defaultWelcomePage(order: number, now: string = new Date().toISOString(), language: UiLanguage = 'en', texts?: TextOverrides | null): CustomPage {
  return {
    pageId: DEFAULT_WELCOME_PAGE_ID,
    pageType: 'welcome' as CustomPage['pageType'],
    order,
    isActive: true,
    config: {
      title: translate(language, 'welcome.title', undefined, texts),
      buttonText: translate(language, 'welcome.button', undefined, texts),
      screenImageAlt: translate(language, 'welcome.screenAlt', undefined, texts),
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
  options: { vettingRequired: boolean; consentDefault: boolean; now?: string; language?: UiLanguage; hasWelcomeScreen?: boolean; texts?: TextOverrides | null; defaultOrders?: Record<string, number> | null },
): CustomPage[] {
  const stored = [...(pages ?? [])];
  // The default welcome page: only for an event that gets the journey defaults, has the picture drawn from its default slideshow and has no welcome page of its own (a switched off one
  // counts: the editor chose). It goes first, so the consent page follows it.
  const withWelcome =
    options.consentDefault && options.hasWelcomeScreen && !stored.some((page) => page.pageType === 'welcome')
      ? [defaultWelcomePage((stored.length > 0 ? Math.min(...stored.map((page) => page.order)) : 0) - 3, options.now, options.language, options.texts), ...stored]
      : stored;
  const own = withWelcome;
  let withConsent = own;
  if (options.consentDefault && !hasConsentPageBeforePhoto(own)) {
    const sorted = [...own].sort((a, b) => a.order - b.order);
    let leading = 0;
    while (sorted[leading]?.pageType === 'welcome') leading += 1;
    const order = leading > 0 ? sorted[leading - 1].order + 0.25 : (sorted.length > 0 ? sorted[0].order : 0) - 2;
    withConsent = [defaultConsentPage(order, options.now, options.language, options.texts), ...own];
  }
  return withDefaultOrders(withRequiredIdentityPage(withConsent, options.vettingRequired, options.now, options.language, options.texts), options.defaultOrders);
}

const DEFAULT_PAGE_IDS: readonly string[] = [DEFAULT_WELCOME_PAGE_ID, DEFAULT_CONSENT_PAGE_ID, DEFAULT_IDENTITY_PAGE_ID];

/** The default pages of an event whose editor moved them (`Event.defaultPageOrders`, issue 535): each default page that has a saved place takes it; nothing else changes. */
function withDefaultOrders(pages: CustomPage[], orders: Record<string, number> | null | undefined): CustomPage[] {
  if (!orders) return pages;
  return pages.map((page) => (DEFAULT_PAGE_IDS.includes(page.pageId) && Number.isFinite(orders[page.pageId]) ? { ...page, order: orders[page.pageId] } : page));
}

/** What a request may save as `Event.defaultPageOrders`: only the known default pages, with finite numbers. A value that is not an object is refused (null); an empty object clears the places. */
export function sanitizeDefaultPageOrders(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const clean: Record<string, number> = {};
  for (const [key, order] of Object.entries(value as Record<string, unknown>)) {
    if (!DEFAULT_PAGE_IDS.includes(key) || typeof order !== 'number' || !Number.isFinite(order) || Math.abs(order) > 10_000) return null;
    clean[key] = order;
  }
  return clean;
}
