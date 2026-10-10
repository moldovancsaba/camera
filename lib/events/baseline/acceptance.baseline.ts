/*
 * FROZEN COPY of the logic as it was before the checkbox settings (issue 558), kept only so that tests can run the same inputs through the old and the new code
 * (lib/events/consent-settings.baseline.test.ts). Do not change it and do not import it from application code.
 */
/**
 * The acceptance on the Who-are-you page (issue 523; client feedback 2026-10-09): an event may show its consent page's checkboxes as **one small checkbox with one sentence** on the
 * Who-are-you page, under its intro text, instead of a page of its own; everything on the page stays disabled until the box is ticked. The switch is one setting of the event
 * (`Event.acceptanceOnWhoAreYou`) that both page editors show, so the two checkboxes are always the same one. Off: the two pages one after the other, as before. Pure and DOM-free,
 * unit-tested in acceptance.test.ts.
 */

import { CustomPageType } from '@/lib/db/schemas';
import { translate, type UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';
import type { ConsentCheckbox } from './consent.baseline';
import { pagesBeforeSave } from '../photo-boundary';

interface PageLike {
  pageType: CustomPageType | string;
  isActive: boolean;
  order: number;
}

/**
 * The pages the user goes through, and the consent page whose checkboxes the Who-are-you page shows (null when nothing is merged). Merged only when the switch is on, the event
 * has an active Who-are-you page and an active consent page, both before the photo (the take-photo page, or anywhere when there is none): the first such consent page leaves the
 * list, the others stay. Nothing else changes.
 */
export function acceptanceOnLogin<T extends PageLike>(pages: readonly T[], enabled: boolean): { pages: T[]; acceptPage: T | null } {
  const all = [...pages];
  if (!enabled) return { pages: all, acceptPage: null };
  const before = pagesBeforeSave(all);
  const hasLogin = before.some((page) => page.isActive && page.pageType === CustomPageType.WHO_ARE_YOU);
  const acceptPage = before.find((page) => page.isActive && page.pageType === CustomPageType.ACCEPT) ?? null;
  if (!hasLogin || !acceptPage) return { pages: all, acceptPage: null };
  return { pages: all.filter((page) => page !== acceptPage), acceptPage };
}

export interface SentencePart {
  text: string;
  /** An https address; the part is a link to it. */
  linkUrl?: string;
}

/**
 * The one sentence, as parts (text, or a link). The usual three legal pages of an event (the terms, the cookies, the privacy policy, in that order: `defaultConsentCheckboxes`)
 * make the sentence of the dictionary (`consent.combined`: the terms are accepted, the privacy notice and the cookie notice are taken note of), each name a link to its page; a
 * consent page with any other list of checkboxes gets its own texts one after the other, each with its link, so nothing the user is asked to accept is left out.
 */
export function acceptanceSentence(items: readonly ConsentCheckbox[], language: UiLanguage, texts?: TextOverrides | null): SentencePart[] {
  if (items.length === 3 && items.every((item) => item.linkUrl)) {
    const [terms, cookies, privacy] = items;
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
  items.forEach((item, index) => {
    if (index > 0) parts.push({ text: ', ' });
    parts.push(item.linkUrl ? { text: item.text, linkUrl: item.linkUrl } : { text: item.text });
  });
  return parts;
}

/** The sentence as plain text: what the user read, kept with the consent records. */
export function sentenceText(parts: readonly SentencePart[]): string {
  return parts.map((part) => part.text).join('');
}
