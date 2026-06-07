'use client';

import { InlineAlert } from '@doneisbetter/gds-core/client';
import type { MongoConnectionDiagnosis } from '@/lib/db/mongo-errors';

export default function DatabaseConnectionAlert({ diagnosis }: { diagnosis: MongoConnectionDiagnosis }) {
  const { rawMessage, summary, hints } = diagnosis;

  return (
    <InlineAlert
      severity="error"
      title="Database connection error"
      message={
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)' }}>
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
  );
}
