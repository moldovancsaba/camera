/**
 * The default consent page and the default order of the user flow (camera#330, docs/WELCOME_AND_DEFAULTS_PLAN.md items 38 to 48): welcome page,
 * consent page, login page, selfie taking, the rest. Like the default login page (identity-page.ts) the default consent page is added at read
 * time, not stored: an event's active custom consent page is reused in the pre-save slot, so editing it never creates a second consent step.
 * It is added to an event only when the event gets the journey defaults (lib/admin/defaults-rollout.ts). Pure; unit-tested (default-pages.test.ts).
 */

import type { CustomPage } from '@/lib/db/schemas';
import type { ConsentCheckbox } from './consent';
import { DOCUMENT_KINDS, type DocumentSettings } from './checkbox-settings';
import { pagesBeforeSave } from './photo-boundary';
import { DEFAULT_IDENTITY_PAGE_ID, withRequiredIdentityPage } from './identity-page';
import { translate, type UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';

export const DEFAULT_CONSENT_PAGE_ID = 'default-consent';
export const DEFAULT_WELCOME_PAGE_ID = 'default-welcome';

/** The consent and identity page each have one role in the journey. Older saves could persist a generated default and a customised copy side by side; prefer the active custom page and discard the stale duplicate. */
export function dedupeActiveRolePages(pages: readonly CustomPage[]): CustomPage[] {
  const roleDefaults: Partial<Record<CustomPage['pageType'], string>> = {
    accept: DEFAULT_CONSENT_PAGE_ID,
    'who-are-you': DEFAULT_IDENTITY_PAGE_ID,
  };
  let result = [...pages];
  for (const [pageType, defaultId] of Object.entries(roleDefaults)) {
    const active = result
      .filter((page) => page.isActive && page.pageType === pageType)
      .sort((a, b) => a.order - b.order);
    if (active.length < 2) continue;
    const keeper = active.find((page) => page.pageId !== defaultId) ?? active[0];
    result = result.filter((page) => !active.some((duplicate) => duplicate !== keeper && duplicate.pageId === page.pageId));
  }
  return result;
}

/**
 * The three legal pages every user accepts (owner, 2026-10-07): all required, in the language of the event (camera#352); the links go to the legal
 * pages of the service in that language (they exist in English and Hungarian).
 *
 * `documents` are the settings of the three checkboxes for this event (issue 558, lib/events/checkbox-settings.ts): a document that is switched off is left out; an optional one carries
 * `required: false`; one an editor chose to require carries `required: true` (the server then checks it too). Without `documents`, or with the standard, the list is exactly what it always was.
 */
export function defaultConsentCheckboxes(language: UiLanguage = 'en', texts?: TextOverrides | null, documents?: DocumentSettings): readonly ConsentCheckbox[] {
  const all: Array<ConsentCheckbox & { kind: (typeof DOCUMENT_KINDS)[number] }> = [
    { kind: 'terms', text: translate(language, 'consent.terms', undefined, texts), linkUrl: `https://seyuselfies.com/${language}/legal/terms` },
    { kind: 'cookies', text: translate(language, 'consent.cookies', undefined, texts), linkUrl: `https://seyuselfies.com/${language}/legal/cookies` },
    { kind: 'privacy', text: translate(language, 'consent.privacy', undefined, texts), linkUrl: `https://seyuselfies.com/${language}/policies` },
  ];
  return all
    .filter((item) => documents?.[item.kind].shown !== false)
    .map(({ kind, ...item }) => {
      const setting = documents?.[kind];
      if (!setting) return item;
      return setting.checked ? { ...item, required: true } : setting.required ? item : { ...item, required: false };
    });
}

/** The English default checkboxes, for code that has no language. */
export const DEFAULT_CONSENT_CHECKBOXES: readonly ConsentCheckbox[] = defaultConsentCheckboxes('en');

export function defaultConsentPage(order: number, now: string = new Date().toISOString(), language: UiLanguage = 'en', texts?: TextOverrides | null, documents?: DocumentSettings): CustomPage {
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
      checkboxes: defaultConsentCheckboxes(language, texts, documents).map((checkbox) => ({ ...checkbox })),
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

/** True when an active consent ("accept") page comes before the photo is saved (before the take-photo page, or before the submit page when the event has one, or anywhere if there is no take-photo page). */
export function hasConsentPageBeforePhoto(pages: readonly CustomPage[]): boolean {
  return pagesBeforeSave(pages).some((page) => page.pageType === 'accept');
}

/**
 * The event's pages as the user sees them: the default consent page right after the leading welcome page(s) when the event gets the defaults and has
 * no active custom consent page, then the default login page after it (identity-page.ts) when the event requires vetting and has none.
 */
export function withDefaultJourneyPages(
  pages: readonly CustomPage[] | null | undefined,
  options: { vettingRequired: boolean; consentDefault: boolean; now?: string; language?: UiLanguage; hasWelcomeScreen?: boolean; texts?: TextOverrides | null; defaultOrders?: Record<string, number> | null; documents?: DocumentSettings },
): CustomPage[] {
  const stored = dedupeActiveRolePages(pages ?? []);
  // The default welcome page: only for an event that gets the journey defaults, has the picture drawn from its default slideshow and has no welcome page of its own (a switched off one
  // counts: the editor chose). It goes first, so the consent page follows it.
  const withWelcome =
    options.consentDefault && options.hasWelcomeScreen && !stored.some((page) => page.pageType === 'welcome')
      ? [defaultWelcomePage((stored.length > 0 ? Math.min(...stored.map((page) => page.order)) : 0) - 3, options.now, options.language, options.texts), ...stored]
      : stored;
  const own = withWelcome;
  let withConsent = own;
  // With every one of the three documents switched off (issue 558) there is nothing to accept and the default page is not added.
  if (options.consentDefault && !hasConsentPageBeforePhoto(own) && (!options.documents || DOCUMENT_KINDS.some((kind) => options.documents?.[kind].shown !== false))) {
    const sorted = [...own].sort((a, b) => a.order - b.order);
    let leading = 0;
    while (sorted[leading]?.pageType === 'welcome') leading += 1;
    const order = leading > 0 ? sorted[leading - 1].order + 0.25 : (sorted.length > 0 ? sorted[0].order : 0) - 2;
    // Reuse a custom consent page that was saved after photo-taking. Otherwise the generated default and the custom page appear as two consent steps.
    const existingConsent = own.find((page) => page.isActive && page.pageType === 'accept');
    withConsent = existingConsent
      ? own.map((page) => page.pageId === existingConsent.pageId ? { ...page, order } : page)
      : [defaultConsentPage(order, options.now, options.language, options.texts, options.documents), ...own];
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
