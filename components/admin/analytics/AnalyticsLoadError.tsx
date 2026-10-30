'use client';

import { InlineAlert } from '@sovereignsquad/gds-core/client';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminPageText } from '@/lib/i18n/admin-pages';

export default function AnalyticsLoadError() {
  const language = useUiLanguage();
  return (
    <InlineAlert
      severity="error"
      title={adminPageText('Error', language)}
      message={adminPageText('The analytics report could not be loaded. Please try again.', language)}
    />
  );
}
