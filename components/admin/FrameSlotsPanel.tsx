'use client';

/**
 * The slots of the event's generated frame (docs/FRAME_SLOTS_PLAN.md, issue 502; the client's request of 2026-10-09): six optional text slots and six optional picture slots, one
 * card for each position, each with a source. It starts from what the event has (the default frame is four slots), draws a preview of the draft on the server as you edit, tells
 * what does not fit or overlaps, and saves with the images drawn. Talks to GET /api/admin/events/[id]/frame-design, PUT .../frame-slots and POST .../frame-slots/preview.
 */

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Button, TextInput } from '@/components/gds/PublicPrimitives';
import { InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import ImagePicker from '@/components/admin/library/ImagePicker';
import { FRAME_PREVIEW_BACKDROP } from '@/lib/gds/tokens/colors';
import type { FrameDesign } from '@/lib/frame/context';
import { SLOT_IMAGES_MAX, SLOT_POSITIONS, TEXT_SOURCES, isCentre, pictureSourcesAt, type SlotPosition } from '@/lib/frame/slots';
import { DEFAULT_CORNER_SIZE, PICTURE_LABEL, POSITION_LABEL, TEXT_LABEL, draftToSlots, rowSummary, slotsToDraft, type PositionDraft } from '@/lib/frame/slots-draft';

interface Loaded {
  frameDesign: FrameDesign | null;
  defaultMessages: string[];
}

interface Preview {
  imageDataUrl: string;
  width: number;
  height: number;
  notes: string[];
  message: string | null;
}

type Notice = { severity: 'success' | 'warning' | 'error' | 'info'; title: string; lines: string[] };

const card = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.75rem', display: 'grid', gap: '0.5rem', margin: 0, padding: '0.75rem 1rem' } as const;
const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;
const selectStyle = { minHeight: 36, maxWidth: '100%' } as const;
const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

function errorText(body: unknown, fallback: string): string {
  const message = body && typeof body === 'object' ? (body as { error?: unknown }).error : null;
  return typeof message === 'string' && message ? message : fallback;
}

async function call<T>(url: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as { data?: T } | null;
  if (!response.ok || !body?.data) throw new Error(errorText(body, fallback));
  return body.data;
}

export default function FrameSlotsPanel({ eventId, onDesignChanged }: { eventId: string; onDesignChanged?: () => void }) {
  const endpoint = `/api/admin/events/${eventId}/frame-design`;
  const slotsEndpoint = `/api/admin/events/${eventId}/frame-slots`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<PositionDraft[]>(() => slotsToDraft(undefined));
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [messageIndex, setMessageIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    call<Loaded>(endpoint, undefined, 'Could not load the frame')
      .then((data) => {
        if (cancelled) return;
        setLoaded(data);
        setRows(slotsToDraft(data.frameDesign?.slots));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load the frame');
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const design = loaded?.frameDesign ?? null;
  const messages = design?.messages ?? loaded?.defaultMessages ?? [];
  const sent = useMemo(() => JSON.stringify(draftToSlots(rows)), [rows]);
  const saved = useMemo(() => JSON.stringify(draftToSlots(slotsToDraft(design?.slots))), [design]);
  const dirty = sent !== saved;
  const usingSlots = Boolean(design?.slots);

  // The preview follows the draft: drawn on the server a moment after the last change.
  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const data = await call<Preview>(
          `${slotsEndpoint}/preview`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slots: JSON.parse(sent), messageIndex }), signal: controller.signal },
          'The preview could not be drawn'
        );
        setPreview(data);
        setPreviewError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPreviewError(error instanceof Error ? error.message : 'The preview could not be drawn');
      } finally {
        if (!controller.signal.aborted) setPreviewing(false);
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loaded, slotsEndpoint, sent, messageIndex]);

  const update = (position: SlotPosition, patch: Partial<PositionDraft>) => setRows((current) => current.map((row) => (row.position === position ? { ...row, ...patch } : row)));

  const send = async (kind: 'save' | 'reset', body: unknown) => {
    setBusy(kind);
    setNotice(null);
    try {
      const result = await call<{ frameDesign: FrameDesign; variants: { total: number; generated: number; reused: number } }>(
        slotsEndpoint,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        kind === 'save' ? 'Could not save the slots' : 'Could not go back to the default frame'
      );
      setLoaded((current) => (current ? { ...current, frameDesign: result.frameDesign } : current));
      setRows(slotsToDraft(result.frameDesign.slots));
      setNotice({
        severity: 'success',
        title: kind === 'save' ? 'Slots saved' : 'The default frame is back',
        lines: [`${result.variants.total} ${result.variants.total === 1 ? 'image' : 'images'}: ${result.variants.generated} drawn, ${result.variants.reused} reused.`],
      });
      onDesignChanged?.();
    } catch (error) {
      setNotice({ severity: 'error', title: 'Not done', lines: [error instanceof Error ? error.message : 'Something went wrong'] });
    } finally {
      setBusy(null);
    }
  };

  if (loadError) return <InlineAlert title="The frame slots could not be loaded" message={loadError} severity="error" />;
  if (!loaded) return <StateBlock variant="loading" title="Loading the frame slots…" />;

  return (
    <section aria-labelledby="frame-slots-title" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '1rem', padding: '1.5rem' }}>
      <div>
        <h3 id="frame-slots-title" style={{ margin: 0 }}>
          Frame slots
        </h3>
        <p style={{ ...muted, margin: '0.25rem 0 0' }}>
          A frame is made of up to twelve optional slots: a text and a picture at each of six positions. {usingSlots ? 'This event has its own slots.' : 'This event uses the default frame (four slots); change a slot to compose your own.'} Pictures are
          drawn first and texts on top. A top text or picture moves below a bar on the top edge, and a bottom one above a bar on the bottom edge. A centre text is written in the bar of its edge.
        </p>
      </div>

      {notice ? <InlineAlert title={notice.title} message={notice.lines.join(' ')} severity={notice.severity} /> : null}

      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 24rem), 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {SLOT_POSITIONS.map((position) => {
            const row = rows.find((candidate) => candidate.position === position)!;
            const centre = isCentre(position);
            const cornerPicture = !centre && row.pictureSource !== 'off';
            return (
              <fieldset key={position} style={card} disabled={busy !== null}>
                <legend style={{ fontWeight: 700 }}>{POSITION_LABEL[position]}</legend>
                <div style={muted}>{rowSummary(row)}</div>

                <label style={{ display: 'grid', gap: '0.25rem' }}>
                  <span>Text</span>
                  <select value={row.textSource} onChange={(event) => update(position, { textSource: event.currentTarget.value as PositionDraft['textSource'] })} style={selectStyle}>
                    <option value="off">Off</option>
                    {TEXT_SOURCES.map((source) => (
                      <option key={source} value={source}>
                        {TEXT_LABEL[source].charAt(0).toUpperCase() + TEXT_LABEL[source].slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                {row.textSource === 'custom' ? <TextInput label="Own text" value={row.customText} maxLength={120} onChange={(event) => update(position, { customText: event.currentTarget.value })} /> : null}
                {row.textSource !== 'off' ? <TextInput label="Text colour (optional)" description="Leave empty for the colour of the event's style." placeholder="#rrggbb" value={row.textColour} onChange={(event) => update(position, { textColour: event.currentTarget.value })} /> : null}

                <label style={{ display: 'grid', gap: '0.25rem' }}>
                  <span>{centre ? 'Picture (a bar across the frame)' : 'Picture'}</span>
                  <select
                    value={row.pictureSource}
                    onChange={(event) => {
                      const pictureSource = event.currentTarget.value as PositionDraft['pictureSource'];
                      update(position, { pictureSource, images: pictureSource === 'picture' && row.images.length === 0 ? [''] : row.images });
                    }}
                    style={selectStyle}
                  >
                    <option value="off">Off</option>
                    {pictureSourcesAt(position).map((source) => (
                      <option key={source} value={source}>
                        {PICTURE_LABEL[source].charAt(0).toUpperCase() + PICTURE_LABEL[source].slice(1)}
                      </option>
                    ))}
                  </select>
                </label>

                {row.pictureSource === 'picture' ? (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {row.images.map((url, index) => (
                      <div key={index} style={{ display: 'grid', gap: '0.25rem' }}>
                        <ImagePicker
                          label={`Picture ${index + 1}`}
                          value={url}
                          onChange={(value) => update(position, { images: row.images.map((existing, at) => (at === index ? value : existing)) })}
                          level={{ scope: 'event', eventId }}
                          fileTypes={FILE_TYPES}
                          fileTypeWords="PNG, JPEG or WebP"
                        />
                        {row.images.length > 1 ? (
                          <div>
                            <Button
                              type="button"
                              variant="light"
                              size="xs"
                              onClick={() =>
                                update(position, {
                                  images: row.images.filter((_, at) => at !== index),
                                  // The messages that used this picture go back to the first; later pictures move up one place.
                                  byMessage: Object.fromEntries(Object.entries(row.byMessage).flatMap(([message, at]) => (at === index ? [] : [[message, at > index ? at - 1 : at]]))),
                                })
                              }
                            >
                              Remove picture {index + 1}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {row.images.length < SLOT_IMAGES_MAX ? (
                      <div>
                        <Button type="button" variant="light" size="xs" onClick={() => update(position, { images: [...row.images, ''] })}>
                          Add another picture
                        </Button>
                      </div>
                    ) : null}
                    {row.images.length > 1 ? (
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        <span style={muted}>Which picture each message uses (a message with no choice uses picture 1):</span>
                        {messages.map((message) => (
                          <label key={message} style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between' }}>
                            <span>{message}</span>
                            <select
                              value={row.byMessage[message] ?? ''}
                              onChange={(event) => {
                                const { [message]: _gone, ...rest } = row.byMessage;
                                void _gone;
                                update(position, { byMessage: event.currentTarget.value === '' ? rest : { ...rest, [message]: Number(event.currentTarget.value) } });
                              }}
                              style={selectStyle}
                            >
                              <option value="">Picture 1</option>
                              {row.images.map((_, index) => (index === 0 ? null : <option key={index} value={index}>{`Picture ${index + 1}`}</option>))}
                            </select>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {cornerPicture ? (
                  <TextInput
                    label="Size (percent of the frame, 5 to 40)"
                    description={`${DEFAULT_CORNER_SIZE} when empty. The picture keeps its shape.`}
                    value={row.size}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(event) => update(position, { size: event.currentTarget.value })}
                  />
                ) : null}
              </fieldset>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: '0.75rem', alignContent: 'start', position: 'sticky', top: '1rem' }}>
          <h4 style={{ margin: 0 }}>Preview {previewing ? <span style={muted}>(drawing…)</span> : null}</h4>
          {messages.length > 0 ? (
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={muted}>With the message</span>
              <select value={messageIndex ?? ''} onChange={(event) => setMessageIndex(event.currentTarget.value === '' ? null : Number(event.currentTarget.value))} style={selectStyle}>
                <option value="">The first one that can be used</option>
                {messages.map((message, index) => (
                  <option key={`${index}-${message}`} value={index}>
                    {message}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {previewError ? <InlineAlert title="Not drawn" message={previewError} severity="warning" /> : null}
          {preview ? (
            <>
              <div style={{ backgroundImage: FRAME_PREVIEW_BACKDROP, borderRadius: 8, opacity: previewError ? 0.45 : 1, overflow: 'hidden' }}>
                <Image src={preview.imageDataUrl} alt="The frame as the slots draw it" width={preview.width} height={preview.height} unoptimized style={{ display: 'block', height: 'auto', width: '100%' }} />
              </div>
              {previewError ? (
                <span style={muted}>This is the last preview that could be drawn.</span>
              ) : preview.notes.length > 0 ? (
                <InlineAlert title="Worth a look" message={preview.notes.join(' ')} severity="warning" />
              ) : (
                <span style={muted}>Nothing overlaps and every text fits.</span>
              )}
            </>
          ) : previewError ? null : (
            <span style={muted}>Drawing the preview…</span>
          )}
        </div>
      </div>

      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <Button type="button" disabled={busy !== null || !dirty} onClick={() => void send('save', { slots: JSON.parse(sent) })}>
          {busy === 'save' ? 'Saving and drawing the images…' : 'Save the slots and draw the images'}
        </Button>
        <Button type="button" variant="light" disabled={busy !== null || !usingSlots} onClick={() => void send('reset', { reset: true })}>
          {busy === 'reset' ? 'Going back…' : 'Back to the default frame'}
        </Button>
        {dirty ? <span style={muted}>You have changes that are not saved.</span> : null}
      </div>
    </section>
  );
}
