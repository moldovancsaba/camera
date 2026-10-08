/**
 * The error texts the server sends in English (the answers of POST /api/submissions and the helpers behind it) in the language of the event (camera#352).
 * English stays exactly as it was: the server's own text. In another language a text we know is translated, a network failure of the browser gets its
 * own text, and anything unknown becomes the general "unexpected error" text (the real text is still in the console).
 */

import { translate, DEFAULT_UI_LANGUAGE, type MessageKey, type UiLanguage } from '@/lib/i18n';

const KNOWN: ReadonlyArray<readonly [needle: string, key: MessageKey]> = [
  ['Image data is required', 'err.imageRequired'],
  ['The reframe record for the original image', 'err.reframe'],
  ['Frame not found', 'err.frameNotFound'],
  ['userInfo must include both name and email', 'err.nameAndEmail'],
  ['All consents must have accepted=true', 'err.consent'],
  ['An email or a login is required', 'err.emailOrLogin'],
  ['The photo could not be stored', 'err.notStored'],
  ['The photo must be a JPEG, PNG or WebP image', 'err.imageType'],
  ['The photo has an unsupported size', 'err.imageSize'],
  ['Too many requests', 'err.rate'],
  ['Internal server error', 'err.internal'],
  ['An unexpected error occurred', 'flow.unexpectedError'],
];

/** What browsers say when the network fails (Chrome, Safari, Firefox). */
const NETWORK = /^(failed to fetch|load failed|networkerror|network request failed)/i;

export function errorText(language: UiLanguage, message: string): string {
  if (language === DEFAULT_UI_LANGUAGE) return message;
  if (NETWORK.test(message.trim())) return translate(language, 'err.network');
  const known = KNOWN.find(([needle]) => message.includes(needle));
  return translate(language, known ? known[1] : 'flow.unexpectedError');
}
