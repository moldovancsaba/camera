/**
 * The journey of an event as a user goes through it (camera#378, camera#330, docs/BUILDING_BRICKS.md section 5): the event's own pages, the default
 * pages that are added when the page is read (consent, login), and the steps that are not pages (the camera and the one photo screen, the
 * waiting or share screen, the e-mails, the public photo page), in order. The pages come from the same function the user's page uses
 * (`withDefaultJourneyPages`, default-pages.ts), so the page editor and the user cannot disagree. Pure; unit-tested (journey.test.ts).
 */

import { CustomPageType, generateId, type CustomPage } from '@/lib/db/schemas';
import type { UiLanguage } from '@/lib/i18n';
import { DEFAULT_CONSENT_PAGE_ID, withDefaultJourneyPages } from './default-pages';
import { DEFAULT_IDENTITY_PAGE_ID } from './identity-page';

/** What the server knows that decides which default pages an event gets (`GET /api/events/<id>`, `journeyContext`). */
export interface JourneyContext {
  vettingRequired: boolean;
  /** True when the event gets the journey defaults: created with them, or the global switch is on (lib/admin/defaults-rollout.ts). */
  consentDefault: boolean;
  language: UiLanguage;
}

export type JourneyStepId = 'waiting' | 'share' | 'emails' | 'result';

export type JourneyRow =
  | { kind: 'own'; page: CustomPage }
  | { kind: 'default'; page: CustomPage; reason: string }
  | { kind: 'step'; id: JourneyStepId; title: string; description: string; editedIn: string };

const isDefaultPage = (page: CustomPage) => page.pageId === DEFAULT_CONSENT_PAGE_ID || page.pageId === DEFAULT_IDENTITY_PAGE_ID;

const REASON: Record<string, string> = {
  [DEFAULT_CONSENT_PAGE_ID]: 'Every user accepts the terms, the cookies and the privacy policy first. This page is used until you make your own consent page.',
  [DEFAULT_IDENTITY_PAGE_ID]: 'A photo that is checked before it is shown needs an e-mail or a social login. This page is used until you make your own login page.',
};

/**
 * The steps that follow the photo and are not pages. With photo approval on the user waits for the approval, and the approved photo comes by e-mail
 * with a link to the public photo page; without approval the user sees the share screen at once.
 */
function stepsAfterPhoto(context: JourneyContext): JourneyRow[] {
  if (context.vettingRequired) {
    return [
      { kind: 'step', id: 'waiting', title: 'Waiting for approval', description: 'After Continue saves the photo the user waits until it is approved. Built in.', editedIn: 'The take-photo page in this list (approval texts) and the Public result page section above.' },
      { kind: 'step', id: 'emails', title: 'E-mails', description: 'The user gets the saved e-mail, then the approved or not-approved e-mail with the link. Built in.', editedIn: 'The Email module section above.' },
      { kind: 'step', id: 'result', title: 'The public photo page', description: 'The page the e-mail links to: the photo and its download. Built in.', editedIn: 'The Public result page section above.' },
    ];
  }
  return [
    { kind: 'step', id: 'share', title: 'Share screen', description: 'After Continue saves the photo the user can copy the link and share it. Built in.', editedIn: 'The take-photo page in this list (share texts) and the Public result page section above.' },
    { kind: 'step', id: 'emails', title: 'E-mails', description: 'The user gets the saved e-mail when an address is known. Built in.', editedIn: 'The Email module section above.' },
    { kind: 'step', id: 'result', title: 'The public photo page', description: 'The page the e-mail links to: the photo and its download. Built in.', editedIn: 'The Public result page section above.' },
  ];
}

/**
 * The event's journey in order: its own pages and the default pages, and after the take-photo page the steps that are not pages. An own page that
 * is switched off stays in the list (the editor must be able to reach it; its `isActive` is false) but is not part of what the user goes through.
 * An event with no take-photo page has everything before the photo, as the user's page treats it.
 */
export function effectiveJourney(storedPages: readonly CustomPage[] | null | undefined, context: JourneyContext, now?: string): JourneyRow[] {
  const pages = withDefaultJourneyPages(storedPages, { vettingRequired: context.vettingRequired, consentDefault: context.consentDefault, now, language: context.language });
  const rows: JourneyRow[] = [...pages]
    .sort((a, b) => a.order - b.order)
    .map((page) => (isDefaultPage(page) ? { kind: 'default', page, reason: REASON[page.pageId] } : { kind: 'own', page }));
  const photoAt = rows.findIndex((row) => row.kind === 'own' && row.page.isActive && row.page.pageType === CustomPageType.TAKE_PHOTO);
  const steps = stepsAfterPhoto(context);
  if (photoAt === -1) return [...rows, ...steps];
  return [...rows.slice(0, photoAt + 1), ...steps, ...rows.slice(photoAt + 1)];
}

/**
 * "Customise" on a default row: the event's own page, filled with the default's texts, in the default's place. The own page wins over the default
 * (it is a consent or login page before the photo), so the user's journey does not change by it. Deleting the own page brings the default back.
 */
export function customiseDefault(page: CustomPage, makeId: () => string = generateId, now: string = new Date().toISOString()): CustomPage {
  return { ...page, pageId: makeId(), config: structuredClone(page.config), createdAt: now, updatedAt: now };
}
