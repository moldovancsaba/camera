import type { PhotoModerationQueueSignal } from './queue';
import { type UiLanguage } from '@/lib/i18n';
import { adminOperationText } from '@/lib/i18n/admin-operations';

export interface PhotoPrecheckNotice {
  title: string;
  message: string;
  severity: 'info' | 'warning';
}

/** Reviewer-facing copy for the existing one-photo screen; no state is a publication decision. */
export function photoPrecheckNotice(result: PhotoModerationQueueSignal | null, language: UiLanguage = 'en'): PhotoPrecheckNotice | null {
  if (!result) return null;
  const t = (source: string) => adminOperationText(source, language);
  const advisory = t('AI precheck is advisory; all decisions remain with the reviewer.');
  if (result.status === 'failed') return { title: t('AI content precheck unavailable'), message: advisory, severity: 'warning' };
  if (result.errorCode) return { title: t('Retrying'), message: advisory, severity: 'warning' };
  if (result.status !== 'completed') {
    const status = result.status === 'running' ? t('In progress')
      : result.status === 'queued_remote' ? t('Queued')
        : result.status === 'submitting' ? t('Starting')
          : t('Waiting for Fanmass');
    return { title: t('Content safety'), message: `${status}. ${advisory}`, severity: 'info' };
  }
  if (result.signal === 'flagged') {
    const flags = result.flags.map((flag) => adminOperationText(flag, language)).join(', ');
    return { title: t('Needs review'), message: `${flags || t('Content safety')}.${result.evidence ? ` ${result.evidence}` : ''} ${advisory}`, severity: 'warning' };
  }
  if (result.signal === 'uncertain') {
    return { title: t('Needs review'), message: `${result.evidence ? `${result.evidence} ` : ''}${advisory}`, severity: 'warning' };
  }
  return { title: t('Content safety'), message: `${t('No listed concern detected by the screening model.')} ${advisory}`, severity: 'info' };
}
