'use client';

/**
 * The vetting view of one photo, big (issue 542, docs/PHOTO_VETTING_PLAN.md; owner request 2026-10-10, six sketches VETTING 1 to 6): the photo fills the screen; **Clicker** starts a mark: the
 * reviewer draws a rectangle around a person (a mouse or a finger), **Next** takes the rectangle, 16 buttons say who it is (one of 8: female or male, kid, young, adult, old), the emotion
 * (one of 4) and any merchandise (any of 4), **Done** keeps the person and **Clicker** marks the next one, until the reviewer has identified what they can; then **Next** goes on to the
 * decision, approve or reject. **Marking is required (owner answer 263): at least one person must be marked, or the reviewer says "Nobody in this photo"; only then Next goes on.** The people are saved with the photo (`PUT /api/admin/submissions/<id>/people`) before the decision and are what the analytics read. The decision is the same
 * call as the queue's (`POST .../review`). With marking switched off for the event the view is only the big photo and the decision. Rectangles are in percent of the photo.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { TextInput } from '@/components/gds/PublicPrimitives';
import { EMOTION_OPTIONS, MERCH_OPTIONS, PERSON_OPTIONS, RECTANGLE_COLOURS, personOption, type Emotion, type Merch, type PersonBox, type PersonOption, type PersonTag } from '@/lib/photo-vetting/people';
import type { PhotoQueueItem } from '@/lib/photo-vetting/queue';

interface Props {
  eventId: string;
  items: PhotoQueueItem[];
  /** The event asks for the people to be marked before the decision. */
  markPeople: boolean;
}

type Phase = 'mark' | 'decide';
type Step = 'idle' | 'drawing' | 'tagging';

const MIN_SIDE_PERCENT = 2;
const ANSWER_TIMEOUT_MS = 120_000;

async function send(url: string, method: 'POST' | 'PUT', body: unknown): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS) });
  } catch {
    throw new Error('No answer arrived from the server. The photo may have been saved anyway; reload the page to see what the server holds.');
  }
  const answer = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown; data?: Record<string, unknown> };
  if (!response.ok) throw new Error(typeof answer.error === 'string' ? answer.error : typeof answer.message === 'string' ? answer.message : `Server error ${response.status}`);
  return answer.data ?? {};
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const newId = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** The rectangle between two points, in percent, inside the photo. */
export function boxBetween(a: { x: number; y: number }, b: { x: number; y: number }): PersonBox {
  const round = (value: number) => Math.round(value * 100) / 100;
  const x = clamp(Math.min(a.x, b.x));
  const y = clamp(Math.min(a.y, b.y));
  return { x: round(x), y: round(y), w: round(clamp(Math.max(a.x, b.x)) - x), h: round(clamp(Math.max(a.y, b.y)) - y) };
}

const rectangleStyle = (box: PersonBox, colour: string, solid = false) =>
  ({ position: 'absolute', left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, border: `3px ${solid ? 'solid' : 'dotted'} ${colour}`, boxSizing: 'border-box', pointerEvents: 'none' }) as const;

/** The 16 buttons are laid over the photo when it is tall enough to hold them (4 rows of 3.25 rem and the gaps, with some room); on a phone held upright they come under the photo instead. */
const GRID_HEIGHT_PX = 270;

/** The look of the 16 buttons, from the design system's variables (as in the reviewers' sketch: blue buttons, the chosen one pale). */
const IDLE = 'var(--mantine-color-blue-6)';
const SELECTED = 'var(--mantine-color-blue-1)';
const BACKDROP = 'color-mix(in srgb, var(--mantine-color-black) 35%, transparent)';

const EMOJI_BUTTON = { alignItems: 'center', borderRadius: '0.75rem', cursor: 'pointer', display: 'flex', fontSize: '1.75rem', height: '3.25rem', justifyContent: 'center', padding: 0, width: '3.25rem' } as const;

export default function PhotoReviewStage({ eventId, items, markPeople }: Props) {
  const [index, setIndex] = useState(0);
  const item = items[index];
  const [phase, setPhase] = useState<Phase>(markPeople ? 'mark' : 'decide');
  const [step, setStep] = useState<Step>('idle');
  const [people, setPeople] = useState<PersonTag[]>(item?.people ?? []);
  const [box, setBox] = useState<PersonBox | null>(null);
  const [person, setPerson] = useState<PersonOption | null>(null);
  const [emotion, setEmotion] = useState<Emotion | null>(null);
  const [merch, setMerch] = useState<Merch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const overlay = useRef<HTMLDivElement | null>(null);
  const [overlayHeight, setOverlayHeight] = useState(0);
  useEffect(() => {
    const node = overlay.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setOverlayHeight(node.getBoundingClientRect().height));
    observer.observe(node);
    setOverlayHeight(node.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, [item]);
  const start = useRef<{ x: number; y: number } | null>(null);

  const toPercent = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = overlay.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return { x: clamp(((event.clientX - rect.left) / rect.width) * 100), y: clamp(((event.clientY - rect.top) / rect.height) * 100) };
  }, []);

  const colourOf = (position: number) => RECTANGLE_COLOURS[position % RECTANGLE_COLOURS.length];
  const drawingColour = colourOf(people.length);

  const nextPhoto = useCallback(() => {
    setIndex((current) => current + 1);
    const following = items[index + 1];
    setPeople(following?.people ?? []);
    setPhase(markPeople ? 'mark' : 'decide');
    setStep('idle');
    setBox(null);
    setPerson(null);
    setEmotion(null);
    setMerch([]);
    setRejecting(false);
    setReason('');
  }, [index, items, markPeople]);

  const resetMark = () => {
    setBox(null);
    setPerson(null);
    setEmotion(null);
    setMerch([]);
    setStep('idle');
  };

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (step !== 'drawing') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = toPercent(event);
    setBox({ ...start.current, w: 0, h: 0 });
  };
  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (step !== 'drawing' || !start.current) return;
    setBox(boxBetween(start.current, toPercent(event)));
  };
  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (step !== 'drawing' || !start.current) return;
    const finished = boxBetween(start.current, toPercent(event));
    start.current = null;
    // A tap or a sliver is not a rectangle: the reviewer draws again.
    setBox(finished.w >= MIN_SIDE_PERCENT && finished.h >= MIN_SIDE_PERCENT ? finished : null);
  };

  const finishPerson = () => {
    if (!box || !person) return;
    setPeople((current) => [...current, { id: newId(), box, gender: person.gender, age: person.age, ...(emotion ? { emotion } : {}), ...(merch.length > 0 ? { merch } : {}) }]);
    resetMark();
  };

  const toDecision = async () => {
    setBusy(true);
    setError(null);
    try {
      await send(`/api/admin/submissions/${item.id}/people`, 'PUT', { people });
      setPhase('decide');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The people could not be saved');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      await send(`/api/admin/submissions/${item.id}/review`, 'POST', { action, ...(action === 'reject' && reason.trim() ? { reason: reason.trim() } : {}) });
      setNotice(action === 'approve' ? 'Photo approved. The user gets the link by email.' : 'Photo rejected. The user gets a short note.');
      nextPhoto();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The decision could not be saved');
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => people.map((p) => `${personOption(p.gender, p.age).emoji}${p.emotion ? EMOTION_OPTIONS.find((o) => o.id === p.emotion)?.emoji : ''}${(p.merch ?? []).map((m) => MERCH_OPTIONS.find((o) => o.id === m)?.emoji ?? '').join('')}`), [people]);

  const gridInside = overlayHeight >= GRID_HEIGHT_PX;
  const tagButtons = (
    <div style={{ display: 'grid', gap: '0.4rem', gridTemplateColumns: 'repeat(4, 3.25rem)' }}>
      {PERSON_OPTIONS.map((option) => (
        <button key={option.id} type="button" aria-label={option.label} aria-pressed={person?.id === option.id} onClick={() => setPerson(option)} style={{ ...EMOJI_BUTTON, background: person?.id === option.id ? SELECTED : IDLE, border: 0 }}>
          {option.emoji}
        </button>
      ))}
      {EMOTION_OPTIONS.map((option) => (
        <button key={option.id} type="button" aria-label={option.label} aria-pressed={emotion === option.id} onClick={() => setEmotion(emotion === option.id ? null : option.id)} style={{ ...EMOJI_BUTTON, background: emotion === option.id ? SELECTED : IDLE, border: 0 }}>
          {option.emoji}
        </button>
      ))}
      {MERCH_OPTIONS.map((option) => (
        <button key={option.id} type="button" aria-label={option.label} aria-pressed={merch.includes(option.id)} onClick={() => setMerch(merch.includes(option.id) ? merch.filter((m) => m !== option.id) : [...merch, option.id])} style={{ ...EMOJI_BUTTON, background: merch.includes(option.id) ? SELECTED : IDLE, border: 0 }}>
          {option.emoji}
        </button>
      ))}
    </div>
  );

  if (!item) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        {notice ? <InlineAlert title="Done" message={notice} severity="success" /> : null}
        <StateBlock variant="empty" title={items.length === 0 ? 'Nothing is waiting' : 'All the photos are decided'} description="New photos appear on the Waiting list of the Vetting tab." />
        <Link href={`/admin/events/${eventId}/vetting`}>Back to the Vetting tab</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 1000 }} data-photo-review-stage>
      <div style={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
        <strong>{phase === 'mark' ? 'Mark the people' : 'Approve or reject'}</strong>
        <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }}>
          Photo {index + 1} of {items.length} waiting
          {item.email ? `, ${item.email}` : ''}
        </span>
      </div>
      {notice ? <InlineAlert title="Done" message={notice} severity="success" /> : null}
      {error ? <InlineAlert title="That did not work" message={error} severity="error" /> : null}

      {/* The photo is as big as the screen allows: it never gets taller than the screen leaves room for, so the buttons stay in view while the reviewer draws (also on a phone held sideways). The wrapper
          shrinks to the picture, so the overlay that takes the drawing and the rectangles in percent is exactly the photo. */}
      <div style={{ display: 'grid', justifyContent: 'center' }}>
      <div style={{ background: 'var(--mantine-color-gray-1)', display: 'inline-block', lineHeight: 0, maxWidth: '100%', position: 'relative', userSelect: 'none' }}>
        {item.photoUrl ? (
          <Image src={item.photoUrl} alt={`Photo ${index + 1} waiting`} width={1600} height={900} unoptimized priority draggable={false} style={{ display: 'block', height: 'auto', maxHeight: 'calc(100vh - 12rem)', maxWidth: '100%', width: 'auto' }} />
        ) : (
          <div style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', color: 'var(--mantine-color-dimmed)', width: '30rem', maxWidth: '100%' }}>No photo</div>
        )}
        <div
          ref={overlay}
          data-photo-overlay
          data-step={step}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          style={{ cursor: step === 'drawing' ? 'crosshair' : 'default', inset: 0, position: 'absolute', touchAction: step === 'drawing' ? 'none' : 'auto' }}
        >
          {people.map((p, position) => (
            <div key={p.id} style={rectangleStyle(p.box, colourOf(position), true)} data-person-box={p.id}>
              <span style={{ background: colourOf(position), borderRadius: '0.25rem', color: 'var(--mantine-color-dark-9)', fontSize: '0.875rem', left: 2, padding: '0 0.25rem', position: 'absolute', top: 2 }}>{personOption(p.gender, p.age).emoji}</span>
            </div>
          ))}
          {box ? <div style={rectangleStyle(box, drawingColour)} data-drawing-box /> : null}

          {step === 'tagging' && gridInside ? (
            <div style={{ alignContent: 'center', background: BACKDROP, display: 'grid', inset: 0, justifyContent: 'center', position: 'absolute' }} data-tag-grid>
              {tagButtons}
            </div>
          ) : null}
        </div>
      </div>
      </div>

      {phase === 'mark' && step === 'tagging' && !gridInside ? (
        <div style={{ display: 'grid', justifyContent: 'center' }} data-tag-grid data-tag-grid-below>
          {tagButtons}
        </div>
      ) : null}

      {phase === 'mark' ? (
        <>
          <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }} data-mark-help>
            {step === 'idle'
              ? people.length === 0
                ? 'Press Clicker, draw a rectangle around a person, then say who it is. Mark everybody you can, then press Next. If nobody is in the photo, press Nobody in this photo.'
                : `${people.length} ${people.length === 1 ? 'person' : 'people'} marked ${summary.join(' ')}. Press Clicker for the next person, or Next to decide.`
              : step === 'drawing'
                ? box
                  ? 'Press Next to say who it is, or Retry to draw again.'
                  : 'Draw a rectangle around one person: press, drag and let go.'
                : person
                  ? 'Add the emotion and any merchandise if you can, then press Done.'
                  : 'First choose who it is: one of the top two rows.'}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {step === 'idle' ? (
              <>
                <SemanticButton action="photo-review:mark-start" type="button" disabled={busy} onClick={() => { setBox(null); setStep('drawing'); }}>
                  Clicker
                </SemanticButton>
                {people.length > 0 ? (
                  <>
                    <SemanticButton action="photo-review:mark-remove" type="button" variant="secondary" disabled={busy} onClick={() => setPeople((current) => current.slice(0, -1))}>
                      Remove
                    </SemanticButton>
                    <SemanticButton action="photo-review:mark-next" type="button" variant="secondary" disabled={busy} onClick={() => void toDecision()}>
                      {busy ? 'Saving…' : 'Next'}
                    </SemanticButton>
                  </>
                ) : (
                  // Marking is required: with nobody marked the way on is to say so, which saves an empty list ("looked, nobody in it").
                  <SemanticButton action="photo-review:mark-nobody" type="button" variant="secondary" disabled={busy} onClick={() => void toDecision()}>
                    {busy ? 'Saving…' : 'Nobody in this photo'}
                  </SemanticButton>
                )}
              </>
            ) : null}
            {step === 'drawing' ? (
              <>
                <SemanticButton action="photo-review:mark-retry" type="button" variant="secondary" disabled={!box} onClick={() => setBox(null)}>
                  Retry
                </SemanticButton>
                <SemanticButton action="photo-review:mark-next" type="button" disabled={!box} onClick={() => setStep('tagging')}>
                  Next
                </SemanticButton>
                <SemanticButton action="photo-review:mark-cancel" type="button" variant="secondary" onClick={resetMark}>
                  Cancel
                </SemanticButton>
              </>
            ) : null}
            {step === 'tagging' ? (
              <>
                <SemanticButton action="photo-review:mark-cancel" type="button" variant="secondary" onClick={resetMark}>
                  Cancel
                </SemanticButton>
                <SemanticButton action="photo-review:mark-done" type="button" disabled={!person} onClick={finishPerson}>
                  Done
                </SemanticButton>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <>
          {markPeople ? (
            <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' }} data-decide-summary>
              {people.length === 0 ? 'Nobody was marked in this photo.' : `${people.length} ${people.length === 1 ? 'person' : 'people'} marked: ${summary.join(' ')}`}
            </span>
          ) : null}
          {rejecting ? <TextInput label="Reason (optional, for the record)" value={reason} onChange={(event) => setReason(event.currentTarget.value)} maxLength={500} disabled={busy} /> : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {rejecting ? (
              <>
                <SemanticButton action="photo-review:confirm-reject" type="button" variant="danger" disabled={busy} onClick={() => void decide('reject')}>
                  {busy ? 'Rejecting…' : 'Confirm reject'}
                </SemanticButton>
                <SemanticButton action="photo-review:cancel-reject" type="button" variant="secondary" disabled={busy} onClick={() => setRejecting(false)}>
                  Cancel
                </SemanticButton>
              </>
            ) : (
              <>
                <SemanticButton action="photo-review:approve" type="button" disabled={busy} onClick={() => void decide('approve')}>
                  {busy ? 'Approving…' : 'Approve'}
                </SemanticButton>
                <SemanticButton action="photo-review:reject" type="button" variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>
                  Reject
                </SemanticButton>
                {markPeople ? (
                  <SemanticButton action="photo-review:mark-back" type="button" variant="secondary" disabled={busy} onClick={() => setPhase('mark')}>
                    Back to the people
                  </SemanticButton>
                ) : null}
                <SemanticButton action="photo-review:mark-skip" type="button" variant="secondary" disabled={busy} onClick={nextPhoto}>
                  Skip this photo
                </SemanticButton>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
