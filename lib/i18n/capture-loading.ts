import { textOr, type UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';

/** Resolve the capture loading copy once on the server so client data loading cannot swap messages mid-screen. */
export function captureLoadingText(language: UiLanguage, legacyText: string | null | undefined, overrides: TextOverrides): string {
  const configured = overrides['event.loading']?.trim();
  if (configured) return configured;
  return textOr(language, 'event.loading', legacyText, undefined, overrides);
}
