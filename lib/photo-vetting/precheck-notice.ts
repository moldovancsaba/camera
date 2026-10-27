import type { PhotoModerationQueueSignal } from './queue';

export interface PhotoPrecheckNotice {
  title: string;
  message: string;
  severity: 'info' | 'warning';
}

const CATEGORY_LABELS: Record<string, string> = {
  nudity: 'nudity', sexualContent: 'sexual content', middleFinger: 'middle-finger gesture', hateSymbols: 'hate symbols',
  hateWords: 'hate words', alcohol: 'alcohol', drugs: 'drugs', violence: 'violence', weapons: 'weapons',
};

/** Reviewer-facing copy for the existing one-photo screen; no state is a publication decision. */
export function photoPrecheckNotice(result: PhotoModerationQueueSignal | null): PhotoPrecheckNotice | null {
  if (!result) return null;
  if (result.status === 'failed') return { title: 'AI content precheck unavailable', message: 'The screening service could not provide a result. Review this photo manually; approval and rejection are unchanged.', severity: 'warning' };
  if (result.errorCode) return { title: 'AI content precheck is retrying', message: 'The screening service has not returned a result yet. You can review this photo now; the screening signal will not decide it.', severity: 'warning' };
  if (result.status !== 'completed') {
    const status = result.status === 'running' ? 'The screening model is analyzing this photo.'
      : result.status === 'queued_remote' ? 'This photo is queued for screening.'
        : 'This photo is waiting for screening.';
    return { title: 'AI content precheck', message: `${status} You can continue with human review; the result will not decide this photo.`, severity: 'info' };
  }
  const manualReview = 'This is an experimental signal, not a decision. Review every photo yourself.';
  if (result.signal === 'flagged') {
    const flags = result.flags.map((flag) => CATEGORY_LABELS[flag] ?? flag).join(', ') || 'possible content';
    return { title: 'Possible content concern', message: `${flags}.${result.evidence ? ` Visible evidence: ${result.evidence}` : ''} ${manualReview}`, severity: 'warning' };
  }
  if (result.signal === 'uncertain') {
    return { title: 'AI content precheck is uncertain', message: `${result.evidence ? `Visible evidence: ${result.evidence} ` : ''}${manualReview}`, severity: 'warning' };
  }
  return { title: 'No listed concern detected by the screening model', message: `This does not establish that the photo is safe. ${manualReview}`, severity: 'info' };
}
