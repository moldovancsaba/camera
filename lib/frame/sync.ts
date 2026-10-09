/**
 * Keeps the frame design of an event up to date (docs/DEFAULT_FRAME_PLAN.md, camera#234): a snapshot of the
 * messmass data taken at provisioning and whenever an admin presses refresh, and the editable message list.
 * messmass changes are followed by lib/theme/refresh.ts (camera#285; this replaces owner decision 6 of the first plan, "no automatic
 * follow"). Dependencies are injected so it is unit-tested without a network or a database server.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { fetchFrameContext, messmassConfigured } from '@/lib/messmassClient';
import { apiBadRequest } from '@/lib/api';
import { nativeFrameContext, parseFrameContext, type FrameContext, type FrameDesign } from './context';
import { DEFAULT_FRAME_MESSAGES, validateMessages } from './messages';
import { validateMessageFrames } from './message-frames';

export interface RefreshDeps {
  fetchContext: (messmassEventId: string) => Promise<unknown | null>;
  messmassConfigured: () => boolean;
  now: () => string;
}

const defaultDeps: RefreshDeps = {
  fetchContext: fetchFrameContext,
  messmassConfigured,
  now: () => new Date().toISOString(),
};

export interface RefreshResult {
  design: FrameDesign;
  /** The inputs of the rendered frame differ from the previous snapshot (or there was none). */
  changed: boolean;
  /** The event is linked to messmass but messmass gave no usable answer; the previous snapshot was kept. */
  messmassUnavailable: boolean;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * Take a new snapshot. A linked event asks messmass; when messmass gives nothing usable the previous snapshot stays
 * (a refresh never replaces good data with the fallback), and an event with no snapshot yet gets the fallback made
 * from camera's own name and partner logo. The message list follows the default list until the event edits it.
 */
export async function refreshFrameDesign(db: Db, event: Document, deps: RefreshDeps = defaultDeps): Promise<RefreshResult> {
  const now = deps.now();
  const existing = event.frameDesign as FrameDesign | undefined;
  const linked = typeof event.messmassEventId === 'string' && event.messmassEventId !== '' && deps.messmassConfigured();

  let context: FrameContext | null = null;
  if (linked) {
    const raw = await deps.fetchContext(event.messmassEventId);
    context = raw ? parseFrameContext(raw, now) : null;
  }
  const messmassUnavailable = linked && context === null;

  if (!context && existing?.context) {
    return { design: existing, changed: false, messmassUnavailable };
  }
  if (!context) {
    const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId });
    context = nativeFrameContext(
      { eventName: event.name, eventDate: event.eventDate, partnerName: partner?.name ?? event.partnerName, partnerLogoUrl: partner?.logoUrl },
      now
    );
  }

  const overridden = existing?.messagesOverridden === true;
  const design: FrameDesign = {
    context,
    messages: overridden && existing ? existing.messages : [...DEFAULT_FRAME_MESSAGES],
    messagesOverridden: overridden,
    updatedAt: now,
    // The generated images stay: a new snapshot must never take the images of the event away. They are replaced image by image when
    // their inputs change (generateFrameVariants), and until then the event keeps the frame it has.
    // The designers' base picture of the frame belongs to the event, not to the messmass snapshot: it stays too.
    ...(existing?.base ? { base: existing.base } : {}),
    // The frames the messages chose belong to the event too (camera#366).
    ...(existing?.messageFrames ? { messageFrames: existing.messageFrames } : {}),
    ...(existing?.variants ? { variants: existing.variants } : {}),
    ...(existing?.generatedAt ? { generatedAt: existing.generatedAt } : {}),
  };
  await db.collection(COLLECTIONS.EVENTS).updateOne({ _id: event._id }, { $set: { frameDesign: design, updatedAt: now } });
  return { design, changed: !existing || existing.context?.inputHash !== context.inputHash, messmassUnavailable };
}

/**
 * Save the event's message list, or reset it to the default list. Throws a 400 for a list the editor may not save
 * (more than 10, empty, too long, unknown placeholder). The list counts as edited only when it differs from the default.
 * `messageFrames` (camera#366) replaces the frame each message is written on; without it the choices stay for the messages that are still in the list,
 * and a reset clears them. Throws a 400 for a frame that is not assigned to the event, switched off or without a message area.
 */
export async function saveFrameMessages(
  db: Db,
  event: Document,
  input: { messages?: unknown; reset?: unknown; messageFrames?: unknown },
  deps: RefreshDeps = defaultDeps
): Promise<FrameDesign> {
  const current: FrameDesign = (event.frameDesign as FrameDesign | undefined) ?? (await refreshFrameDesign(db, event, deps)).design;
  let messages: string[];
  if (input.reset === true) {
    messages = [...DEFAULT_FRAME_MESSAGES];
  } else {
    const checked = validateMessages(input.messages);
    if (!checked.ok) throw apiBadRequest(checked.error);
    messages = checked.messages;
  }
  let chosen: Record<string, string | string[]> = input.reset === true ? {} : { ...(current.messageFrames ?? {}) };
  if (input.reset !== true && input.messageFrames !== undefined) {
    const checked = await validateMessageFrames(db, event, messages, input.messageFrames);
    if (!checked.ok) throw apiBadRequest(checked.error);
    chosen = checked.messageFrames;
  }
  // A choice belongs to a message text: it goes with the message when the message goes.
  chosen = Object.fromEntries(Object.entries(chosen).filter(([message]) => messages.includes(message)));
  const hasChoices = Object.keys(chosen).length > 0;

  const { messageFrames: _previous, ...rest } = current;
  void _previous;
  const design: FrameDesign = {
    ...rest,
    messages,
    messagesOverridden: !sameList(messages, DEFAULT_FRAME_MESSAGES),
    updatedAt: deps.now(),
    ...(hasChoices ? { messageFrames: chosen } : {}),
  };
  const set: Record<string, unknown> = { 'frameDesign.messages': design.messages, 'frameDesign.messagesOverridden': design.messagesOverridden, 'frameDesign.updatedAt': design.updatedAt, updatedAt: design.updatedAt };
  if (hasChoices) set['frameDesign.messageFrames'] = chosen;
  await db.collection(COLLECTIONS.EVENTS).updateOne({ _id: event._id }, hasChoices ? { $set: set } : { $set: set, $unset: { 'frameDesign.messageFrames': '' } });
  return design;
}
