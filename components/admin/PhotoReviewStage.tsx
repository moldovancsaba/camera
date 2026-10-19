'use client';

/**
 * The one-screen vetting and analysis workbench (issue 628, owner request 2026-10-12): ONE photo at a time, as big as the screen allows, with everything needed to decide or analyse it on the same screen. Its analysis-only mode never decides or republishes a photo. **Press and drag on the photo, at any time, to draw a rectangle: that makes a new person** and selects it; its gender and age (required), emotion and items
 * are plain text buttons beside the photo (under it on a narrow screen), in the words of the event's vocabulary (lib/photo-vetting/vocabulary.ts). A tap, or a sliver under 2 % a side, makes
 * nothing; a tap on a rectangle selects that person. "Nobody in this photo" counts as looking when the list is empty. **Approve** is open when every person is complete and there is somebody
 * or "nobody"; **Reject…** opens a separate reason step and does not decide yet. The photo stays in Waiting until at least one reason is selected and **Reject photo** is pressed; the final action also
 * needs the same marking (rejected photos are annotated too, owner answer 453). Pressing either final decision does one thing: save the people (`PUT .../people`), then decide (`POST .../review`), then
 * move to the next waiting photo; if the save fails the photo is not decided.
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
import { ChoiceChips, RejectActionNotice, RejectReasonPicker } from '@/components/admin/ReviewChoices';
import { WAITING_REFRESH_MS, shouldRefreshWaiting } from '@/lib/photo-vetting/auto-refresh';
import { MAX_PEOPLE, RECTANGLE_COLOURS, type PersonBox } from '@/lib/photo-vetting/people';
import type { PhotoAnalysisItem, PhotoQueueItem } from '@/lib/photo-vetting/queue';
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
  items: Array<PhotoQueueItem | PhotoAnalysisItem>;
  /** The words of the event (the standard list under the general, partner and event levels). */
  vocabulary: ResolvedVocabulary;
  /** The event asks for the people to be marked before a decision. */
  markPeople: boolean;
  /** Drawn inside the event's Vetting tab, not as a page of its own: the empty state has no way back to link to. */
  embedded?: boolean;
  /** Analyses a finalized photo without changing its vetting status, visibility or email. */
  analysisOnly?: boolean;
  /** Where a one-photo analysis edit returns after saving. Batch analysis stays in this workbench and advances to the next photo. */
  completionHref?: string;
  /** Total number outstanding when this analysis session began, independent of the 60-photo page size. */
  analysisTotal?: number;
  backHref?: string;
  backLabel?: string;
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
  item: PhotoQueueItem | PhotoAnalysisItem;
  position: number;
  total: number;
  vocabulary: ResolvedVocabulary;
  markPeople: boolean;
  analysisOnly: boolean;
  canSkip: boolean;
  notice: DecisionNotice | null;
  onDecided: (id: string, notice: DecisionNotice) => void;
  onSkip: (id: string) => void;
  onWorking: (working: boolean) => void;
}

/** One photo and everything done to it. The parent keys it by the photo, so every new photo starts clean. */
function PhotoWorkspace({ item, position, total, vocabulary, markPeople, analysisOnly, canSkip, notice, onDecided, onSkip, onWorking }: WorkspaceProps) {
  const [draft, setDraft] = useState<ReviewDraft>(() => startDraft({ people: item.people, peopleMarked: item.peopleMarked }, vocabulary));
  const [drawing, setDrawing] = useState<PersonBox | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [showFanmassBoxes, setShowFanmassBoxes] = useState(() => Boolean(
    item.fanmassAnalysis?.boxes.people.length || item.fanmassAnalysis?.boxes.faces.length,
  ));
  useEffect(() => {
    setShowFanmassBoxes(Boolean(item.fanmassAnalysis?.boxes.people.length || item.fanmassAnalysis?.boxes.faces.length));
  }, [item.id, item.fanmassAnalysis?.analyzedAt]);
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
  const displayPhotoUrl = analysisOnly ? item.analysisPhotoUrl : item.photoUrl;
  const hint = analysisOnly && !displayPhotoUrl
    ? 'The unframed original is unavailable, so analysis cannot be updated.'
    : busy ? 'Saving…' : rejecting ? (missing ?? (chosenReasons(reasons, vocabulary).length === 0 ? 'Choose at least one reason.' : null)) : missing;

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
      onDecided(item.id, decisionNotice(action, answer.email, answer.emailDeferred === true));
    } finally {
      setBusy(null);
      onWorking(false);
    }
  };

  const saveAnalysis = async () => {
    if (busy) return;
    setBusy('save');
    onWorking(true);
    setError(null);
    try {
      await send(`/api/admin/submissions/${item.id}/people`, 'PUT', { people: peopleToSave(draft), analysisOnly: true });
      onDecided(item.id, { text: 'Analysis saved. Vetting and publication status are unchanged.', warning: false });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The analysis could not be saved');
    } finally {
      onWorking(false);
      setBusy(null);
    }
  };

  const nextColour = colourOf(draft.people.length);
  const groupSelection = (group: PersonGroup): string[] => {
    if (!selected) return [];
    if (group === 'merch') return selected.merch ?? [];
    const value = selected[group];
    return value ? [value] : [];
  };
  const fanmassPeopleBoxes = item.fanmassAnalysis?.boxes.people ?? [];
  const fanmassPersonBoxKeys = new Set(fanmassPeopleBoxes.map(({ box }) => `${box.x}:${box.y}:${box.w}:${box.h}`));
  const fanmassFaceBoxes = (item.fanmassAnalysis?.boxes.faces ?? []).filter(({ box }) =>
    !fanmassPersonBoxKeys.has(`${box.x}:${box.y}:${box.w}:${box.h}`),
  );
  const fanmassBoxCount = fanmassPeopleBoxes.length + fanmassFaceBoxes.length;

  return (
    <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 1400 }} data-photo-review-stage>
      <div style={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.75rem', justifyContent: 'space-between' }}>
        <strong data-review-position>
          {analysisOnly ? `${item.peopleMarked ? 'Updating analysis' : 'Photo'} ${position} of ${total}${item.peopleMarked ? '' : ' to analyse'}` : `Photo ${position} of ${total} waiting`}
        </strong>
        <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', overflowWrap: 'anywhere' }}>{item.identityLabel}</span>
      </div>
      {analysisOnly && 'status' in item ? (
        <p style={{ ...DIMMED, fontWeight: 600 }} data-analysis-vetting-status>
          Vetting status: {item.status === 'published' ? 'Published without vetting' : item.status === 'approved' ? 'Approved' : 'Rejected'}
        </p>
      ) : null}
      {item.fanmassAnalysis ? (
        <section aria-label="Fanmass photo analysis" data-fanmass-analysis style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
          <span style={{ ...DIMMED, fontWeight: 600 }}>
            Fanmass analysis: {item.fanmassAnalysis.status === 'failed' ? 'failed' : `${item.fanmassAnalysis.summary.personCount} people · ${item.fanmassAnalysis.analysisStage}`}
          </span>
          {item.fanmassAnalysis.status === 'failed' ? <span style={DIMMED}>The local analysis did not complete.</span> : null}
          {fanmassBoxCount > 0 ? (
            <Button type="button" variant={showFanmassBoxes ? 'filled' : 'light'} aria-pressed={showFanmassBoxes} onClick={() => setShowFanmassBoxes((visible) => !visible)} data-toggle-fanmass-boxes>
              {showFanmassBoxes ? 'Hide Fanmass boxes' : `Show Fanmass boxes (${fanmassBoxCount})`}
            </Button>
          ) : item.fanmassAnalysis.status === 'completed' ? <span style={DIMMED}>No saved person boxes.</span> : null}
        </section>
      ) : null}
      <p style={DIMMED} data-review-help>
        {analysisOnly ? 'Mark the people in this photo, or choose Nobody in this photo. Saving changes the analysis only; vetting, visibility, and email stay the same.' : markPeople
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
            {displayPhotoUrl ? (
              <Image src={displayPhotoUrl} alt={`Photo ${position} of ${total}`} width={1600} height={900} unoptimized priority draggable={false} style={{ display: 'block', height: 'auto', maxHeight: 'calc(100vh - 12rem)', maxWidth: '100%', width: 'auto' }} />
            ) : (
              <div role={analysisOnly ? 'status' : undefined} style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', color: 'var(--mantine-color-dimmed)', padding: '1rem', textAlign: 'center', width: '30rem', maxWidth: '100%' }}>
                {analysisOnly ? 'The unframed original is unavailable for analysis.' : 'No photo'}
              </div>
            )}
            {displayPhotoUrl ? (
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
                {showFanmassBoxes ? fanmassPeopleBoxes.map((person, index) => {
                  const { x, y, w, h } = person.box;
                  return (
                    <div
                      key={`fanmass-person-${person.id}`}
                      data-fanmass-person-box={person.id}
                      aria-label={`Fanmass AI person ${index + 1}`}
                      style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, border: '2px dashed var(--mantine-color-violet-7)', boxSizing: 'border-box', boxShadow: '0 0 0 1px var(--mantine-color-white)', pointerEvents: 'none' }}
                    >
                      <span aria-hidden style={{ background: 'var(--mantine-color-violet-7)', borderRadius: '0.25rem', color: 'var(--mantine-color-white)', fontSize: '0.75rem', fontWeight: 700, left: 2, lineHeight: 1.3, padding: '0 0.3rem', position: 'absolute', top: 2 }}>
                        AI {index + 1}
                      </span>
                    </div>
                  );
                }) : null}
                {showFanmassBoxes ? fanmassFaceBoxes.map((face, index) => {
                  const { x, y, w, h } = face.box;
                  return (
                    <div
                      key={`fanmass-face-${face.id}`}
                      data-fanmass-face-box={face.id}
                      aria-label={`Fanmass AI face ${index + 1}`}
                      style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, border: '1px dotted var(--mantine-color-orange-7)', boxSizing: 'border-box', pointerEvents: 'none' }}
                    />
                  );
                }) : null}
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
            ) : null}
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

          {/* The rejection step comes above the decision bar, so the bar (Approve, Reject…, Skip) stays where it is. */}
          {!analysisOnly && rejecting ? (
            <div id="photo-rejection-step" ref={rejectBlock} className={styles.rejectBlock} style={{ display: 'grid', gap: '0.75rem' }} data-reject-block>
              <RejectActionNotice markingMessage={markPeople ? missing : null} />
              <RejectReasonPicker vocabulary={vocabulary} reasons={reasons} onToggleReason={(key) => setReasons((current) => toggleReason(current, key))} note={note} onNote={setNote} disabled={busy !== null} />
              <div style={BUTTON_ROW}>
                <SemanticButton action="photo-review:confirm-reject" type="button" color="red.8" disabled={!rejectOk || busy !== null} loading={busy === 'reject'} onClick={() => void decide('reject')}>
                  Reject photo
                </SemanticButton>
                <SemanticButton action="photo-review:cancel-reject" type="button" variant="outline" disabled={busy !== null} onClick={() => setRejecting(false)}>
                  Cancel rejection
                </SemanticButton>
              </div>
            </div>
          ) : null}

          {/* The decision is always on the screen: this bar sticks to the bottom of the window while the panel is longer than the window. */}
          <section className={styles.decision} aria-label={analysisOnly ? 'Save analysis' : 'Decision'} data-decision>
            <p role="status" aria-live="polite" style={{ ...DIMMED, minHeight: '1.25rem' }} data-decision-hint>
              {hint}
            </p>
            {analysisOnly ? (
              <div style={BUTTON_ROW}>
                <SemanticButton action="photo-review:save-analysis" type="button" styles={DECISION_BUTTON} disabled={!approveOk || !displayPhotoUrl || busy !== null} loading={busy === 'save'} onClick={() => void saveAnalysis()}>
                  Save analysis
                </SemanticButton>
                <SemanticButton action="photo-review:mark-skip" type="button" variant="outline" styles={DECISION_BUTTON} disabled={busy !== null || !canSkip} onClick={() => onSkip(item.id)}>
                  Skip for now
                </SemanticButton>
              </div>
            ) : (
              <div style={BUTTON_ROW}>
                <SemanticButton action="photo-review:approve" type="button" color="green.8" styles={DECISION_BUTTON} disabled={!approveOk || busy !== null} loading={busy === 'approve'} onClick={() => void decide('approve')}>
                  Approve
                </SemanticButton>
                <SemanticButton action="photo-review:reject" type="button" color="red.8" styles={DECISION_BUTTON} aria-expanded={rejecting} aria-controls={rejecting ? 'photo-rejection-step' : undefined} disabled={busy !== null} onClick={() => setRejecting((open) => !open)}>
                  Reject…
                </SemanticButton>
                <SemanticButton action="photo-review:mark-skip" type="button" variant="outline" styles={DECISION_BUTTON} disabled={busy !== null || !canSkip} onClick={() => onSkip(item.id)}>
                  Skip for now
                </SemanticButton>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function PhotoReviewStage({ eventId, items, vocabulary, markPeople, embedded = false, analysisOnly = false, completionHref, analysisTotal, backHref, backLabel }: Props) {
  const router = useRouter();
  // Photos decided here leave the queue at once (the server list catches up after router.refresh()); a photo skipped goes to the back and comes round again.
  const [decided, setDecided] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
  const [working, setWorking] = useState(false);
  const [startingAnalysisTotal] = useState(() => analysisTotal ?? items.length);
  const [newPhotosCount, setNewPhotosCount] = useState(0);
  const previousPhotoIds = useRef<Set<string> | null>(null);

  const waiting = useMemo(() => {
    const open = items.filter((item) => !decided.includes(item.id));
    const later = skipped.flatMap((id) => open.filter((item) => item.id === id));
    return [...open.filter((item) => !skipped.includes(item.id)), ...later];
  }, [items, decided, skipped]);
  const item = waiting[0];

  // The screen asks the server for new photos by itself (as the Waiting list always did, camera#373), including when an approver returns to this tab after it was in the background.
  useEffect(() => {
    if (analysisOnly) return;
    const refreshIfReady = () => {
      if (shouldRefreshWaiting({ status: 'pending_review', hidden: document.visibilityState === 'hidden', deciding: working, rejecting: false })) router.refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfReady();
    };
    const onPageShow = () => refreshIfReady();
    const timer = setInterval(refreshIfReady, WAITING_REFRESH_MS);
    window.addEventListener('focus', refreshIfReady);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshIfReady);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [working, router, analysisOnly]);

  useEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    const previous = previousPhotoIds.current;
    if (!analysisOnly && previous) {
      const added = [...ids].filter((id) => !previous.has(id)).length;
      if (added > 0) setNewPhotosCount((count) => count + added);
    }
    previousPhotoIds.current = ids;
  }, [items, analysisOnly]);

  const onDecided = useCallback(
    (id: string, message: DecisionNotice) => {
      setDecided((current) => [...current, id]);
      setNotice(message);
      if (analysisOnly && completionHref) router.push(completionHref);
      else router.refresh();
    },
    [router, analysisOnly, completionHref],
  );
  const onSkip = useCallback((id: string) => {
    setNotice(null);
    setSkipped((current) => [...current.filter((other) => other !== id), id]);
  }, []);

  if (!item) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }} data-photo-review-empty>
        {notice ? <InlineAlert title="Done" message={notice.text} severity={notice.warning ? 'warning' : 'success'} /> : null}
        {!analysisOnly && newPhotosCount > 0 ? <InlineAlert title="More photos are waiting" message={`${newPhotosCount} more ${newPhotosCount === 1 ? 'photo is' : 'photos are'} waiting for vetting.`} severity="success" /> : null}
        <StateBlock
          variant="empty"
          title={analysisOnly ? (items.length === 0 ? 'No photos need analysis' : 'This batch is analysed') : items.length === 0 ? 'Nothing is waiting' : 'All the photos are decided'}
          description={analysisOnly ? 'Photos waiting for a vetting decision are handled on the Vetting page. Analysis never changes a photo’s vetting or publication status.' : 'New photos of this event appear here until they are approved or rejected. This page looks for new photos by itself every 10 seconds.'}
        />
        {embedded ? null : <Link href={backHref ?? `/admin/events/${eventId}/${analysisOnly ? 'analysis' : 'vetting'}`}>{backLabel ?? (analysisOnly ? 'Back to Photo analysis' : 'Back to the Vetting tab')}</Link>}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {!analysisOnly && newPhotosCount > 0 ? <InlineAlert title="More photos are waiting" message={`${newPhotosCount} more ${newPhotosCount === 1 ? 'photo is' : 'photos are'} waiting for vetting. They will follow the current photo.`} severity="success" /> : null}
      <PhotoWorkspace
        key={item.id}
        item={item}
        position={decided.length + 1}
        total={analysisOnly ? Math.max(startingAnalysisTotal, decided.length + waiting.length) : decided.length + waiting.length}
        vocabulary={vocabulary}
        markPeople={markPeople}
        analysisOnly={analysisOnly}
        canSkip={waiting.length > 1}
        notice={notice}
        onDecided={onDecided}
        onSkip={onSkip}
        onWorking={setWorking}
      />
    </div>
  );
}
