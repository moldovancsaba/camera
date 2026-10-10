'use client';

/**
 * The welcome page screen of an event (issue 327, issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md): the picture drawn from the default slideshow, and **what shows in its photo window**: the
 * event's sample selfie (the default; one of what the event uses, picked once and kept, with **Pick another**) or the drawn stand-in. The sample selfies themselves are chosen with the same
 * panel as the logo (use the default, choose, upload, add more, replace): until the event chooses, it follows its partner, which follows the global ones. A choice saves and draws the
 * picture again in one press (`PUT /api/admin/events/<id>/welcome-window`).
 */

import { useCallback, useEffect, useState } from 'react';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import SampleSelfiePanel from '@/components/admin/SampleSelfiePanel';

interface PhotoView {
  id: string;
  imageUrl: string;
  kind: 'clean' | 'framed';
}

interface State {
  source: 'selfie' | 'photo' | 'standin';
  photo: (PhotoView & { usable: boolean }) | null;
  pick: { id: string; name: string; imageUrl: string | null } | null;
  welcomeScreen: { url: string; generatedAt: string } | null;
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

const OPTION = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', display: 'grid', gap: '0.5rem', padding: '0.75rem' } as const;
const CHOSEN = { ...OPTION, border: '2px solid var(--mantine-color-blue-filled)' } as const;

export default function WelcomeScreenCard({ eventId, initial }: { eventId: string; initial?: { url: string; generatedAt: string } | null }) {
  const base = `/api/admin/events/${eventId}/welcome-window`;
  const [state, setState] = useState<State | null>(initial ? { source: 'selfie', photo: null, pick: null, welcomeScreen: initial } : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<PhotoView[] | null>(null);
  const [choosing, setChoosing] = useState(false);

  const load = useCallback(async () => {
    setState(await call<State>(base));
  }, [base]);

  useEffect(() => {
    load().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : 'The welcome page screen could not be loaded'));
  }, [load]);

  const act = async (body: { source?: 'selfie' | 'photo' | 'standin'; photoId?: string; again?: boolean }) => {
    setBusy(true);
    setError(null);
    try {
      setState(await call<State>(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The welcome page screen could not be drawn');
    } finally {
      setBusy(false);
    }
  };

  const openPhotos = async () => {
    setChoosing(true);
    setError(null);
    try {
      setPhotos((await call<{ photos: PhotoView[] }>(`/api/admin/events/${eventId}/welcome-photos`)).photos);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The photos could not be loaded');
    }
  };

  const source = state?.source ?? 'selfie';
  const screen = state?.welcomeScreen ?? null;

  return (
    <div style={{ borderBottom: '1px solid var(--mantine-color-default-border)', display: 'grid', gap: '1rem', padding: '1rem 1.5rem' }}>
      <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        {screen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={screen.url} alt="The welcome page screen drawn from the default slideshow" width={288} height={162} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', height: 'auto', maxWidth: '100%' }} />
        ) : null}
        <div style={{ flex: '1 1 16rem' }}>
          <strong>Welcome page screen</strong>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.25rem 0 0.75rem' }}>
            {screen
              ? `Drawn from the default slideshow on ${new Date(screen.generatedAt).toLocaleDateString()}. It is drawn again every time the default slideshow is saved or you change what shows in the photo window.`
              : 'The picture of the giant screen the welcome page shows, drawn from the default slideshow. Not drawn yet; it is drawn when you save the default slideshow or press Draw it.'}
          </p>
          <SemanticButton action="slideshows:draw-welcome-screen" variant="secondary" size="xs" loading={busy} disabled={busy} onClick={() => void act({})}>
            {screen ? 'Draw it again' : 'Draw the welcome page screen'}
          </SemanticButton>
        </div>
      </div>

      {error ? <InlineAlert title="That did not work" message={error} severity="error" /> : null}

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <strong>What shows in the photo window</strong>
        <div style={source === 'selfie' ? CHOSEN : OPTION}>
          <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
            <input type="radio" name="welcome-window" checked={source === 'selfie'} disabled={busy} onChange={() => void act({ source: 'selfie' })} />
            Sample selfie
          </label>
          <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }}>
            One of the event’s sample selfies, with the event’s frame over it. It is picked once and kept, so the picture does not change by itself.
            {state?.pick ? ` Picked now: ${state.pick.name}.` : source === 'selfie' ? ' None is picked yet: there is no sample selfie to use, so the stand-in is drawn.' : ''}
          </span>
          {source === 'selfie' ? (
            <div>
              <SemanticButton action="slideshows:pick-another-selfie" variant="secondary" size="xs" loading={busy} disabled={busy || !state?.pick} onClick={() => void act({ again: true })}>
                Pick another
              </SemanticButton>
            </div>
          ) : null}
        </div>
        <div style={source === 'photo' ? CHOSEN : OPTION}>
          <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
            <input type="radio" name="welcome-window" checked={source === 'photo'} disabled={busy} onChange={() => void openPhotos()} />
            A photo of this event
          </label>
          <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }}>
            A photo from the gallery: your own uploads first (drawn with the event’s frame), then approved photos (drawn as they are, with no second frame).
            {source === 'photo' && state?.photo && !state.photo.usable ? ' The chosen photo can no longer be shown (not approved, hidden or removed), so a sample selfie is used instead.' : ''}
          </span>
          {source === 'photo' && state?.photo?.usable ? (
            <div style={{ alignItems: 'center', display: 'flex', gap: '0.75rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.photo.imageUrl} alt="The chosen photo" width={96} height={96} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', height: 'auto', maxWidth: '100%' }} />
              <span style={{ fontSize: '0.8125rem' }}>{state.photo.kind === 'clean' ? 'Your upload (clean)' : 'An approved photo'}</span>
            </div>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <SemanticButton action="slideshows:choose-welcome-photo" variant="secondary" size="xs" disabled={busy} onClick={() => void (choosing ? setChoosing(false) : openPhotos())}>
              Choose from the gallery
            </SemanticButton>
          </div>
          {choosing ? (
            photos === null ? (
              <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }}>Loading the photos...</span>
            ) : photos.length === 0 ? (
              <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }}>This event has no photo that can be shown yet. Upload one in the gallery, or wait for an approved photo.</span>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 110px), 1fr))' }}>
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    disabled={busy}
                    aria-label={photo.kind === 'clean' ? 'Use this uploaded photo' : 'Use this approved photo'}
                    onClick={() => {
                      setChoosing(false);
                      void act({ source: 'photo', photoId: photo.id });
                    }}
                    style={{ background: 'none', border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', cursor: 'pointer', display: 'grid', gap: '0.25rem', padding: '0.25rem' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.imageUrl} alt="" width={110} height={110} loading="lazy" style={{ borderRadius: '0.25rem', height: 'auto', maxWidth: '100%' }} />
                    <span style={{ fontSize: '0.75rem' }}>{photo.kind === 'clean' ? 'Clean upload' : 'Approved'}</span>
                  </button>
                ))}
              </div>
            )
          ) : null}
        </div>
        <div style={source === 'standin' ? CHOSEN : OPTION}>
          <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
            <input type="radio" name="welcome-window" checked={source === 'standin'} disabled={busy} onChange={() => void act({ source: 'standin' })} />
            Keep the stand-in
          </label>
          <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }}>The drawn head and shoulders in the event’s colours, as before. No sample selfie is used.</span>
        </div>
      </div>

      {source === 'selfie' ? <SampleSelfiePanel level="event" id={eventId} onChanged={() => act({})} /> : null}
    </div>
  );
}
