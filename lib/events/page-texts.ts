/**
 * Texts of the journey that an editor can replace (camera#333, camera#337): the "Redirecting message" of a CTA page and the four texts a user reads
 * while a photo waits for approval. Each has a default text in the dictionary of the event's language (camera#352; English is what they always were), and
 * an empty setting falls back to it, so an event that sets nothing looks exactly as before (main rule 18: the default is ready, the editor can replace it).
 */

import { textOr, translate, type UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';

export const DEFAULT_REDIRECTING_TEXT = translate('en', 'cta.opening');

/** The English texts (the dictionary's), for code that has no language. */
export const DEFAULT_APPROVAL_TEXTS = {
  previewNotice: translate('en', 'approval.previewNotice'),
  savedMessage: translate('en', 'approval.saved'),
  title: translate('en', 'approval.title'),
  waitingMessage: translate('en', 'approval.waiting'),
} as const;

export interface ApprovalTextSettings {
  pendingPreviewNotice?: string;
  pendingSavedMessage?: string;
  pendingTitle?: string;
  pendingWaitingMessage?: string;
}

/** The text shown on the visit button of a CTA page after it was pressed. */
export function redirectingText(value: string | null | undefined, language: UiLanguage = 'en', texts?: TextOverrides | null): string {
  return textOr(language, 'cta.opening', value, undefined, texts);
}

/** The four texts of the approval wait, from the settings of the selfie-taking page (or none). */
export function approvalTexts(settings: ApprovalTextSettings | null | undefined, language: UiLanguage = 'en', texts?: TextOverrides | null) {
  return {
    previewNotice: textOr(language, 'approval.previewNotice', settings?.pendingPreviewNotice, undefined, texts),
    savedMessage: textOr(language, 'approval.saved', settings?.pendingSavedMessage, undefined, texts),
    // True only when an editor wrote their own saved message: the standard one says what the card on the screen already says, so it is not shown as a notice on top of it.
    savedMessageIsOwn: textOr(language, 'approval.saved', settings?.pendingSavedMessage, undefined, texts) !== translate(language, 'approval.saved', undefined, texts),
    title: textOr(language, 'approval.title', settings?.pendingTitle, undefined, texts),
    waitingMessage: textOr(language, 'approval.waiting', settings?.pendingWaitingMessage, undefined, texts),
  };
}
