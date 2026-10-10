/**
 * The journey of an event as a user goes through it (camera#378, camera#330, docs/BUILDING_BRICKS.md section 5): the event's own pages, the default
 * pages that are added when the page is read (consent, login), and the steps that are not pages (the camera and the one photo screen, the
 * waiting or share screen, the e-mails, the public photo page), in order. The pages come from the same function the user's page uses
 * (`withDefaultJourneyPages`, default-pages.ts), so the page editor and the user cannot disagree. Pure; unit-tested (journey.test.ts).
 */

import { CustomPageType, generateId, type CustomPage } from '@/lib/db/schemas';
import type { UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';
import { DEFAULT_CONSENT_PAGE_ID, DEFAULT_WELCOME_PAGE_ID, withDefaultJourneyPages } from './default-pages';
import { DEFAULT_IDENTITY_PAGE_ID } from './identity-page';

/** What the server knows that decides which default pages an event gets (`GET /api/events/<id>`, `journeyContext`). */
export interface JourneyContext {
  vettingRequired: boolean;
  /** True when the event gets the journey defaults: created with them, or the global switch is on (lib/admin/defaults-rollout.ts). */
  consentDefault: boolean;
  language: UiLanguage;
  /** True when the event has the welcome page screen picture drawn from its default slideshow: it then gets the default welcome page (issue 327). */
  hasWelcomeScreen?: boolean;
  /** The wordings an admin wrote for the partner or the event in this language (lib/i18n/overrides.ts): the default pages use them instead of the code dictionary. */
  texts?: TextOverrides | null;
  /** Where the editor moved the default pages (`Event.defaultPageOrders`, issue 535); missing: their default places. */
  defaultOrders?: Record<string, number> | null;
}

export type JourneyStepId = 'waiting' | 'share' | 'emails' | 'result';

export type JourneyRow =
  | { kind: 'own'; page: CustomPage }
  | { kind: 'default'; page: CustomPage; reason: string }
  | { kind: 'step'; id: JourneyStepId; title: string; description: string; editedIn: string };

const isDefaultPage = (page: CustomPage) => page.pageId === DEFAULT_WELCOME_PAGE_ID || page.pageId === DEFAULT_CONSENT_PAGE_ID || page.pageId === DEFAULT_IDENTITY_PAGE_ID;

const REASON: Record<string, string> = {
  [DEFAULT_WELCOME_PAGE_ID]: "The first thing a user sees: the giant screen drawn from this event's default slideshow and a Start button. This page is used until you make your own welcome page.",
  [DEFAULT_CONSENT_PAGE_ID]: 'Every user accepts the terms, the cookies and the privacy policy first. This page is used until you make your own consent page.',
  [DEFAULT_IDENTITY_PAGE_ID]: 'A photo that is checked before it is shown needs an e-mail or a social login. This page is used until you make your own login page.',
};

/**
 * The steps that follow the photo and are not pages. With photo approval on the user waits for the approval, and the approved photo comes by e-mail
 * with a link to the public photo page; without approval the user sees the share screen at once.
 */
function stepsAfterPhoto(context: JourneyContext, separateSubmit = false): JourneyRow[] {
  const saves = separateSubmit ? 'the Submit step saves the photo' : 'Continue saves the photo';
  if (context.vettingRequired) {
    return [
      { kind: 'step', id: 'waiting', title: 'Waiting for approval', description: `After ${saves} the user waits until it is approved. Built in.`, editedIn: 'The take-photo page in this list (approval texts) and the Public result page section above.' },
      { kind: 'step', id: 'emails', title: 'E-mails', description: 'The user gets the saved e-mail, then the approved or not-approved e-mail with the link. Built in.', editedIn: 'The Email module section above.' },
      { kind: 'step', id: 'result', title: 'The public photo page', description: 'The page the e-mail links to: the photo and its download. Built in.', editedIn: 'The Public result page section above.' },
    ];
  }
  return [
    { kind: 'step', id: 'share', title: 'Share screen', description: `After ${saves} the user can copy the link and share it. Built in.`, editedIn: 'The take-photo page in this list (share texts) and the Public result page section above.' },
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
  const pages = withDefaultJourneyPages(storedPages, { vettingRequired: context.vettingRequired, consentDefault: context.consentDefault, now, language: context.language, hasWelcomeScreen: context.hasWelcomeScreen, texts: context.texts, defaultOrders: context.defaultOrders });
  const rows: JourneyRow[] = [...pages]
    .sort((a, b) => a.order - b.order)
    .map((page) => (isDefaultPage(page) ? { kind: 'default', page, reason: REASON[page.pageId] } : { kind: 'own', page }));
  const photoAt = rows.findIndex((row) => row.kind === 'own' && row.page.isActive && row.page.pageType === CustomPageType.TAKE_PHOTO);
  // An active Submit page after the take-photo page makes saving a step of its own (issue 535): the built-in steps that follow the save come after it, and the pages between the two run before the save.
  const submitAt = photoAt === -1 ? -1 : rows.findIndex((row, index) => index > photoAt && row.kind === 'own' && row.page.isActive && row.page.pageType === CustomPageType.SUBMIT);
  const steps = stepsAfterPhoto(context, submitAt !== -1);
  const after = submitAt !== -1 ? submitAt : photoAt;
  if (after === -1) return [...rows, ...steps];
  return [...rows.slice(0, after + 1), ...steps, ...rows.slice(after + 1)];
}

/**
 * "Customise" on a default row: the event's own page, filled with the default's texts, in the default's place. The own page wins over the default
 * (it is a consent or login page before the photo), so the user's journey does not change by it. Deleting the own page brings the default back.
 */
export function customiseDefault(page: CustomPage, makeId: () => string = generateId, now: string = new Date().toISOString()): CustomPage {
  return { ...page, pageId: makeId(), config: structuredClone(page.config), createdAt: now, updatedAt: now };
}

type PageRow = Exclude<JourneyRow, { kind: 'step' }>;
const isPageRow = (row: JourneyRow): row is PageRow => row.kind !== 'step';
const isTakePhotoRow = (row: PageRow) => row.kind === 'own' && row.page.pageType === CustomPageType.TAKE_PHOTO;
const isSubmitRow = (row: PageRow) => row.kind === 'own' && row.page.pageType === CustomPageType.SUBMIT;

/**
 * The page row that the row at `index` swaps places with when it moves one place `up` (-1) or `down` (+1), or null when it cannot move. The built-in steps are not pages and stay where they are,
 * so the neighbour is the next page row in that direction. Three rules keep the journey sound: the Submit page stays after the take-photo page (they never swap); a default page never ends up
 * after the place where the photo is saved, because the consent and the login of the default journey come before it (a photo that is checked needs an identity first, camera#264): that place is
 * the take-photo page, or the Submit page when the event has one, in which case a default page may move between the two; an own page moves anywhere, as before.
 */
export function moveTarget(rows: readonly JourneyRow[], index: number, direction: -1 | 1): number | null {
  const row = rows[index];
  if (!row || !isPageRow(row)) return null;
  const hasSubmit = rows.some((other) => isPageRow(other) && isSubmitRow(other));
  for (let j = index + direction; j >= 0 && j < rows.length; j += direction) {
    const other = rows[j];
    if (!isPageRow(other)) continue;
    if ((isSubmitRow(row) && isTakePhotoRow(other)) || (isTakePhotoRow(row) && isSubmitRow(other))) return null;
    const defaultAndOther = row.kind === 'default' ? other : other.kind === 'default' ? row : null;
    if (defaultAndOther && (isSubmitRow(defaultAndOther) || (isTakePhotoRow(defaultAndOther) && !hasSubmit))) return null;
    return j;
  }
  return null;
}

/**
 * The journey after the row at `index` moved one place (issue 535): every page row, own and default, gets its place in the list as its `order`. The own pages are returned as the pages to save,
 * the default pages as `defaultOrders` (`Event.defaultPageOrders`): a default page stays a default, only its place is saved. All pages are numbered together so the editor and the user keep seeing
 * one order, whether a default page was moved or an own page moved past one. Null when the row cannot move (`moveTarget`).
 */
export function moveJourneyRow(rows: readonly JourneyRow[], index: number, direction: -1 | 1): { pages: CustomPage[]; defaultOrders: Record<string, number> } | null {
  const target = moveTarget(rows, index, direction);
  if (target === null) return null;
  const sequence = rows.filter(isPageRow);
  const from = sequence.indexOf(rows[index] as PageRow);
  const to = sequence.indexOf(rows[target] as PageRow);
  [sequence[from], sequence[to]] = [sequence[to], sequence[from]];
  return numberPages(sequence);
}

function numberPages(sequence: readonly PageRow[]): { pages: CustomPage[]; defaultOrders: Record<string, number> } {
  const pages: CustomPage[] = [];
  const defaultOrders: Record<string, number> = {};
  sequence.forEach((row, order) => {
    if (row.kind === 'default') defaultOrders[row.page.pageId] = order;
    else pages.push({ ...row.page, order });
  });
  return { pages, defaultOrders };
}

/**
 * The journey as it is, numbered again from 0 (every page row, own and default, by its place in the list). Used when a page is deleted from an event whose default pages have saved places, so
 * the own pages and the default pages keep one order.
 */
export function renumberJourney(rows: readonly JourneyRow[]): { pages: CustomPage[]; defaultOrders: Record<string, number> } {
  return numberPages(rows.filter(isPageRow));
}

/**
 * Make saving the photo a step of its own, or part of the take-photo page again (issue 535: the checkbox "Submit is part of this page" on the Take Photo page). Separate: a Submit page (a
 * marker, it shows nothing) is put right after the take-photo page, and every page row is numbered again as in a move; a page the editor then puts between the two runs after the photo is
 * taken and before it is saved. Part of the page: the Submit page is taken out and the pages that were between the two are after the photo, as they are for any event.
 */
export function setSubmitSeparate(rows: readonly JourneyRow[], separate: boolean, makeId: () => string = generateId, now: string = new Date().toISOString()): { pages: CustomPage[]; defaultOrders: Record<string, number> } {
  const sequence = rows.filter(isPageRow).filter((row) => !isSubmitRow(row));
  if (separate) {
    const photoAt = sequence.findIndex(isTakePhotoRow);
    const marker: PageRow = { kind: 'own', page: { pageId: makeId(), pageType: CustomPageType.SUBMIT, order: 0, isActive: true, config: { title: '[Submit]', description: '', buttonText: '' }, createdAt: now, updatedAt: now } };
    sequence.splice(photoAt === -1 ? sequence.length : photoAt + 1, 0, marker);
  }
  return numberPages(sequence);
}

/** True when the journey has a Submit page after the take-photo page: saving is a step of its own. */
export function hasSeparateSubmit(rows: readonly JourneyRow[]): boolean {
  const pageRows = rows.filter(isPageRow);
  const photoAt = pageRows.findIndex((row) => isTakePhotoRow(row) && row.kind === 'own' && row.page.isActive);
  return photoAt !== -1 && pageRows.some((row, index) => index > photoAt && isSubmitRow(row) && row.kind === 'own' && row.page.isActive);
}
