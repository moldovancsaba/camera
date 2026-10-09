'use client';

/**
 * The preview of an e-mail beside its editor (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E4): the subject and the e-mail at the width of a phone, in the look of the event, exactly as
 * a user gets it (the same function the sender uses, `POST /api/admin/emails/preview`), from the text typed so far, saved or not. It says which variables the e-mail could not fill.
 */

import { useEffect, useState } from 'react';
import { InlineAlert } from '@sovereignsquad/gds-core/client';

interface Preview {
  subject: string;
  html: string;
  warnings: { withoutValue: string[]; unknown: string[] };
}

export interface EmailPreviewProps {
  /** The Mongo _id of the event whose look, names and legal part the preview uses; none for the default look and sample values. */
  eventId?: string;
  language: string;
  subject: string;
  body: string;
  /** The legal part to show; undefined lets the server use the one that applies to the event. */
  legal?: string | null;
  /** The label of the button; null for an e-mail with no button. */
  buttonLabel?: string | null;
}

const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;

export default function EmailPreview({ eventId, language, subject, body, legal, buttonLabel }: EmailPreviewProps) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/api/admin/emails/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId, language, subject, body, ...(legal === undefined ? {} : { legal }), buttonLabel }),
            signal: controller.signal,
          });
          const payload = (await response.json().catch(() => null)) as { data?: Preview; error?: string } | null;
          if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
          setPreview(payload.data);
          setError(null);
        } catch (failure) {
          if (controller.signal.aborted) return;
          setError(failure instanceof Error ? failure.message : 'The preview could not be made');
        }
      })();
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [eventId, language, subject, body, legal, buttonLabel]);

  return (
    <section aria-label="Preview of the e-mail" style={{ display: 'grid', gap: '0.5rem', alignContent: 'start' }}>
      <h4 style={{ margin: 0 }}>Preview</h4>
      {error ? <InlineAlert title="The preview could not be made" message={error} severity="error" /> : null}
      {preview ? (
        <>
          <div style={muted}>
            Subject: <strong style={{ color: 'inherit' }}>{preview.subject || '(empty)'}</strong>
          </div>
          {preview.warnings.withoutValue.length > 0 ? (
            <InlineAlert
              title="Left out of the e-mail"
              message={`${preview.warnings.withoutValue.map((name) => `{${name}}`).join(', ')} ${preview.warnings.withoutValue.length === 1 ? 'has' : 'have'} no value for this event, so nothing is written there.`}
              severity="warning"
            />
          ) : null}
          {preview.warnings.unknown.length > 0 ? (
            <InlineAlert title="Not a variable" message={`${preview.warnings.unknown.map((name) => `{${name}}`).join(', ')} ${preview.warnings.unknown.length === 1 ? 'is' : 'are'} not a variable and is left out. Use the Variable menu.`} severity="warning" />
          ) : null}
          <iframe
            title="The e-mail as a user gets it"
            // No scripts: the e-mail is only drawn. `allow-same-origin` lets this page measure it; nothing in it can run.
            sandbox="allow-same-origin"
            srcDoc={preview.html}
            style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8, height: 640, maxWidth: '100%', width: 390 }}
          />
        </>
      ) : (
        <div style={muted}>{error ? '' : 'Drawing the e-mail…'}</div>
      )}
    </section>
  );
}
