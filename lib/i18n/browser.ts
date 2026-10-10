/**
 * The language for a page that sits above the event and does not know its language (the global error page, issue 352): the browser's own, Hungarian when it asks for Hungarian, else English.
 * Pure; the page reads `navigator.languages` after it has mounted. Unit-tested (browser.test.ts).
 */

import type { UiLanguage } from '@/lib/i18n';

export function browserLanguage(languages: readonly string[] | null | undefined): UiLanguage {
  const first = (languages ?? []).find((language) => typeof language === 'string' && language.trim());
  return typeof first === 'string' && first.trim().toLowerCase().startsWith('hu') ? 'hu' : 'en';
}
