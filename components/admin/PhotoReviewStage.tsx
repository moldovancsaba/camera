'use client';

/**
 * The one-screen vetting review (issue 628, owner request 2026-10-12; first built as the big view of issue 542): ONE photo at a time, as big as the screen allows, with everything needed to decide it
 * on the same screen and no phases. **Press and drag on the photo, at any time, to draw a rectangle: that makes a new person** and selects it; its gender and age (required), emotion and items
 * are plain text buttons beside the photo (under it on a narrow screen), in the words of the event's vocabulary (lib/photo-vetting/vocabulary.ts). A tap, or a sliver under 2 % a side, makes
 * nothing; a tap on a rectangle selects that person. "Nobody in this photo" counts as looking when the list is empty. **Approve** is open when every person is complete and there is somebody
 * or "nobody"; **Reject** opens "Why is it rejected?" (one or more reasons, an optional note) and its confirmation needs the same marking (rejected photos are annotated too, owner answer 453) and
 * a reason. Pressing either does one thing: save the people (`PUT .../people`), then decide (`POST .../review`), then move to the next waiting photo; if the save fails the photo is not decided.
 * With marking switched off for the event the screen is the photo, the reasons and the decision. The rules live in lib/photo-vetting/review-state.ts (unit-tested); this file only draws and calls
 * them. Drawing needs a mouse or a finger: there is no keyboard way to draw a rectangle yet.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import styles from '@/components/admin/PhotoReviewStage.module.css';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { Button } from '@/components/gds/PublicPrimitives';
import { ChoiceChips, RejectReasonPicker } from '@/components/admin/ReviewChoices';
import { WAITING_REFRESH_MS, shouldRefreshWaiting } from '@/lib/photo-vetting/auto-refresh';
import { MAX_PEOPLE, RECTANGLE_COLOURS, type PersonBox } from '@/lib/photo-vetting/people';
import type { PhotoQueueItem } from '@/lib/photo-vetting/queue';
import {
  MIN_SIDE_PERCENT,
  PERSON_GROUPS,
  addPerson,
  boxBetween,
  canApprove,
  canReject,
  chooseOption,
  chosenReasons,
  describePerson,
  groupHeading,
  isComplete,
  decisionNotice,
  isRectangle,
  newPersonId,
  peopleToSave,
  personAt,
  removePerson,
  selectPerson,
  setNobody,
  startDraft,
  toggleReason,
  whatIsMissing,
  type DecisionNotice,
  type PersonGroup,
  type Point,
  type ReviewDraft,
} from '@/lib/photo-vetting/review-state';
import { GROUPS, optionsOf, type ResolvedVocabulary } from '@/lib/photo-vetting/vocabulary';

interface Props {
  eventId: string;
  items: PhotoQueueItem[];
  /** The words of the event (the standard list under the general, partner and event levels). */
  vocabulary: ResolvedVocabulary;
  /** The event asks for the people to be marked before a decision. */
  markPeople: boolean;
  /** Drawn inside the event's Vetting tab, not as a page of its own: the empty state has no way back to link to. */
  embedded?: boolean;
}

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

const colourOf = (position: number) => RECTANGLE_COLOURS[position % RECTANGLE_COLOURS.length];

/** A rectangle over the photo: solid when the person is complete, dashed when gender or age is missing, thick and ringed when selected. A thin dark line outside keeps it visible on a bright photo. */
const rectangleStyle = (box: PersonBox, colour: string, { selected = false, complete = true }: { selected?: boolean; complete?: boolean } = {}) =>
  ({
    position: 'absolute',
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.w}%`,
    height: `${box.h}%`,
    border: `${selected ? 4 : 2}px ${complete ? 'solid' : 'dashed'} ${colour}`,
    boxSizing: 'border-box',
    boxShadow: selected ? '0 0 0 2px var(--mantine-color-white), 0 0 0 3px color-mix(in srgb, var(--mantine-color-black) 55%, transparent)' : '0 0 0 1px color-mix(in srgb, var(--mantine-color-black) 55%, transparent)',
    pointerEvents: 'none',
  }) as const;

const SECTION = { display: 'grid', gap: '0.5rem' } as const;
const HEADING = { fontSize: '0.9375rem', margin: 0 } as const;
const DIMMED = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', margin: 0 } as const;
const BUTTON_ROW = { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' } as const;
/** The three buttons of the decision bar share one row on a phone. */
const DECISION_BUTTON = { root: { paddingInline: '0.75rem' } } as const;

interface WorkspaceProps {
  item: PhotoQueueItem;
  position: number;
  total: number;
  vocabulary: ResolvedVocabulary;
  markPeople: boolean;
  canSkip: boolean;
  notice: DecisionNotice | null;
  onDecided: (id: string, notice: DecisionNotice) => void;
  onSkip: (id: string) => void;
  onWorking: (working: boolean) => void;
}

/** One photo and everything done to it. The parent keys it by the photo, so every new photo starts clean. */
function PhotoWorkspace({ item, position, total, vocabulary, markPeople, canSkip, notice, onDecided, onSkip, onWorking }: WorkspaceProps) {
  const [draft, setDraft] = useState<ReviewDraft>(() => startDraft({ people: item.people, peopleMarked: item.peopleMarked }, vocabulary));
  const [drawing, setDrawing] = useState<PersonBox | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const overlay = useRef<HTMLDivElement | null>(null);
  const start = useRef<Point | null>(null);
  const rejectBlock = useRef<HTMLDivElement | null>(null);
  // The reasons open above the decision bar: bring them into view when they open (the bar covers the bottom edge, which the CSS accounts for).
  useEffect(() => {
    if (rejecting) rejectBlock.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [rejecting]);

  const toPercent = useCallback((event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = overlay.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const clamp = (value: number) => Math.min(100, Math.max(0, value));
    return { x: clamp(((event.clientX - rect.left) / rect.width) * 100), y: clamp(((event.clientY - rect.top) / rect.height) * 100) };
  }, []);

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!markPeople || busy || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = toPercent(event);
    setDrawing({ ...start.current, w: 0, h: 0 });
  };
  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current) setDrawing(boxBetween(start.current, toPercent(event)));
  };
  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const end = toPercent(event);
    const box = boxBetween(start.current, end);
    start.current = null;
    setDrawing(null);
    if (isRectangle(box)) setDraft((current) => addPerson(current, box, newPersonId()));
    // A tap (it hardly moved) selects the person under it; a sliver drawn in one direction makes nothing.
    else if (box.w < MIN_SIDE_PERCENT && box.h < MIN_SIDE_PERCENT) setDraft((current) => selectPerson(current, personAt(current.people, end) ?? current.selectedId));
  };
  const onCancel = () => {
    start.current = null;
    setDrawing(null);
  };

  const selected = draft.people.find((person) => person.id === draft.selectedId) ?? null;
  const selectedPosition = selected ? draft.people.indexOf(selected) : -1;
  const full = draft.people.length >= MAX_PEOPLE;
  const missing = whatIsMissing(draft, vocabulary, markPeople);
  const approveOk = canApprove(draft, vocabulary, markPeople);
  const rejectOk = canReject(draft, vocabulary, markPeople, reasons);
  const hint = busy ? 'Saving…' : rejecting ? (missing ?? (chosenReasons(reasons, vocabulary).length === 0 ? 'Choose at least one reason.' : null)) : missing;

  /** One press, one thing for the user: save the people, then decide, then the next photo. If the save fails nothing is decided. */
  const decide = async (action: 'approve' | 'reject') => {
    if (busy) return;
    setBusy(action);
    onWorking(true);
    setError(null);
    try {
      if (markPeople) {
        try {
          await send(`/api/admin/submissions/${item.id}/people`, 'PUT', { people: peopleToSave(draft) });
        } catch (failure) {
          setError(`The people could not be saved, so the photo was not ${action === 'approve' ? 'approved' : 'rejected'}. ${failure instanceof Error ? failure.message : ''}`.trim());
          return;
        }
      }
      let answer: Record<string, unknown> = {};
      try {
        const body = action === 'approve' ? { action } : { action, reasons: chosenReasons(reasons, vocabulary), ...(note.trim() ? { reason: note.trim() } : {}) };
        answer = await send(`/api/admin/submissions/${item.id}/review`, 'POST', body);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'The decision could not be saved');
        return;
      }
      onDecided(item.id, decisionNotice(action, answer.email));
    } finally {
      setBusy(null);
      onWorking(false);
    }
  };

  const nextColour = colourOf(draft.people.length);
  const groupSelection = (group: PersonGroup): string[] => {
    if (!selected) return [];
    if (group === 'merch') return selected.merch ?? [];
    const value = selected[group];
    return value ? [value] : [];
  };

  return (
    <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 1400 }} data-photo-review-stage>
      <div style={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.75rem', justifyContent: 'space-between' }}>
        <strong data-review-position>
          Photo {position} of {total} waiting
        </strong>
        {item.email ? <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', overflowWrap: 'anywhere' }}>{item.email}</span> : null}
      </div>
      <p style={DIMMED} data-review-help>
        {markPeople
          ? '1. Draw a rectangle around each person. 2. Choose gender and age. Add emotion and items if you can. 3. Approve or reject.'
          : 'Look at the photo, then approve or reject it. A rejection needs a reason.'}
      </p>
      {notice ? (
        <p role="status" style={{ color: notice.warning ? 'var(--mantine-color-orange-text)' : 'var(--mantine-color-teal-text)', fontSize: '0.8125rem', fontWeight: 600, margin: 0 }} data-review-notice>
          {notice.text}
        </p>
      ) : null}
      {error ? <InlineAlert title="That did not work" message={error} severity="error" /> : null}

      <div className={styles.layout}>
        {/* The photo is as big as the screen allows: never taller than the screen leaves room for, so the buttons stay in view while the reviewer draws (also on a phone held sideways). The wrapper shrinks to the
            picture, so the overlay that takes the drawing, and the rectangles in percent, are exactly the photo. */}
        <div className={styles.photoColumn}>
          <div style={{ background: 'var(--mantine-color-gray-1)', display: 'inline-block', lineHeight: 0, maxWidth: '100%', position: 'relative', userSelect: 'none' }}>
            {item.photoUrl ? (
              <Image src={item.photoUrl} alt={`Photo ${position} of ${total} waiting`} width={1600} height={900} unoptimized priority draggable={false} style={{ display: 'block', height: 'auto', maxHeight: 'calc(100vh - 12rem)', maxWidth: '100%', width: 'auto' }} />
            ) : (
              <div style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', color: 'var(--mantine-color-dimmed)', width: '30rem', maxWidth: '100%' }}>No photo</div>
            )}
            <div
              ref={overlay}
              role="group"
              aria-label={markPeople ? 'The photo. Press and drag to draw a rectangle around a person.' : 'The photo'}
              data-photo-overlay
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
              style={{ cursor: markPeople && !busy ? 'crosshair' : 'default', inset: 0, position: 'absolute', touchAction: markPeople ? 'none' : 'auto' }}
            >
              {draft.people.map((person, index) => {
                const colour = colourOf(index);
                return (
                  <div key={person.id} data-person-box={person.id} data-selected={person.id === draft.selectedId} data-complete={isComplete(person, vocabulary)} style={rectangleStyle(person.box, colour, { selected: person.id === draft.selectedId, complete: isComplete(person, vocabulary) })}>
                    <span aria-hidden style={{ background: colour, borderRadius: '0.25rem', color: 'var(--mantine-color-dark-9)', fontSize: '0.8125rem', fontWeight: 700, left: 2, lineHeight: 1.3, padding: '0 0.3rem', position: 'absolute', top: 2 }}>
                      {index + 1}
                    </span>
                  </div>
                );
              })}
              {drawing ? <div data-drawing-box style={{ ...rectangleStyle(drawing, nextColour, { complete: false }), border: `3px dotted ${nextColour}` }} /> : null}
            </div>
          </div>
        </div>

        <aside aria-label="Describe the photo and decide" className={styles.panel} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem' }} data-review-panel>
          {markPeople ? (
            <>
              <section style={SECTION} aria-labelledby="people-heading">
                <h3 id="people-heading" style={HEADING}>
                  People in this photo ({draft.people.length})
                </h3>
                {draft.people.length === 0 ? (
                  <p style={DIMMED}>Press and drag on the photo to draw a rectangle around a person.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.375rem' }} data-people-list>
                    {draft.people.map((person, index) => {
                      const described = describePerson(person, vocabulary);
                      const on = person.id === draft.selectedId;
                      return (
                        <Button
                          key={person.id}
                          type="button"
                          fullWidth
                          justify="flex-start"
                          variant={on ? 'light' : 'default'}
                          aria-pressed={on}
                          disabled={busy !== null}
                          onClick={() => setDraft((current) => selectPerson(current, person.id))}
                          leftSection={<span aria-hidden style={{ background: colourOf(index), borderRadius: '0.25rem', display: 'inline-block', height: '1rem', width: '1rem' }} />}
                          styles={{ root: { height: 'auto', minHeight: '2.5rem', paddingBlock: '0.375rem' }, label: { lineHeight: 1.3, textAlign: 'left', whiteSpace: 'normal' } }}
                          data-person-row={person.id}
                          data-complete={described.complete}
                        >
                          <span>
                            <strong>{`Person ${index + 1}`}</strong>
                            {': '}
                            {described.complete ? described.text : <span style={{ color: 'var(--mantine-color-red-text)', fontWeight: 600 }}>{described.text}</span>}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                )}
                {full ? <p style={DIMMED}>{`At most ${MAX_PEOPLE} people can be marked in a photo.`}</p> : null}
              </section>

              {selected ? (
                <section style={{ ...SECTION, gap: '0.875rem' }} aria-label={`Person ${selectedPosition + 1}`} data-person-panel={selected.id}>
                  <h3 style={HEADING}>Person {selectedPosition + 1}</h3>
                  {PERSON_GROUPS.map((group) => {
                    const options = optionsOf(vocabulary, group);
                    if (options.length === 0) {
                      return GROUPS[group].required ? (
                        <p key={group} style={DIMMED}>{`No ${GROUPS[group].label.toLowerCase()} is offered for this event, so a person cannot be completed. Ask an admin to switch one on.`}</p>
                      ) : null;
                    }
                    return (
                      <ChoiceChips
                        key={group}
                        heading={groupHeading(group)}
                        options={options}
                        selected={groupSelection(group)}
                        onToggle={(key) => setDraft((current) => chooseOption(current, selected.id, group, key, vocabulary))}
                        disabled={busy !== null}
                      />
                    );
                  })}
                  <div style={BUTTON_ROW}>
                    <SemanticButton action="photo-review:mark-remove" type="button" variant="secondary" disabled={busy !== null} onClick={() => setDraft((current) => removePerson(current, selected.id))}>
                      Remove person
                    </SemanticButton>
                  </div>
                </section>
              ) : draft.people.length > 0 ? (
                <p style={DIMMED}>Choose a person in the list, or tap a rectangle on the photo, to describe them.</p>
              ) : null}

              <div style={{ display: 'grid', gap: '0.375rem' }}>
                <Button type="button" variant={draft.nobody ? 'filled' : 'light'} aria-pressed={draft.nobody} disabled={draft.people.length > 0 || busy !== null} onClick={() => setDraft((current) => setNobody(current, !current.nobody))} data-nobody>
                  Nobody in this photo
                </Button>
              </div>
            </>
          ) : null}

          {/* The reasons of a rejection come above the decision bar, so the bar (Approve, Reject, Skip) stays where it is. */}
          {rejecting ? (
            <div ref={rejectBlock} className={styles.rejectBlock} style={{ display: 'grid', gap: '0.75rem' }} data-reject-block>
              <RejectReasonPicker vocabulary={vocabulary} reasons={reasons} onToggleReason={(key) => setReasons((current) => toggleReason(current, key))} note={note} onNote={setNote} disabled={busy !== null} />
              <div style={BUTTON_ROW}>
                <SemanticButton action="photo-review:confirm-reject" type="button" color="red.8" disabled={!rejectOk || busy !== null} loading={busy === 'reject'} onClick={() => void decide('reject')}>
                  Confirm reject
                </SemanticButton>
                <SemanticButton action="photo-review:cancel-reject" type="button" variant="outline" disabled={busy !== null} onClick={() => setRejecting(false)}>
                  Cancel
                </SemanticButton>
              </div>
            </div>
          ) : null}

          {/* The decision is always on the screen: this bar sticks to the bottom of the window while the panel is longer than the window. */}
          <section className={styles.decision} aria-label="Decision" data-decision>
            <p role="status" aria-live="polite" style={{ ...DIMMED, minHeight: '1.25rem' }} data-decision-hint>
              {hint}
            </p>
            <div style={BUTTON_ROW}>
              <SemanticButton action="photo-review:approve" type="button" color="green.8" styles={DECISION_BUTTON} disabled={!approveOk || busy !== null} loading={busy === 'approve'} onClick={() => void decide('approve')}>
                Approve
              </SemanticButton>
              <SemanticButton action="photo-review:reject" type="button" color="red.8" styles={DECISION_BUTTON} aria-expanded={rejecting} disabled={busy !== null} onClick={() => setRejecting((open) => !open)}>
                Reject
              </SemanticButton>
              <SemanticButton action="photo-review:mark-skip" type="button" variant="outline" styles={DECISION_BUTTON} disabled={busy !== null || !canSkip} onClick={() => onSkip(item.id)}>
                Skip for now
              </SemanticButton>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function PhotoReviewStage({ eventId, items, vocabulary, markPeople, embedded = false }: Props) {
  const router = useRouter();
  // Photos decided here leave the queue at once (the server list catches up after router.refresh()); a photo skipped goes to the back and comes round again.
  const [decided, setDecided] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
  const [working, setWorking] = useState(false);

  const waiting = useMemo(() => {
    const open = items.filter((item) => !decided.includes(item.id));
    const later = skipped.flatMap((id) => open.filter((item) => item.id === id));
    return [...open.filter((item) => !skipped.includes(item.id)), ...later];
  }, [items, decided, skipped]);
  const item = waiting[0];

  // The screen asks the server for new photos by itself (as the Waiting list always did, camera#373), so an approver at the match does not reload the page; not while a decision is in flight.
  useEffect(() => {
    const timer = setInterval(() => {
      if (shouldRefreshWaiting({ status: 'pending_review', hidden: document.visibilityState === 'hidden', deciding: working, rejecting: false })) router.refresh();
    }, WAITING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [working, router]);

  const onDecided = useCallback(
    (id: string, message: DecisionNotice) => {
      setDecided((current) => [...current, id]);
      setNotice(message);
      router.refresh();
    },
    [router],
  );
  const onSkip = useCallback((id: string) => {
    setNotice(null);
    setSkipped((current) => [...current.filter((other) => other !== id), id]);
  }, []);

  if (!item) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }} data-photo-review-empty>
        {notice ? <InlineAlert title="Done" message={notice.text} severity={notice.warning ? 'warning' : 'success'} /> : null}
        <StateBlock variant="empty" title={items.length === 0 ? 'Nothing is waiting' : 'All the photos are decided'} description="New photos of this event appear here until they are approved or rejected. This page looks for new photos by itself every 10 seconds." />
        {embedded ? null : <Link href={`/admin/events/${eventId}/vetting`}>Back to the Vetting tab</Link>}
      </div>
    );
  }

  return (
    <PhotoWorkspace
      key={item.id}
      item={item}
      position={decided.length + 1}
      total={decided.length + waiting.length}
      vocabulary={vocabulary}
      markPeople={markPeople}
      canSkip={waiting.length > 1}
      notice={notice}
      onDecided={onDecided}
      onSkip={onSkip}
      onWorking={setWorking}
    />
  );
}
