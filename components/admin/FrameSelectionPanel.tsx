'use client';

/**
 * How a user gets the layout and the message of the frame at one event (epic 444, docs/FRAME_LAYOUT_SELECTION_PLAN.md, segment S1).
 *
 * Shown only when there is something to choose between: more than one layout or more than one message. Two settings, each "the editor chooses" (with a pick), "random" or
 * "the user chooses". Talks to GET/PUT /api/admin/events/[id]/frame-selection. Until it is saved the event does what it always did.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/gds/PublicPrimitives';
import { Group, InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import AssetThumbnail from '@/components/admin/library/AssetThumbnail';
import type { FrameSelection, LayoutOption, LayoutSituation, MessageOption, SelectMode, SelectionPart } from '@/lib/frame/selection';

interface Loaded {
  layouts: LayoutOption[];
  messages: MessageOption[];
  situation: LayoutSituation;
  selection: FrameSelection | null;
  today: FrameSelection;
}

const SITUATION_TEXT: Record<LayoutSituation, string> = {
  A: 'Situation A: only the generated layout exists, so every user gets it.',
  B: 'Situation B: you made one layout, so it is the default and every user gets it.',
  C: 'Situation C: you made more than one layout, so you choose how users get them.',
};

const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;
const section = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', overflow: 'hidden' } as const;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || !body?.data) throw new Error(body?.error || `Request failed (${response.status})`);
  return body.data;
}

const MODE_LABEL: Record<SelectMode, string> = { editor: 'You choose', random: 'Random', user: 'The user chooses' };

/** A pick that is not (or no longer) one of the options is not a pick: the first option stands in until the editor chooses. */
const settled = (part: SelectionPart, options: readonly string[]): SelectionPart =>
  part.mode === 'editor' ? { mode: 'editor', pick: part.pick && options.includes(part.pick) ? part.pick : (options[0] ?? null) } : { mode: part.mode, pick: null };

function PartEditor({
  noun,
  value,
  options,
  disabled,
  onChange,
}: {
  noun: string;
  value: SelectionPart;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (next: SelectionPart) => void;
}) {
  return (
    <fieldset style={{ border: 0, display: 'grid', gap: '0.5rem', margin: 0, padding: 0 }} disabled={disabled}>
      <legend style={{ fontWeight: 600, marginBottom: '0.25rem', padding: 0 }}>{noun}</legend>
      {(['editor', 'random', 'user'] as const).map((mode) => (
        <label key={mode} style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <input
            type="radio"
            name={`selection-${noun}`}
            checked={value.mode === mode}
            onChange={() => onChange(settled({ mode, pick: value.pick }, options.map((option) => option.value)))}
          />
          <span>{MODE_LABEL[mode]}</span>
          {mode === 'random' ? <span style={muted}>a new one at every photo, never the same twice in a row</span> : null}
          {mode === 'editor' && value.mode === 'editor' ? (
            <select
              aria-label={`The ${noun.toLowerCase()} users get`}
              value={value.pick ?? ''}
              onChange={(event) => onChange({ mode: 'editor', pick: event.currentTarget.value })}
              style={{ minHeight: 32, maxWidth: '100%' }}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
        </label>
      ))}
    </fieldset>
  );
}

export default function FrameSelectionPanel({ eventId }: { eventId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<FrameSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; title: string; message: string } | null>(null);

  const endpoint = `/api/admin/events/${eventId}/frame-selection`;

  useEffect(() => {
    let cancelled = false;
    call<Loaded>(endpoint)
      .then((data) => {
        if (cancelled) return;
        setLoaded(data);
        setDraft(data.selection ?? data.today);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load the selection');
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  if (loadError) return <InlineAlert title="The selection could not be loaded" message={loadError} severity="error" />;
  if (!loaded || !draft) return <StateBlock variant="loading" title="Loading the selection..." />;

  const layoutOptions = loaded.layouts.map((layout) => ({ value: layout.id, label: layout.name }));
  const messageOptions = loaded.messages.map((message) => ({ value: message.text, label: message.shown }));
  const choosesLayout = loaded.layouts.length > 1;
  const choosesMessage = loaded.messages.length > 1;
  const saved = loaded.selection ?? loaded.today;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async (selection: FrameSelection | null) => {
    setBusy(true);
    setNotice(null);
    try {
      const data = await call<Loaded>(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selection }) });
      setLoaded(data);
      setDraft(data.selection ?? data.today);
      setNotice({
        severity: 'success',
        title: selection ? 'Saved' : 'Back to as before',
        message: selection ? 'Users of this event get the layout and the message the way you set.' : 'This event does what it did before the setting existed.',
      });
    } catch (error) {
      setNotice({ severity: 'error', title: 'Not saved', message: error instanceof Error ? error.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="frame-selection-title" style={section}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <h3 id="frame-selection-title" style={{ margin: 0 }}>
          How users get the layout and the message
        </h3>
        <p style={{ ...muted, margin: '0.5rem 0 0' }}>{SITUATION_TEXT[loaded.situation]}</p>
      </div>
      <div style={{ display: 'grid', gap: '1.25rem', padding: '1rem 1.5rem 1.5rem' }}>
        {notice ? (
          <div role="status">
            <InlineAlert title={notice.title} message={notice.message} severity={notice.severity} />
          </div>
        ) : null}

        <div>
          <h4 style={{ margin: '0 0 0.5rem' }}>The layouts ({loaded.layouts.length})</h4>
          <ul style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', listStyle: 'none', margin: 0, padding: 0 }}>
            {loaded.layouts.map((layout) => (
              <li key={layout.id} style={{ display: 'grid', gap: '0.25rem' }}>
                <AssetThumbnail url={layout.previewUrl} name={layout.name} noun="layout" width="100%" />
                <span style={{ fontSize: '0.875rem' }}>
                  {layout.name}
                  {draft.layout.mode === 'editor' && draft.layout.pick === layout.id ? ' · chosen for users' : ''}
                </span>
              </li>
            ))}
          </ul>
          {loaded.messages.length > 0 ? (
            <p style={{ ...muted, margin: '0.5rem 0 0' }}>
              {loaded.messages.length} {loaded.messages.length === 1 ? 'message' : 'messages'}: {loaded.messages.map((message) => message.shown).join(' · ')}
            </p>
          ) : null}
        </div>

        {!choosesLayout && !choosesMessage ? (
          <p style={{ ...muted, margin: 0 }}>
            There is nothing to choose between: one layout and at most one message. Add a second layout (a frame) or a second message and the choice appears here.
          </p>
        ) : (
          <>
            {choosesLayout ? (
              <PartEditor noun="Layout" value={draft.layout} options={layoutOptions} disabled={busy} onChange={(layout) => setDraft({ ...draft, layout })} />
            ) : null}
            {choosesMessage ? (
              <PartEditor noun="Message" value={draft.message} options={messageOptions} disabled={busy} onChange={(message) => setDraft({ ...draft, message })} />
            ) : null}
            {choosesLayout && choosesMessage && draft.layout.mode === 'user' && draft.message.mode === 'user' ? (
              <p style={{ ...muted, margin: 0 }}>The user picks the design first and the message second, and then takes the photo.</p>
            ) : null}
            <Group gap="xs" wrap="wrap">
              <Button type="button" size="xs" loading={busy} disabled={busy || !dirty} onClick={() => void save(draft)}>
                Save
              </Button>
              <Button type="button" variant="light" size="xs" disabled={busy || !dirty} onClick={() => setDraft(saved)}>
                Discard changes
              </Button>
              <Button type="button" variant="light" size="xs" disabled={busy || !loaded.selection} onClick={() => void save(null)}>
                Back to as before
              </Button>
            </Group>
            <p style={{ ...muted, margin: 0 }}>
              {loaded.selection
                ? 'This setting is saved for the event.'
                : 'Nothing is saved yet: this is what the event does today, and it stays so until you save.'}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
