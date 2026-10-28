/**
 * The date and time under a photo, in the language of the event (camera#352). English keeps the server's own locale and time zone, exactly as before the
 * language existed; a Hungarian event shows Hungarian date words and **Budapest time**, whatever time zone the server runs in.
 */

import type { UiLanguage } from './index';

/** The date and time of an ISO timestamp, or an empty text when it is not a date. */
export function formatDateTime(value: string, language: UiLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(language, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(language === 'hu' ? { timeZone: 'Europe/Budapest' } : {}),
  });
}
