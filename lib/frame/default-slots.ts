/**
 * The default slots of a partner and of the general level (docs/FRAME_SLOTS_PLAN.md segment 5, owner answer 220): read, save, draw a preview with a sample event, and redraw the images of the
 * events that follow. Saving only stores the default; the redraw is a separate call for each event (a frame takes a few seconds to draw, and there can be many events), which the admin
 * makes one after another and shows. Server side; unit-tested with fakes.
 */

import type { Db, Document } from 'mongodb';
import { ObjectId } from 'mongodb';
import { apiBadRequest, apiNotFound } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { contextHash, nativeFrameContext, type FrameDesign } from './context';
import { DEFAULT_FRAME_MESSAGES } from './messages';
import { previewSlots, type SlotPreview } from './preview';
import { parseSlots, type FrameSlots } from './slots';
import { followersOf, getGlobalSlots, partnerSlotsOf, saveGlobalSlots, savePartnerSlots, type Follower } from './slots-inherit';
import { generateFrameVariants, type GenerateResult } from './variants';

export type DefaultScope = { partnerId: string } | 'global';

export interface DefaultSlotsView {
  /** The default of this level; null when it has none. */
  slots: FrameSlots | null;
  /** For a partner: the general default it follows when it has none (null: the built-in default frame). */
  inherited: FrameSlots | null;
  /** The messages the preview and the message-to-picture map offer: those of the sample event, else the default list. */
  messages: string[];
  sampleEvent: { id: string; name: string } | null;
  /** Events whose images a change of this default redraws. */
  followers: number;
}

/** The event whose snapshot draws the preview: the most recently changed event of the partner (or, for the general level, of any partner) that has a frame design; null when there is none. */
async function sampleEventOf(db: Db, scope: DefaultScope): Promise<Document | null> {
  const filter: Document = { 'frameDesign.context': { $exists: true }, ...(scope === 'global' ? {} : { partnerId: scope.partnerId }) };
  return db.collection(COLLECTIONS.EVENTS).findOne(filter, { sort: { updatedAt: -1 } });
}

/** A design to draw a preview on: the sample event's own, else a made-up one so that a level with no events can still be looked at. */
async function sampleDesign(db: Db, scope: DefaultScope): Promise<{ design: FrameDesign; event: Document | null }> {
  const event = await sampleEventOf(db, scope);
  const real = event?.frameDesign as FrameDesign | undefined;
  if (real?.context) return { design: real, event };
  const base = nativeFrameContext({ eventName: 'Home Team x Visitor Team' }, new Date().toISOString());
  const context = { ...base, event: { ...base.event, homeTeam: { id: 'h', name: 'Home Team', shortName: null, logoUrl: null }, visitorTeam: { id: 'v', name: 'Visitor Team', shortName: null, logoUrl: null } } };
  return { design: { context: { ...context, inputHash: contextHash(context) }, messages: [...DEFAULT_FRAME_MESSAGES], messagesOverridden: false, updatedAt: base.fetchedAt }, event: null };
}

export async function defaultSlotsView(db: Db, scope: DefaultScope, partner?: Document | null): Promise<DefaultSlotsView> {
  const { design, event } = await sampleDesign(db, scope);
  const own = scope === 'global' ? await getGlobalSlots(db) : partnerSlotsOf(partner);
  return {
    slots: own ?? null,
    inherited: scope === 'global' ? null : ((await getGlobalSlots(db)) ?? null),
    messages: design.messages,
    sampleEvent: event ? { id: String(event._id), name: String(event.name ?? '') } : null,
    followers: (await followersOf(db, scope)).length,
  };
}

/** Saves the default of a level (`reset` or no slots take it away) and says which events follow, so their images can be redrawn. Throws a 400 for slots that may not be saved. */
export async function saveDefaultSlots(db: Db, scope: DefaultScope, input: { slots?: unknown; reset?: unknown }, who: string | null, now: string): Promise<{ slots: FrameSlots | null; followers: Follower[] }> {
  let slots: FrameSlots | undefined;
  if (input.reset !== true) {
    const checked = parseSlots(input.slots);
    if (!checked.ok) throw apiBadRequest(checked.error);
    slots = checked.slots;
  }
  if (scope === 'global') await saveGlobalSlots(db, slots, who, now);
  else if (!(await savePartnerSlots(db, scope.partnerId, slots, now))) throw apiNotFound('Partner');
  return { slots: slots ?? null, followers: await followersOf(db, scope) };
}

export async function previewDefaultSlots(db: Db, scope: DefaultScope, input: { slots?: unknown; messageIndex?: unknown }): Promise<SlotPreview> {
  const checked = parseSlots(input.slots);
  if (!checked.ok) throw apiBadRequest(checked.error);
  const { design } = await sampleDesign(db, scope);
  return previewSlots(design, checked.slots, Number.isInteger(input.messageIndex) ? (input.messageIndex as number) : null);
}

/** Redraws the images of one event that follows the default of `scope`; an event that does not follow it (it has its own slots, or follows a nearer default) is refused, so a stale list cannot redraw the wrong event. */
export async function redrawFollower(db: Db, scope: DefaultScope, eventMongoId: unknown, generate: (db: Db, event: Document) => Promise<GenerateResult> = generateFrameVariants): Promise<{ total: number; generated: number; reused: number }> {
  if (typeof eventMongoId !== 'string' || !ObjectId.isValid(eventMongoId)) throw apiBadRequest('eventId is not an event id');
  const follower = (await followersOf(db, scope)).find((candidate) => candidate.id === eventMongoId);
  if (!follower) throw apiBadRequest('That event does not follow this default (it has its own slots, or follows a nearer default, or has no images to redraw)');
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventMongoId) });
  if (!event) throw apiNotFound('Event');
  const result = await generate(db, event);
  return { total: result.design.variants?.length ?? 0, generated: result.generated, reused: result.reused };
}

/** The two things a POST can ask for at a default level: `{ action: 'preview', slots, messageIndex? }` (a picture of the draft, nothing stored) or `{ action: 'redraw', eventId }`. */
export async function runDefaultSlotsAction(db: Db, scope: DefaultScope, body: { action?: unknown; slots?: unknown; messageIndex?: unknown; eventId?: unknown }) {
  if (body.action === 'preview') {
    const preview = await previewDefaultSlots(db, scope, body);
    return { imageDataUrl: `data:image/png;base64,${preview.png.toString('base64')}`, width: preview.width, height: preview.height, notes: preview.notes, message: preview.message };
  }
  if (body.action === 'redraw') return redrawFollower(db, scope, body.eventId);
  throw apiBadRequest('action must be preview or redraw');
}
