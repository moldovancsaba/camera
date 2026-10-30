'use client';

import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminPageText } from '@/lib/i18n/admin-pages';

/**
 * A compact, accessible visibility status for admin inventory and detail views.
 * Material Icons are already loaded by the application root layout.
 */
export default function VisibilityStatusIcon({ isVisible }: { isVisible: boolean }) {
  const language = useUiLanguage();
  const label = adminPageText(isVisible ? 'Active' : 'Inactive', language);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-visibility={isVisible ? 'visible' : 'hidden'}
      style={{
        alignItems: 'center',
        color: isVisible ? 'var(--mantine-color-green-7)' : 'var(--mantine-color-red-7)',
        display: 'inline-flex',
        fontFamily: '"Material Icons"',
        fontFeatureSettings: '"liga"',
        fontSize: '1.35rem',
        fontStyle: 'normal',
        fontWeight: 'normal',
        height: '1.5rem',
        justifyContent: 'center',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        width: '1.5rem',
      }}
    >
      <span aria-hidden="true">{isVisible ? 'visibility' : 'visibility_off'}</span>
    </span>
  );
}
