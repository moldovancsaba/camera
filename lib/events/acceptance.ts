/**
 * The acceptance on the Who-are-you page (issue 523; client feedback 2026-10-09): an event may show its consent page's checkboxes as **one small checkbox with one sentence** on the
 * Who-are-you page, under its intro text, instead of a page of its own; everything on the page stays disabled until the box is ticked. When login follows the camera without a separate Submit step, saving waits until login is complete. The switch is one setting of the event
 * (`Event.acceptanceOnWhoAreYou`) that both page editors show, so the two checkboxes are always the same one. Off: the two pages one after the other, as before. Pure and DOM-free,
 * unit-tested in acceptance.test.ts.
 */

import { CustomPageType } from '@/lib/db/schemas';
import { translate, type UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';
import { consentPageIsEmpty, type ConsentCheckbox } from './consent';
import { pagesBeforeSave } from './photo-boundary';

interface PageLike {
  pageType: CustomPageType | string;
  isActive: boolean;
  order: number;
  config?: { checkboxes?: unknown };
}

/**
 * The pages the user goes through, and the consent page whose checkboxes the Who-are-you page shows (null when nothing is merged). Merged only when the switch is on, an active
 * consent page with something to show comes before an active Who-are-you page, and both happen before the save. If a separate Submit step exists, both pages must be before it.
 * Without a separate Submit step, a login after the camera becomes a save point: the capture is backed up first, and the submission is saved after login. Only the first eligible
 * consent page leaves the list; other consent pages stay. Nothing else changes.
 */
export function acceptanceOnLogin<T extends PageLike>(pages: readonly T[], enabled: boolean): { pages: T[]; acceptPage: T | null } {
  const all = [...pages];
  if (!enabled) return { pages: all, acceptPage: null };
  const before = pagesBeforeSave(all);
  const photoOrder = all.find((page) => page.isActive && page.pageType === 'take-photo')?.order;
  const hasSeparateSubmit = photoOrder !== undefined && all.some((page) => page.isActive && page.pageType === 'submit' && page.order > photoOrder);
  // With no separate Submit step, a post-camera login can carry consent because the guest flow waits to save until login is complete.
  const eligible = hasSeparateSubmit ? before : all;
  const sorted = [...eligible].filter((page) => page.isActive).sort((a, b) => a.order - b.order);
  const login = sorted.find((page) => page.pageType === CustomPageType.WHO_ARE_YOU);
  const acceptPage = login
    ? sorted.find((page) => page.pageType === CustomPageType.ACCEPT && page.order < login.order && !consentPageIsEmpty(page.config ?? {})) ?? null
    : null;
  const hasLogin = login !== undefined;
  if (!hasLogin || !acceptPage) return { pages: all, acceptPage: null };
  return { pages: all.filter((page) => page !== acceptPage), acceptPage };
}

export interface SentencePart {
  text: string;
  /** An https address; the part is a link to it. */
  linkUrl?: string;
}

/**
 * The one sentence, as parts (text, or a link). The legal pages make the sentence of the dictionary (`consent.combined`) or, for another consent list, their
 * legal texts appear one after another with links. The optional marketing choice is always rendered separately.
 */
export function acceptanceSentence(items: readonly ConsentCheckbox[], language: UiLanguage, texts?: TextOverrides | null): SentencePart[] {
  // Marketing opt-in is never folded into the required legal sentence; it is rendered as its own optional checkbox.
  const legalItems = items.filter((item) => item.kind !== 'marketing');
  if (legalItems.length === 0) return [];
  if (legalItems.length === 3 && legalItems.every((item) => item.linkUrl)) {
    const [terms, cookies, privacy] = legalItems;
    const link = { terms: terms.linkUrl, privacy: privacy.linkUrl, cookies: cookies.linkUrl } as const;
    const parts: SentencePart[] = [];
    for (const piece of translate(language, 'consent.combined', undefined, texts).split(/(\{terms\}|\{privacy\}|\{cookies\})/)) {
      const name = /^\{(terms|privacy|cookies)\}$/.exec(piece)?.[1] as 'terms' | 'privacy' | 'cookies' | undefined;
      if (name) parts.push({ text: translate(language, `consent.combined.${name}` as const, undefined, texts), linkUrl: link[name] });
      else if (piece) parts.push({ text: piece });
    }
    return parts;
  }
  const parts: SentencePart[] = [];
  legalItems.forEach((item, index) => {
    if (index > 0) parts.push({ text: ', ' });
    parts.push(item.linkUrl ? { text: item.text, linkUrl: item.linkUrl } : { text: item.text });
  });
  return parts;
}

/** The sentence as plain text: what the user read, kept with the consent records. */
export function sentenceText(parts: readonly SentencePart[]): string {
  return parts.map((part) => part.text).join('');
}
