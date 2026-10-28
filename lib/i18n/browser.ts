/** Resolve browser preferences with the shared locale matcher; unsupported preferences use English. */

import { DEFAULT_UI_LANGUAGE, type UiLanguage } from '@/lib/i18n';
import { deviceUiLanguage } from '@/lib/i18n/locale-negotiation';

export function browserLanguage(languages: readonly string[] | null | undefined): UiLanguage {
  return deviceUiLanguage(languages) ?? DEFAULT_UI_LANGUAGE;
}
