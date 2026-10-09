/**
 * Every vetted event asks the guest for an email or a social login before the photo is saved, so there is an address to send
 * the approval to (owner, 2026-10-06, camera#264). The page is added at read time, not stored: an event that already has its own
 * "who are you" page before the photo keeps it, any other vetted event gets this default one first. Nothing is backfilled into
 * the events' own pages, and switching vetting off removes it again.
 *
 * Pure, so it is unit-tested (identity-page.test.ts).
 */

import type { CustomPage } from '@/lib/db/schemas';
import { translate, type UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';

export const DEFAULT_IDENTITY_PAGE_ID = 'default-identity';

/** The texts of the default login page; an own login page whose text is empty falls back to the same words (camera#330, planning item 36). */
export function identityTexts(language: UiLanguage = 'en', texts?: TextOverrides | null) {
  const tr = (key: Parameters<typeof translate>[1]) => translate(language, key, undefined, texts);
  return {
    title: tr('login.title'),
    description: tr('login.description'),
    buttonText: tr('login.button'),
    ssoButtonText: tr('login.sso'),
    pseudoFormTitle: tr('login.form'),
    nameLabel: tr('login.nameLabel'),
    emailLabel: tr('login.emailLabel'),
    namePlaceholder: tr('login.namePlaceholder'),
    emailPlaceholder: tr('login.emailPlaceholder'),
  };
}

/** The English texts (the dictionary's), for code that has no language. */
export const DEFAULT_IDENTITY_TEXTS = identityTexts('en');

/** A text, or its default when it is empty. */
export function textOrDefault(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/**
 * Social login and the email form are each optional, but at least one stays on, because every event needs an email or a social login (#264):
 * with both switched off the default applies, both on. A page that sets neither keeps the older defaults (social login off, email form on).
 */
export function loginOptions(config: { enableSSOLogin?: boolean; enablePseudoReg?: boolean }): { sso: boolean; form: boolean } {
  const sso = config.enableSSOLogin ?? false;
  const form = config.enablePseudoReg ?? true;
  return sso || form ? { sso, form } : { sso: true, form: true };
}

/** The page a vetted event shows first when it has no "who are you" page of its own before the photo. */
export function defaultIdentityPage(order: number, now: string = new Date().toISOString(), language: UiLanguage = 'en', texts?: TextOverrides | null): CustomPage {
  const t = identityTexts(language, texts);
  return {
    pageId: DEFAULT_IDENTITY_PAGE_ID,
    pageType: 'who-are-you' as CustomPage['pageType'],
    order,
    isActive: true,
    config: {
      title: t.title,
      description: t.description,
      buttonText: t.buttonText,
      enableSSOLogin: true,
      enablePseudoReg: true,
      ssoButtonText: t.ssoButtonText,
      pseudoFormTitle: t.pseudoFormTitle,
      nameLabel: t.nameLabel,
      emailLabel: t.emailLabel,
      namePlaceholder: t.namePlaceholder,
      emailPlaceholder: t.emailPlaceholder,
    },
    createdAt: now,
    updatedAt: now,
  } as CustomPage;
}

/** True when an active "who are you" page comes before the photo (before the take-photo page, or anywhere if there is none). */
export function hasIdentityPageBeforePhoto(pages: readonly CustomPage[]): boolean {
  const active = [...pages].filter((page) => page.isActive).sort((a, b) => a.order - b.order);
  const photoIndex = active.findIndex((page) => page.pageType === 'take-photo');
  const before = photoIndex === -1 ? active : active.slice(0, photoIndex);
  return before.some((page) => page.pageType === 'who-are-you');
}

/** The event's pages as the guest sees them: with vetting required and no identity page before the photo, the default one is first. */
export function withRequiredIdentityPage(pages: readonly CustomPage[] | null | undefined, vettingRequired: boolean, now?: string, language: UiLanguage = 'en', texts?: TextOverrides | null): CustomPage[] {
  const own = [...(pages ?? [])];
  if (!vettingRequired || hasIdentityPageBeforePhoto(own)) return own;
  // The default login step goes right after the leading welcome step(s) (step 0 is the first thing a guest sees) and the consent page(s) that
  // follow them (consent comes before the login, camera#330), else first.
  const sorted = [...own].sort((a, b) => a.order - b.order);
  let leading = 0;
  while (sorted[leading]?.pageType === 'welcome') leading += 1;
  while (sorted[leading]?.pageType === 'accept') leading += 1;
  const order = leading > 0 ? sorted[leading - 1].order + 0.5 : (sorted.length > 0 ? sorted[0].order : 0) - 1;
  return [defaultIdentityPage(order, now, language, texts), ...own];
}
