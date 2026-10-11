/**
 * The server's check that a required consent is there when a photo is saved (issue 558, owner answer 297: "the page is never the only guard").
 *
 * What the server refuses is what an editor **chose** to require (a checkbox marked required on an own consent page, a document, the acceptance sentence or the gallery permission set to
 * required at the event or the partner: `EffectiveCheckbox.checked`, lib/events/checkbox-settings.ts). The standard requirement (a default checkbox that is required because it always was) stays
 * enforced by the page only, exactly as before (planning item 43), so a live event changes only when somebody chooses; `ENFORCE_STANDARD_REQUIREMENTS` is the one switch that would make the server refuse
 * those too (off until the owner decides, after the match of 2026-10-16).
 *
 * How it is checked. The journey the user got is rebuilt from the event with the same functions the user's page uses (`withDefaultJourneyPages`, `acceptanceOnLogin`, `splitCustomPages`), so the
 * server and the page cannot disagree about which consent pages come before the save. For every consent page before the save the request must carry as many **accepted** records for that page
 * as the page has required checkboxes (or, when the page is shown as the one acceptance sentence on the Who-are-you page and that sentence is required, as many as the page has shown checkboxes: one tick
 * records them all). The count, not the text, is compared, so an editor who corrects a word while a user is on the page does not make that user's save fail. Pure; unit-tested (consent-guard.test.ts).
 */

import type { CustomPage } from '@/lib/db/schemas';
import { acceptanceOnLogin } from './acceptance';
import { chosenDocuments, effectiveCheckboxes, type CheckboxSettingsHolder } from './checkbox-settings';
import { consentCheckboxes, consentPageIsEmpty, shownCheckboxes } from './consent';
import { withDefaultJourneyPages } from './default-pages';
import { galleryTicked } from './gallery-consent';
import { splitCustomPages } from '@/lib/capture/split-pages';

/** Off: the standard requirements are checked by the page only, as before. Turning it on would make the server refuse a save that lacks any required consent, standard or chosen. */
export const ENFORCE_STANDARD_REQUIREMENTS = false;

export const CONSENT_MISSING_MESSAGE = 'A required consent is missing';
export const GALLERY_MISSING_MESSAGE = 'The permission to show the photo in the public gallery is required';

export interface GuardEvent extends CheckboxSettingsHolder {
  customPages?: unknown;
  photoVetting?: { required?: unknown };
  defaultPageOrders?: unknown;
}

/** What the request carries that the guard looks at. */
export interface GuardRequest {
  /** The records as the request sent them: anything can be in it, so each is looked at defensively. */
  consents: ReadonlyArray<unknown>;
  shareOptIn?: unknown;
  publicGalleryConsentVersion?: unknown;
}

const hasOwnRequirement = (pages: unknown): boolean =>
  Array.isArray(pages) &&
  pages.some((page) => page && typeof page === 'object' && (page as CustomPage).pageType === 'accept' && (page as CustomPage).isActive !== false && consentCheckboxes((page as CustomPage).config ?? {}).some((item) => item.required === true));

/**
 * True when anything in this event can make the server refuse a save. When it is false the guard has nothing to do and the route need not read anything more (the global rollout switch, which decides
 * whether the default consent page exists, is read only when this is true).
 */
export function mayRefuse(event: GuardEvent | null | undefined, partner?: CheckboxSettingsHolder | null, enforceStandard: boolean = ENFORCE_STANDARD_REQUIREMENTS): boolean {
  if (enforceStandard) return true;
  const effective = effectiveCheckboxes(event, partner);
  return effective.gallery.checked || effective.acceptance.checked || effective.terms.checked || effective.cookies.checked || effective.privacy.checked || hasOwnRequirement(event?.customPages);
}

/**
 * The reason a save must be refused, or null. `consentDefault` is whether the event gets the journey defaults (lib/admin/defaults-rollout.ts `eventGetsDefaults`), which decides whether the default consent
 * page exists. `vetted` only places the default login page, which does not matter here.
 */
export function missingRequiredConsent(
  event: GuardEvent | null | undefined,
  partner: CheckboxSettingsHolder | null | undefined,
  request: GuardRequest,
  context: { consentDefault: boolean; vettingRequired: boolean },
  enforceStandard: boolean = ENFORCE_STANDARD_REQUIREMENTS,
): string | null {
  const effective = effectiveCheckboxes(event, partner);
  // The gallery permission is optional by default; it is required only when an editor chose so, which is always checked.
  if (effective.gallery.checked && !galleryTicked(request)) return GALLERY_MISSING_MESSAGE;

  const stored = (Array.isArray(event?.customPages) ? (event?.customPages as CustomPage[]) : []).filter((page) => page && typeof page === 'object');
  const pages = withDefaultJourneyPages(stored, {
    vettingRequired: context.vettingRequired,
    consentDefault: context.consentDefault,
    language: 'en',
    documents: chosenDocuments(effective),
    defaultOrders: event?.defaultPageOrders as Record<string, number> | null | undefined,
  }).filter((page) => page.isActive);
  const { pages: journeyPages, acceptPage } = acceptanceOnLogin(pages, effective.acceptance.shown);
  const { onboardingPages, presubmitPages } = splitCustomPages(journeyPages);

  const accepted = request.consents.filter((record): record is { pageId?: unknown; accepted: true } => !!record && typeof record === 'object' && (record as { accepted?: unknown }).accepted === true);
  // The page shown as the one sentence on the Who-are-you page left the list of steps, but it is still a consent page before the save.
  for (const page of [...onboardingPages, ...presubmitPages, ...(acceptPage ? [acceptPage] : [])]) {
    if (page.pageType !== 'accept' || consentPageIsEmpty(page.config ?? {})) continue;
    const items = shownCheckboxes(consentCheckboxes(page.config ?? {}));
    const merged = acceptPage !== null && page.pageId === acceptPage.pageId;
    const required = merged
      ? effective.acceptance.checked || (enforceStandard && effective.acceptance.required)
        ? items.length
        : 0
      : items.filter((item) => (enforceStandard ? item.required !== false : item.required === true)).length;
    if (required > 0 && accepted.filter((record) => record.pageId === page.pageId).length < required) return CONSENT_MISSING_MESSAGE;
  }
  return null;
}
