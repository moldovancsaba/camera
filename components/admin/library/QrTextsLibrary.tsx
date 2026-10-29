'use client';

/**
 * The global QR texts (issue 326, lib/library/qr-texts.ts; plan items 1, 4 and 49): the short lines next to the QR code on the stage of an event's default slideshow. Each has a language and can
 * be active or switched off; **a random active one in the event's language (English when there is none) is picked once, when the event's default slideshow is made**. With none in the library
 * the stage has no such line, as before. Add, switch off or on, delete (the question sits on the row it is about, never the browser's own confirm, CLAUDE.md section 5). An event's own text is the
 * text of its slideshow, which the editor changes in the slideshow editor.
 */

import { useCallback, useEffect, useState } from 'react';
import { InlineAlert, LabelTag, StateBlock } from '@sovereignsquad/gds-core/client';
import VisibilityStatusIcon from '@/components/gds/VisibilityStatusIcon';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { Button, Select, TextInput } from '@/components/gds/PublicPrimitives';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { QR_TEXT_MAX_LENGTH, type QrTextView } from '@/lib/library/qr-texts-shared';

interface Payload<T> {
  data?: T;
  error?: string;
}

const SECTION = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', overflow: 'hidden' } as const;
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hu', label: 'Magyar (Hungarian)' },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as Payload<T> | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data;
}

export default function QrTextsLibrary({ embedded = false }: { embedded?: boolean } = {}) {
  const [items, setItems] = useState<QrTextView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('en');

  const reload = useCallback(async () => {
    setItems((await call<{ items: QrTextView[] }>('/api/qr-texts')).items);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        await reload();
      } catch (loadError) {
        setError(errorText(loadError));
      } finally {
        setLoading(false);
      }
    })();
  }, [reload]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await run();
      await reload();
    } catch (actionFailure) {
      setActionError(errorText(actionFailure));
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    act(async () => {
      await call('/api/qr-texts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language }) });
      setText('');
    });
  const setActive = (id: string, isActive: boolean) => act(() => call(`/api/qr-texts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) }));
  const remove = (id: string) => {
    setDeleting(null);
    return act(() => call(`/api/qr-texts/${id}`, { method: 'DELETE' }));
  };

  const header = embedded ? (
    <header id="qr-texts">
      <h2 style={{ margin: 0 }}>QR texts</h2>
      <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>
        Guest-facing text shown beside the QR code on the default slideshow. These entries share the global guest-facing Dictionary workspace.
      </p>
    </header>
  ) : (
    <WorkspaceHeader
      eyebrow="Resource Inventory"
      title="QR texts"
      description="The short lines next to the QR code on the stage of an event’s default slideshow, for example “Scan & smile”. A random active one in the event’s language (English when there is none) is picked once, when the event’s default slideshow is made; the editor can change it in the slideshow editor."
    />
  );

  if (loading) return <StateBlock variant="loading" title="Loading the QR texts..." />;
  if (error || !items) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        {header}
        <InlineAlert title="Error" message={error || 'The QR texts could not be loaded'} severity="error" />
      </div>
    );
  }

  const active = items.filter((item) => item.isActive).length;

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {header}
      {actionError ? <InlineAlert title="That did not work" message={actionError} severity="error" /> : null}

      <section style={SECTION}>
        <div style={{ borderBottom: '1px solid var(--mantine-color-default-border)', padding: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>{`In the library (${items.length}, ${active} active)`}</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>
            A text switched off is no longer picked for a new event; an event that has it keeps it. With none active in an event’s language (or in English), the stage has no line next to the QR code, as before.
          </p>
        </div>
        <div style={{ display: 'grid' }}>
          {items.length === 0 ? (
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '2rem 1rem', textAlign: 'center' }}>No QR texts yet. Add the first one below; until then no stage has a line next to the QR code.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} style={{ alignItems: 'center', borderBottom: '1px solid var(--mantine-color-default-border)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 1.5rem' }} data-qr-text>
                <div style={{ display: 'grid', flex: '1 1 14rem', gap: '0.25rem', minWidth: 0, overflowWrap: 'anywhere' }}>
                  <strong>{item.text}</strong>
                  <span style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    <LabelTag tone="neutral" label={item.language === 'hu' ? 'Hungarian' : 'English'} />
                    <VisibilityStatusIcon isVisible={item.isActive} />
                  </span>
                  {deleting === item.id ? <span style={{ fontSize: '0.8125rem' }}>Delete it for good? Events that have it keep it on their stage.</span> : null}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {deleting === item.id ? (
                    <>
                      <SemanticButton action="library:confirm-delete" variant="danger" size="xs" disabled={busy} onClick={() => void remove(item.id)}>
                        Yes, delete it
                      </SemanticButton>
                      <SemanticButton action="library:cancel-delete" variant="secondary" size="xs" disabled={busy} onClick={() => setDeleting(null)}>
                        Cancel
                      </SemanticButton>
                    </>
                  ) : (
                    <>
                      <SemanticButton action={item.isActive ? 'library:switch-off' : 'library:switch-on'} variant="secondary" size="xs" disabled={busy} onClick={() => void setActive(item.id, !item.isActive)}>
                        {item.isActive ? 'Switch off' : 'Switch on'}
                      </SemanticButton>
                      <SemanticButton action="library:delete" variant="danger" size="xs" disabled={busy} onClick={() => setDeleting(item.id)}>
                        Delete
                      </SemanticButton>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={SECTION}>
        <div style={{ borderBottom: '1px solid var(--mantine-color-default-border)', padding: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>Add a QR text</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>One short line, at most {QR_TEXT_MAX_LENGTH} characters: it is scaled to the width of the QR code, so a short one is big and a long one small.</p>
        </div>
        <form
          style={{ display: 'grid', gap: '0.75rem', padding: '1rem 1.5rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <TextInput label="Text" placeholder="e.g. Scan & smile" value={text} onChange={(event) => setText(event.currentTarget.value)} maxLength={QR_TEXT_MAX_LENGTH} disabled={busy} required />
          <Select label="Language" data={LANGUAGES} value={language} onChange={(value) => setLanguage(value ?? 'en')} allowDeselect={false} disabled={busy} />
          <div>
            <Button type="submit" loading={busy} disabled={busy || !text.trim()}>
              Add the text
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
