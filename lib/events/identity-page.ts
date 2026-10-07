/**
 * Every vetted event asks the guest for an email or a social login before the photo is saved, so there is an address to send
 * the approval to (owner, 2026-10-06, camera#264). The page is added at read time, not stored: an event that already has its own
 * "who are you" page before the photo keeps it, any other vetted event gets this default one first. Nothing is backfilled into
 * the events' own pages, and switching vetting off removes it again.
 *
 * Pure, so it is unit-tested (identity-page.test.ts).
 */

import type { CustomPage } from '@/lib/db/schemas';

export const DEFAULT_IDENTITY_PAGE_ID = 'default-identity';

/** The page a vetted event shows first when it has no "who are you" page of its own before the photo. */
export function defaultIdentityPage(order: number, now: string = new Date().toISOString()): CustomPage {
  return {
    pageId: DEFAULT_IDENTITY_PAGE_ID,
    pageType: 'who-are-you' as CustomPage['pageType'],
    order,
    isActive: true,
    config: {
      title: 'Who are you?',
      description: 'Log in or tell us your email: we will send you the link to your photo as soon as it has been approved.',
      buttonText: 'Continue',
      enableSSOLogin: true,
      enablePseudoReg: true,
      ssoButtonText: 'Log in with',
      pseudoFormTitle: 'Or use your email',
      nameLabel: 'Your name',
      emailLabel: 'Your email',
      namePlaceholder: 'Your name',
      emailPlaceholder: 'you@example.com',
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
export function withRequiredIdentityPage(pages: readonly CustomPage[] | null | undefined, vettingRequired: boolean, now?: string): CustomPage[] {
  const own = [...(pages ?? [])];
  if (!vettingRequired || hasIdentityPageBeforePhoto(own)) return own;
  // The default login step goes right after the leading welcome step(s) (step 0 is the first thing a guest sees), else first.
  const sorted = [...own].sort((a, b) => a.order - b.order);
  let leading = 0;
  while (sorted[leading]?.pageType === 'welcome') leading += 1;
  const order = leading > 0 ? sorted[leading - 1].order + 0.5 : (sorted.length > 0 ? sorted[0].order : 0) - 1;
  return [defaultIdentityPage(order, now), ...own];
}
