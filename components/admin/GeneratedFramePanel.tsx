'use client';

/**
 * The generated default frame of one event, in the event editor (camera#237, plan docs/DEFAULT_FRAME_PLAN.md):
 * the images that exist, the messmass snapshot they are built from, the editable message list, and the actions
 * Save, Reset to the default list and Refresh from messmass. The generated frame applies only while the event has no
 * active frame of its own; assigning one (on the same page) replaces it at once.
 *
 * Talks to GET/PUT /api/admin/events/[id]/frame-design and POST .../refresh. Saving and refreshing also generate the
 * images, which takes a few seconds, so the actions show that they are busy.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Button, Text, TextInput } from '@/components/gds/PublicPrimitives';
import { Group, InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import { cssColour } from '@/lib/gds/tokens/color-css';
import { FRAME_PREVIEW_BACKDROP } from '@/lib/gds/tokens/colors';
import type { FrameDesign } from '@/lib/frame/context';
import { describeSnapshotChanges } from '@/lib/frame/diff';
import { eventEmoji } from '@/lib/frame/emoji';
import AssetThumbnail from '@/components/admin/library/AssetThumbnail';
import { fillMessage, messageTokens, validateMessages } from '@/lib/frame/messages';
import { framesOfMessage } from '@/lib/frame/selection';

interface Limits {
  maxMessages: number;
  maxLength: number;
  /** One picture for each message on each design. */
  maxImages?: number;
}

/** A frame of the event that can carry a message: assigned, switched on, with a message area (camera#366). */
interface CarrierFrame {
  frameId: string;
  name: string;
  imageUrl: string;
}

interface Loaded {
  frameDesign: FrameDesign | null;
  defaultMessages: string[];
  limits: Limits;
  availableFrames?: CarrierFrame[];
}

/** The frames chosen for each message of a design, in the order of its messages; an empty list where a message has none (it is on the generated layout). */
const framesOf = (design: Pick<FrameDesign, 'messages' | 'messageFrames'> | null, messages: readonly string[]): string[][] =>
  messages.map((message) => framesOfMessage(design?.messageFrames, message));

interface ImageCounts {
  total: number;
  generated: number;
  reused: number;
}

export type Notice = { severity: 'success' | 'warning' | 'error' | 'info'; title: string; lines: string[] };
type Busy = 'save' | 'reset' | 'refresh' | 'move' | 'retire' | null;

const section = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', overflow: 'hidden' } as const;
const sectionHead = { padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' } as const;
const sectionBody = { display: 'grid', gap: '1.25rem', padding: '1rem 1.5rem 1.5rem' } as const;
const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;

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

const countText = (counts: ImageCounts) =>
  `${counts.total} ${counts.total === 1 ? 'image' : 'images'}: ${counts.generated} drawn, ${counts.reused} reused.`;

function Swatch({ colour, label }: { colour: string; label: string }) {
  return (
    <span style={{ alignItems: 'center', display: 'inline-flex', gap: '0.5rem' }}>
      <span
        aria-hidden
        style={{ backgroundColor: cssColour(colour), border: '1px solid var(--mantine-color-default-border)', borderRadius: 4, display: 'inline-block', height: 18, width: 28 }}
      />
      <span>
        {label} <code>{colour}</code>
      </span>
    </span>
  );
}

/**
 * Which message goes on which design (issue 449): a row for each message, a column for each design of the event that carries messages. A message on no design is on the generated
 * layout. Every tick is one picture, drawn when the messages are saved.
 */
function MessageDesignTable({
  messages,
  frames,
  carriers,
  maxImages,
  disabled,
  onChange,
}: {
  messages: string[];
  frames: string[][];
  carriers: CarrierFrame[];
  maxImages: number;
  disabled: boolean;
  onChange: (index: number, ids: string[]) => void;
}) {
  const known = new Set(carriers.map((frame) => frame.frameId));
  const images = frames.reduce((total, ids) => total + Math.max(1, ids.length), 0);
  return (
    <div style={{ marginTop: '1rem' }}>
      <h4 style={{ margin: '0 0 0.25rem' }}>Which message goes on which design</h4>
      <p style={{ ...muted, margin: '0 0 0.5rem' }}>
        Tick the designs a message can be written on. With several ticks the message appears on each of them, and a user who chooses a design is offered the messages ticked for it. A
        message with no tick is written on the generated layout. This makes {images} {images === 1 ? 'picture' : 'pictures'} (at most {maxImages}).
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <thead>
            <tr>
              <th scope="col" style={{ padding: '0.375rem 0.75rem', textAlign: 'left' }}>
                Message
              </th>
              {carriers.map((frame) => (
                <th key={frame.frameId} scope="col" style={{ padding: '0.375rem 0.75rem', textAlign: 'center', verticalAlign: 'bottom' }}>
                  <div style={{ display: 'grid', gap: '0.25rem', justifyItems: 'center' }}>
                    <AssetThumbnail url={frame.imageUrl} name={frame.name} noun="frame" width={72} />
                    <span style={{ fontWeight: 600 }}>{frame.name}</span>
                  </div>
                </th>
              ))}
              <th scope="col" style={{ padding: '0.375rem 0.75rem', textAlign: 'center', verticalAlign: 'bottom' }}>
                Generated layout
              </th>
            </tr>
          </thead>
          <tbody>
            {messages.map((message, index) => {
              const ids = frames[index] ?? [];
              const gone = ids.filter((id) => !known.has(id));
              return (
                <tr key={index} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                  <th scope="row" style={{ fontWeight: 400, padding: '0.375rem 0.75rem', textAlign: 'left' }}>
                    {message.trim() || '(empty message)'}
                    {gone.length > 0 ? (
                      <span role="alert" style={{ color: 'var(--mantine-color-error)', display: 'block', fontSize: '0.8125rem' }}>
                        A design chosen for this message is no longer available (not assigned to this event, switched off, or without a message area). Untick it or choose another.
                      </span>
                    ) : null}
                  </th>
                  {carriers.map((frame) => (
                    <td key={frame.frameId} style={{ padding: '0.375rem 0.75rem', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label={`Message ${index + 1} on ${frame.name}`}
                        checked={ids.includes(frame.frameId)}
                        disabled={disabled}
                        onChange={(event) => onChange(index, event.currentTarget.checked ? [...ids, frame.frameId] : ids.filter((id) => id !== frame.frameId))}
                      />
                    </td>
                  ))}
                  <td style={{ color: 'var(--mantine-color-dimmed)', padding: '0.375rem 0.75rem', textAlign: 'center' }}>{ids.length === 0 ? 'yes' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GeneratedFramePanel({
  eventId,
  hasOwnActiveFrame,
  onLibraryChanged,
  onDesignChanged,
  initialNotice = null,
}: {
  eventId: string;
  hasOwnActiveFrame: boolean;
  /** Called after the panel changed the frames of the event (the base picture moved into the library, or removed) with the notice it shows; the page reloads its lists. */
  onLibraryChanged?: (notice: Notice) => void | Promise<void>;
  /** Called after the messages or their frames were saved, reset or refreshed, so the selection setting below (which lists them) reads them again. */
  onDesignChanged?: () => void;
  /** The notice the panel starts with: the page starts the panel again when the frames change, which would otherwise lose the confirmation. */
  initialNotice?: Notice | null;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  // The frames chosen for each message, in the order of `draft` (none = the generated layout).
  const [draftFrames, setDraftFrames] = useState<string[][]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(initialNotice);

  const endpoint = `/api/admin/events/${eventId}/frame-design`;

  const adopt = useCallback((frameDesign: FrameDesign | null, from?: Loaded) => {
    setLoaded((current) => {
      const base = from ?? current;
      return base ? { ...base, frameDesign } : base;
    });
    if (frameDesign) {
      setDraft(frameDesign.messages);
      setDraftFrames(framesOf(frameDesign, frameDesign.messages));
    }
    onDesignChanged?.();
  }, [onDesignChanged]);

  /** Reads the design again (after the frames of the event changed under the panel). */
  const reloadDesign = async () => {
    const data = await call<Loaded>(endpoint, undefined, 'Could not load the generated frame');
    setLoaded(data);
    const messages = data.frameDesign?.messages ?? data.defaultMessages;
    setDraft(messages);
    setDraftFrames(framesOf(data.frameDesign, messages));
  };

  useEffect(() => {
    let cancelled = false;
    call<Loaded>(endpoint, undefined, 'Could not load the generated frame')
      .then((data) => {
        if (cancelled) return;
        setLoaded(data);
        const messages = data.frameDesign?.messages ?? data.defaultMessages;
        setDraft(messages);
        setDraftFrames(framesOf(data.frameDesign, messages));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load the generated frame');
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const design = loaded?.frameDesign ?? null;
  const limits = loaded?.limits ?? { maxMessages: 10, maxLength: 80 };
  const saved = design?.messages ?? loaded?.defaultMessages ?? [];
  const savedFrames = framesOf(design, saved);
  const carriers = loaded?.availableFrames ?? [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || JSON.stringify(draftFrames) !== JSON.stringify(savedFrames);
  const validation = useMemo(() => validateMessages(draft.map((message) => message)), [draft]);
  const validationError = validation.ok ? null : validation.error;

  const tokens = useMemo(
    () =>
      design
        ? messageTokens({ home: design.context.event.homeTeam?.name, visitor: design.context.event.visitorTeam?.name, eventName: design.context.event.name })
        : null,
    [design]
  );

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<Notice>) => {
    setBusy(kind);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (error) {
      setNotice({ severity: 'error', title: 'Not done', lines: [error instanceof Error ? error.message : 'Something went wrong'] });
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', async () => {
      if (!validation.ok) throw new Error(validation.error);
      const result = await call<{ frameDesign: FrameDesign; variants: ImageCounts }>(
        endpoint,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          // The frames of a message go by the text of the message, so they stay with the message (camera#366).
          body: JSON.stringify({ messages: validation.messages, messageFrames: Object.fromEntries(validation.messages.flatMap((message, index) => (draftFrames[index]?.length ? [[message, draftFrames[index]]] : []))) }),
        },
        'Could not save the messages'
      );
      adopt(result.frameDesign);
      return { severity: 'success', title: 'Messages saved', lines: [countText(result.variants)] };
    });

  const reset = () =>
    run('reset', async () => {
      const result = await call<{ frameDesign: FrameDesign; variants: ImageCounts }>(
        endpoint,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) },
        'Could not reset the messages'
      );
      adopt(result.frameDesign);
      return { severity: 'success', title: 'Messages reset to the default list', lines: [countText(result.variants)] };
    });

  // The designers' picture stored as data on the event moves into the library (camera#369): the frames appear in the Assigned frames and every message chooses one.
  const moveBase = () =>
    run('move', async () => {
      const result = await call<{ variants: ImageCounts }>(`${endpoint}/migrate-base`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 'Could not move the picture into the library');
      const done: Notice = { severity: 'success', title: 'Moved into the library', lines: ['The pictures are frames of this event now and every message chose the one it used before.', countText(result.variants)] };
      await reloadDesign();
      await onLibraryChanged?.(done);
      return done;
    });

  const retireBase = () =>
    run('retire', async () => {
      await call<{ retired: boolean }>(`${endpoint}/migrate-base`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retire: true }) }, 'Could not remove the old data');
      const done: Notice = { severity: 'success', title: 'The old data is removed', lines: ['The frames in the library are the only source of the pictures now.'] };
      await reloadDesign();
      await onLibraryChanged?.(done);
      return done;
    });

  const refresh = () =>
    run('refresh', async () => {
      const before = design?.context ?? null;
      const result = await call<{ frameDesign: FrameDesign; changed: boolean; messmassUnavailable: boolean; variants: ImageCounts }>(
        `${endpoint}/refresh`,
        { method: 'POST' },
        'Could not refresh from messmass'
      );
      adopt(result.frameDesign);
      const changes = describeSnapshotChanges(before, result.frameDesign.context);
      if (result.messmassUnavailable) {
        return {
          severity: 'warning',
          title: 'messmass could not be reached',
          lines: ['The previous snapshot is kept.', countText(result.variants)],
        };
      }
      return result.changed || changes.length > 0
        ? { severity: 'success', title: 'Refreshed from messmass', lines: [...changes, countText(result.variants)] }
        : { severity: 'info', title: 'Nothing changed', lines: ['messmass has the same data as the snapshot.', countText(result.variants)] };
    });

  if (loadError) return <InlineAlert title="The generated frame could not be loaded" message={loadError} severity="error" />;
  if (!loaded) return <StateBlock variant="loading" title="Loading the generated frame..." />;

  const context = design?.context ?? null;
  const variants = design?.variants ?? [];
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.length) return;
    const swap = <T,>(list: T[]): T[] => {
      const next = [...list];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    };
    setDraft(swap);
    setDraftFrames(swap);
  };

  return (
    <section aria-labelledby="generated-frame-title" style={section}>
      <div style={sectionHead}>
        <h3 id="generated-frame-title" style={{ margin: 0 }}>
          Generated default frame
        </h3>
        <p style={{ ...muted, margin: '0.5rem 0 0' }}>
          {hasOwnActiveFrame
            ? 'This event has an active frame of its own, so the generated frame is not used. It applies again as soon as no own frame is active.'
            : 'This event has no active frame of its own, so users get this generated frame: your partner’s logo, the teams, the theme colours and a random message on every photo.'}
        </p>
      </div>

      <div style={sectionBody}>
        {notice ? (
          <div role="status">
            <InlineAlert title={notice.title} message={notice.lines.join(' ')} severity={notice.severity} />
          </div>
        ) : null}

        <div>
          <h4 style={{ margin: '0 0 0.5rem' }}>Images ({variants.length})</h4>
          {variants.length === 0 ? (
            <p style={muted}>
              No images yet. Use “Refresh from messmass” to take the snapshot and draw them; until they exist users see no generated frame.
            </p>
          ) : (
            <ul style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', listStyle: 'none', margin: 0, padding: 0 }}>
              {variants.map((variant) => (
                <li key={variant.key} style={{ display: 'grid', gap: '0.25rem' }}>
                  <div style={{ backgroundImage: FRAME_PREVIEW_BACKDROP, borderRadius: 8, overflow: 'hidden' }}>
                    <Image
                      src={variant.imageUrl}
                      alt={variant.message ? `Frame with the message “${variant.message}”` : 'Frame without a message'}
                      width={variant.width}
                      height={variant.height}
                      unoptimized
                      style={{ display: 'block', height: 'auto', width: '100%' }}
                    />
                  </div>
                  <span style={{ fontSize: '0.875rem' }}>{variant.message ?? 'No message'}</span>
                  {variant.frameId ? <span style={muted}>Written on the frame “{carriers.find((frame) => frame.frameId === variant.frameId)?.name ?? 'a frame of this event'}”.</span> : null}
                  {variant.logo === 'failed' ? <span style={muted}>The logo could not be fetched; it is retried at the next refresh.</span> : null}
                  {variant.font.note ? <span style={muted}>{variant.font.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 style={{ margin: '0 0 0.5rem' }}>Built from</h4>
          {context ? (
            <dl style={{ display: 'grid', gap: '0.375rem 1rem', gridTemplateColumns: 'max-content 1fr', margin: 0 }}>
              <dt>Source</dt>
              <dd style={{ margin: 0 }}>
                {context.source === 'messmass' ? 'messmass' : 'camera’s own data (no messmass data yet)'}, taken{' '}
                <time dateTime={context.fetchedAt}>{new Date(context.fetchedAt).toLocaleString()}</time>
              </dd>
              <dt>Event</dt>
              <dd style={{ margin: 0 }}>{context.event.name}</dd>
              <dt>Teams</dt>
              <dd style={{ margin: 0 }}>
                {context.event.homeTeam && context.event.visitorTeam
                  ? `${context.event.homeTeam.name} – ${context.event.visitorTeam.name}`
                  : tokens?.partner2
                    ? `${tokens.partner1} – ${tokens.partner2} (from the event name)`
                    : 'none, the event name is shown'}
              </dd>
              <dt>Logo</dt>
              <dd style={{ margin: 0 }}>
                {context.partner?.logoUrl ? (
                  <span style={{ alignItems: 'center', display: 'inline-flex', gap: '0.5rem' }}>
                    <Image src={context.partner.logoUrl} alt="" width={96} height={54} unoptimized style={{ height: 'auto', maxHeight: 54, objectFit: 'contain', width: 'auto' }} />
                    <span>{context.partner.name}</span>
                  </span>
                ) : (
                  variants[0]?.logo === 'emoji' ? `none, so the event’s emoji ${eventEmoji(context.event, context.partner?.name) ?? ''} is drawn in its place` : 'none, so no logo is drawn'
                )}
              </dd>
              <dt>Theme</dt>
              <dd style={{ margin: 0 }}>
                {context.style.name} (from the {context.style.resolvedFrom})
              </dd>
              <dt>Font</dt>
              <dd style={{ margin: 0 }}>
                {context.style.fontFamily} ({context.style.fontSource}){variants[0]?.font.used === 'fallback' ? ' – not available, Inter is used' : ''}
              </dd>
              <dt>Colours</dt>
              <dd style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem', margin: 0 }}>
                <Swatch colour={context.style.headingColor} label="Text" />
                <Swatch colour={context.style.heroBackground} label="Bar" />
              </dd>
            </dl>
          ) : (
            <p style={muted}>There is no snapshot yet. “Refresh from messmass” takes it.</p>
          )}
          <div style={{ marginTop: '0.75rem' }}>
            <Button type="button" variant="light" size="xs" loading={busy === 'refresh'} disabled={busy !== null} onClick={() => void refresh()}>
              Refresh from messmass
            </Button>
            <p style={{ ...muted, margin: '0.5rem 0 0' }}>
              The snapshot does not follow messmass by itself. Refresh after changing the partner, logo, teams or theme there.
            </p>
          </div>
        </div>

        {design?.base ? (
          <div>
            <h4 style={{ margin: '0 0 0.5rem' }}>The designers’ picture of this event</h4>
            {design.messages.length > 0 && design.messages.every((message) => framesOfMessage(design.messageFrames, message).length > 0) ? (
              <>
                <p style={{ ...muted, margin: '0 0 0.5rem' }}>
                  The pictures are frames of this event now, and every message chooses one (see the Frame of each message below). The old data on the event is still kept: check the images above, then remove it.
                </p>
                <Button type="button" variant="light" size="xs" loading={busy === 'retire'} disabled={busy !== null || dirty} onClick={() => void retireBase()}>
                  Remove the old data
                </Button>
              </>
            ) : (
              <>
                <p style={{ ...muted, margin: '0 0 0.5rem' }}>
                  The pictures this event’s frames are written on are stored as data on the event, in no library (the older way). Move them into the library to see them under Assigned frames and to choose a frame
                  for each message. The users get the same pictures; the old data stays until you remove it.
                </p>
                <Button type="button" variant="light" size="xs" loading={busy === 'move'} disabled={busy !== null || dirty} onClick={() => void moveBase()}>
                  Move it into the library
                </Button>
              </>
            )}
            {dirty ? <p style={{ ...muted, margin: '0.5rem 0 0' }}>Save or reset your changes to the messages first: this reloads the messages.</p> : null}
          </div>
        ) : null}

        <div>
          <h4 style={{ margin: '0 0 0.25rem' }}>Messages</h4>
          <p style={{ ...muted, margin: '0 0 0.75rem' }}>
            Every photo gets one of these at random, never the same twice in a row. Up to {limits.maxMessages} messages of {limits.maxLength} characters.
            Use <code>{'{partner1}'}</code> and <code>{'{partner2}'}</code> for the two sides on the frame (home and visitor, or the two sides of an event name
            like “A - B”); a message that cannot be filled for this event is skipped.
          </p>
          <p style={{ ...muted, margin: '0 0 0.75rem' }}>
            {carriers.length > 0
              ? 'Each message can be written on one, several or all of the frames of this event that carry messages (the table below the list); a message on no frame uses the generated layout.'
              : 'To write messages on your own frames, assign or upload a frame below and give it a message area (Message area on its card): a text-free frame that carries the messages of this event.'}
          </p>
          <ol style={{ display: 'grid', gap: '0.75rem', listStyle: 'none', margin: 0, padding: 0 }}>
            {draft.map((message, index) => {
              const filled = tokens ? fillMessage(message, tokens) : null;
              return (
                <li key={index} style={{ display: 'grid', gap: '0.25rem' }}>
                  <Group gap="xs" align="flex-start" wrap="wrap">
                    <TextInput
                      aria-label={`Message ${index + 1}`}
                      value={message}
                      maxLength={limits.maxLength + 20}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setDraft((list) => list.map((item, at) => (at === index ? value : item)));
                      }}
                      disabled={busy !== null}
                      style={{ flex: '1 1 16rem' }}
                    />
                    <Button type="button" variant="light" size="xs" aria-label={`Move message ${index + 1} up`} disabled={busy !== null || index === 0} onClick={() => move(index, index - 1)}>
                      Up
                    </Button>
                    <Button type="button" variant="light" size="xs" aria-label={`Move message ${index + 1} down`} disabled={busy !== null || index === draft.length - 1} onClick={() => move(index, index + 1)}>
                      Down
                    </Button>
                    <Button type="button" variant="light" color="red" size="xs" aria-label={`Remove message ${index + 1}`} disabled={busy !== null} onClick={() => { setDraft((list) => list.filter((_, at) => at !== index)); setDraftFrames((list) => list.filter((_, at) => at !== index)); }}>
                      Remove
                    </Button>
                  </Group>
                  <span style={muted}>
                    {message.trim().length}/{limits.maxLength}
                    {tokens && message.trim() ? (filled === null ? ' · skipped for this event (it needs a name this event does not have)' : message.includes('{') ? ` · reads “${filled}”` : '') : ''}
                  </span>
                </li>
              );
            })}
          </ol>
          {draft.length === 0 ? <p style={muted}>No messages: the frame is drawn without a message.</p> : null}
          {carriers.length > 0 || draftFrames.some((ids) => ids.length > 0) ? (
            <MessageDesignTable
              messages={draft}
              frames={draftFrames}
              carriers={carriers}
              maxImages={limits.maxImages ?? 40}
              disabled={busy !== null}
              onChange={(index, ids) => setDraftFrames((list) => list.map((item, at) => (at === index ? ids : item)))}
            />
          ) : null}
          {validationError ? (
            <p role="alert" style={{ color: 'var(--mantine-color-error)', margin: '0.5rem 0 0' }}>
              {validationError}
            </p>
          ) : null}
          <Group gap="xs" mt="md" wrap="wrap">
            <Button type="button" variant="light" size="xs" disabled={busy !== null || draft.length >= limits.maxMessages} onClick={() => { setDraft((list) => [...list, '']); setDraftFrames((list) => [...list, []]); }}>
              Add message
            </Button>
            <Button type="button" size="xs" loading={busy === 'save'} disabled={busy !== null || !dirty || validationError !== null} onClick={() => void save()}>
              Save messages
            </Button>
            <Button type="button" variant="light" size="xs" disabled={busy !== null || !dirty} onClick={() => { setDraft(saved); setDraftFrames(savedFrames); }}>
              Discard changes
            </Button>
            <Button type="button" variant="light" size="xs" loading={busy === 'reset'} disabled={busy !== null} onClick={() => void reset()}>
              Reset to the default list
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            Saving draws the images again, which takes a few seconds. {dirty ? 'You have unsaved changes.' : ''}
          </Text>
        </div>

        <div>
          <h4 style={{ margin: '0 0 0.25rem' }}>Use your own frame instead</h4>
          <p style={{ ...muted, margin: 0 }}>
            Assign one of your frames below. As soon as an own frame is active the generated frame stops applying; deactivate or remove it to bring the generated
            frame back.
          </p>
        </div>
      </div>
    </section>
  );
}
