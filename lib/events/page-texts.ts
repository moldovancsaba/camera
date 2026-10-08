/**
 * Texts of the journey that an editor can replace (camera#333, camera#337): the "Redirecting message" of a CTA page and the four texts a user reads
 * while a photo waits for approval. Each has the English text it always had as its default, and an empty setting falls back to it, so an event that
 * sets nothing looks exactly as before (main rule 18: the default is ready, the editor can replace it).
 */

import { textOrDefault } from '@/lib/events/identity-page';

export const DEFAULT_REDIRECTING_TEXT = 'Opening…';

export const DEFAULT_APPROVAL_TEXTS = {
  previewNotice: 'Your photo will get its frame after it has been approved.',
  savedMessage: 'Thank you! Your photo is waiting for approval.',
  title: 'Thank you!',
  waitingMessage: 'Your photo is waiting for approval. We will email you the link to it as soon as it is approved.',
} as const;

/** Added to the default waiting message when the user chose a try-on picture; an editor's own waiting message is shown as written. */
export const TRY_ON_WAITING_SENTENCE = ' Your try-on picture will be made after that.';

export interface ApprovalTextSettings {
  pendingPreviewNotice?: string;
  pendingSavedMessage?: string;
  pendingTitle?: string;
  pendingWaitingMessage?: string;
}

/** The text shown on the visit button of a CTA page after it was pressed. */
export function redirectingText(value: string | null | undefined): string {
  return textOrDefault(value, DEFAULT_REDIRECTING_TEXT);
}

/** The four texts of the approval wait, from the settings of the selfie-taking page (or none). */
export function approvalTexts(settings: ApprovalTextSettings | null | undefined, tryOnChosen: boolean) {
  const own = textOrDefault(settings?.pendingWaitingMessage, '');
  return {
    previewNotice: textOrDefault(settings?.pendingPreviewNotice, DEFAULT_APPROVAL_TEXTS.previewNotice),
    savedMessage: textOrDefault(settings?.pendingSavedMessage, DEFAULT_APPROVAL_TEXTS.savedMessage),
    title: textOrDefault(settings?.pendingTitle, DEFAULT_APPROVAL_TEXTS.title),
    waitingMessage: own || `${DEFAULT_APPROVAL_TEXTS.waitingMessage}${tryOnChosen ? TRY_ON_WAITING_SENTENCE : ''}`,
  };
}
