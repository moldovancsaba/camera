'use client';

import { InlineAlert } from '@sovereignsquad/gds-core/client';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminPageText } from '@/lib/i18n/admin-pages';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

export default function DatabaseConnectionAlert({ diagnosis }: { diagnosis: MongoConnectionDiagnosis }) {
  const language = useUiLanguage();
  const { rawMessage, summary, hints } = diagnosis;

  return (
    <div lang={language} dir={uiLanguageDirection(language)}>
      <InlineAlert
        severity="error"
        title={adminPageText('Database connection error', language)}
        message={
          <div lang="en" dir="ltr" style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)' }}>
            <p style={{ margin: 0 }}>{summary}</p>
            <code style={{ wordBreak: 'break-all' }}>{rawMessage}</code>
            {hints.length > 0 ? (
              <ul style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
                {hints.map((hint, index) => (
                  <li key={index}>{hint}</li>
                ))}
              </ul>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
