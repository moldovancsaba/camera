'use client';

/**
 * The stage of an event's default slideshow (issue 326, plan items 1, 9, 10 and 49; lib/screen/stage-redraw.ts): the picture the welcome page screen and the giant screen are built on. A new event's stage
 * is drawn on a stadium background of the library (the event's own, its partner's, else a random global one, picked once and kept) in the event's colours, or, with none in the library, drawn by code in
 * the event's colours as it always was. An event that exists keeps the stage it has: **Draw the stage again** draws it on what the event uses now (after choosing its own stadium background below, or
 * when the library got one) and **Pick another** takes another of them. A stage picture an editor chose in the slideshow editor is never touched, and the card says so.
 */

import { useCallback, useEffect, useState } from 'react';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import TaggedSlotPanel from '@/components/admin/TaggedSlotPanel';

interface State {
  slideshowId: string | null;
  generated: boolean;
  pick: { id: string; name: string; imageUrl: string | null } | null;
  available: number;
  overlayUrl: string | null;
}

interface Payload<T> {
  data?: T;
  error?: string;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as Payload<T> | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data;
}

const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;

export default function DefaultStageCard({ eventId }: { eventId: string }) {
  const base = `/api/admin/events/${eventId}/stage-background`;
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState(await call<State>(base));
  }, [base]);

  useEffect(() => {
    load().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'The stage could not be loaded'));
  }, [load]);

  const draw = async (again: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const before = state?.overlayUrl ?? null;
      const next = await call<State>(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ again }) });
      setState(next);
      setNotice(next.overlayUrl === before ? 'The stage is already drawn on what the event uses: nothing changed.' : 'The stage was drawn again. Screens that are open reload to show it.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The stage could not be drawn');
    } finally {
      setBusy(false);
    }
  };

  if (!state) return error ? <InlineAlert title="The stage could not be loaded" message={error} severity="error" /> : null;
  if (!state.slideshowId) return null;

  return (
    <div style={{ borderBottom: '1px solid var(--mantine-color-default-border)', display: 'grid', gap: '1rem', padding: '1rem 1.5rem' }} data-default-stage>
      <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        {state.overlayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.overlayUrl} alt="The stage of the default slideshow" width={288} height={162} style={{ background: 'var(--mantine-color-gray-3)', border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', height: 'auto', maxWidth: '100%' }} />
        ) : null}
        <div style={{ display: 'grid', flex: '1 1 16rem', gap: '0.5rem' }}>
          <strong>Default stage</strong>
          {state.generated ? (
            <>
              <span style={muted}>
                {state.pick
                  ? `The stage is drawn on the stadium background "${state.pick.name}", with the event’s colours over it. It was picked once and is kept, so the stage does not change by itself.`
                  : 'The stage is drawn by code in the event’s colours: a night stadium with the panels for the QR code and the address. A stadium background of the library replaces that background when the event uses one.'}
                {state.available === 0 ? ' There is no stadium background to use yet.' : ` ${state.available} stadium background${state.available === 1 ? '' : 's'} to use.`}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <SemanticButton action="slideshows:draw-stage" variant="secondary" size="xs" loading={busy} disabled={busy} onClick={() => void draw(false)}>
                  Draw the stage again
                </SemanticButton>
                <SemanticButton action="slideshows:pick-another-background" variant="secondary" size="xs" loading={busy} disabled={busy || state.available < 2} onClick={() => void draw(true)}>
                  Pick another
                </SemanticButton>
              </div>
            </>
          ) : (
            <span style={muted}>This slideshow has a stage picture of its own (chosen in the slideshow editor), so a stadium background does not apply to it. Nothing here changes it.</span>
          )}
        </div>
      </div>
      {error ? <InlineAlert title="That did not work" message={error} severity="error" /> : null}
      {notice ? <InlineAlert title="Done" message={notice} severity="info" /> : null}
      {state.generated ? <TaggedSlotPanel kind="stadium" level="event" id={eventId} onChanged={() => draw(false)} /> : null}
    </div>
  );
}
