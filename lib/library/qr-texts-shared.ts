/**
 * What the QR text pages need of lib/library/qr-texts.ts (issue 326), with no server code in it, so a page imports this file and not the library.
 */

import type { UiLanguage } from '@/lib/i18n';

/** A line next to the QR code is one short line scaled to the width of its box, so a long one would be tiny. */
export const QR_TEXT_MAX_LENGTH = 40;
/** The most texts the library holds. */
export const QR_TEXT_MAX_ITEMS = 200;

export interface QrTextView {
  id: string;
  text: string;
  language: UiLanguage;
  isActive: boolean;
  createdAt: string;
}
