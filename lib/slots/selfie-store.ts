/**
 * Reading and saving the sample selfie slot (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md): the database side of `lib/slots/selfie.ts`.
 *
 * - The sample selfies are library images with the tag `sample-selfie` (`lib/library/sample-selfie.ts`). The **global default set** is every active global one.
 * - A partner chooses `Partner.slots.selfie`: global sample selfies (straight from the global list, nothing is added to its Images library) or its own tagged uploads.
 * - An event chooses `Event.slots.selfie`: what its partner uses or its partner's own uploads (one way only, camera#361), or its own tagged uploads. **The first save of an event that is not on
 *   the slot model yet seeds its slots from its old logo list** (`eventSlotsFromLegacy`) so that writing the selfie slot never switches the event's logos to the model unseeded.
 * - A value that is just "use the default" is not stored: a child that stored nothing follows.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { GLOBAL_FILTER, itemView } from '@/lib/library/db';
import { SAMPLE_SELFIE_TAG } from '@/lib/library/sample-selfie';
import { scopeOf } from '@/lib/library/rules';
import { fieldsOf } from '@/lib/library/db';
import type { LibraryItemView } from '@/lib/library/types';
import { eventSlotsFromLegacy, isOnSlotModel, type LogoEvent, type LogoPartner } from './logo';
import { parseSlotValue, type StoreResult } from './logo-store';
import { slotMode, type ResolvedItem, type SlotMode, type SlotValue } from './resolve';
import { SELFIE_SLOT, resolvePartnerSelfies, resolveSelfies } from './selfie';

const LIST_LIMIT = 500;
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const images = (db: Db) => db.collection(COLLECTIONS.IMAGES);
const byNewest = (a: Document, b: Document): number => text(b.createdAt).localeCompare(text(a.createdAt));

export interface SelfieItemView extends LibraryItemView {
  /** The level that holds the picture in the chain: `global`, `partner` or `event`. */
  level?: string;
}

/** The active global sample selfies, newest first: the global default set. */
export async function globalSelfieDocs(db: Db): Promise<Document[]> {
  const docs = await images(db).find({ ...GLOBAL_FILTER, tags: SAMPLE_SELFIE_TAG, isActive: true }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
  return docs.sort(byNewest);
}

export async function globalSelfieIds(db: Db): Promise<string[]> {
  return (await globalSelfieDocs(db)).map((doc) => text(doc.pictureId)).filter(Boolean);
}

/** A partner's own sample selfie uploads, newest first. */
async function partnerOwnDocs(db: Db, partner: Document): Promise<Document[]> {
  const docs = await images(db).find({ scope: 'partner', partnerId: text(partner.partnerId), tags: SAMPLE_SELFIE_TAG }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
  return docs.sort(byNewest);
}

/** An event's own sample selfie uploads, newest first. */
async function eventOwnDocs(db: Db, event: Document): Promise<Document[]> {
  const docs = await images(db).find({ scope: 'event', eventId: text(event.eventId), tags: SAMPLE_SELFIE_TAG }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
  return docs.sort(byNewest);
}

async function docsByIds(db: Db, ids: readonly string[]): Promise<Map<string, Document>> {
  const docs = ids.length ? await images(db).find({ pictureId: { $in: [...ids] }, tags: SAMPLE_SELFIE_TAG }).toArray() : [];
  return new Map(docs.map((doc) => [text(doc.pictureId), doc]));
}

async function partnerOf(db: Db, event: Document): Promise<Document | null> {
  const partnerId = text(event.partnerId);
  return partnerId ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId }) : null;
}

/** The items with their views; an id the library no longer has (or switched off) is left out: the slot falls back to the next item and, with none, to the stand-in. */
function withView(resolved: readonly ResolvedItem[], docs: Map<string, Document>): SelfieItemView[] {
  return resolved.flatMap((entry) => {
    const doc = docs.get(entry.id);
    return doc && doc.isActive !== false ? [{ ...itemView('images', doc), level: entry.level }] : [];
  });
}

/** What an event uses now: the resolved ids, in order, as documents (active ones that still exist). */
export async function resolveEventSelfieDocs(db: Db, event: Document): Promise<Document[]> {
  const [globalIds, partner] = await Promise.all([globalSelfieIds(db), partnerOf(db, event)]);
  const resolved = resolveSelfies(globalIds, partner as LogoPartner | null, event as LogoEvent);
  const docs = await docsByIds(db, resolved.map((item) => item.id));
  return resolved.flatMap((item) => {
    const doc = docs.get(item.id);
    return doc && doc.isActive !== false ? [doc] : [];
  });
}

/** The partner may choose a sample selfie that is a global one (active) or its own upload; another partner's or an event's upload is refused. */
async function checkPartnerPick(db: Db, partner: Document, id: string): Promise<StoreResult<null>> {
  const doc = (await docsByIds(db, [id])).get(id);
  if (!doc) return { ok: false, status: 404, reason: `Unknown sample selfie: ${id}` };
  if (doc.isActive === false) return { ok: false, status: 400, reason: `This sample selfie is switched off: ${text(doc.name) || id}` };
  const scope = scopeOf(fieldsOf(doc));
  if (scope === 'global') return { ok: true, value: null };
  if (scope === 'partner' && text(doc.partnerId) === text(partner.partnerId)) return { ok: true, value: null };
  return { ok: false, status: 400, reason: 'This sample selfie belongs to another partner or to an event.' };
}

/** The event may choose what its partner uses, its partner's own uploads, or its own uploads (one way only). */
async function checkEventPick(db: Db, event: Document, partner: Document | null, globalIds: readonly string[], id: string): Promise<StoreResult<null>> {
  const doc = (await docsByIds(db, [id])).get(id);
  if (!doc) return { ok: false, status: 404, reason: `Unknown sample selfie: ${id}` };
  if (doc.isActive === false) return { ok: false, status: 400, reason: `This sample selfie is switched off: ${text(doc.name) || id}` };
  if (scopeOf(fieldsOf(doc)) === 'event') {
    return text(doc.eventId) === text(event.eventId) ? { ok: true, value: null } : { ok: false, status: 400, reason: 'This sample selfie belongs to another event.' };
  }
  const available = new Set([...resolvePartnerSelfies(globalIds, partner as LogoPartner | null).map((item) => item.id), ...(partner ? (await partnerOwnDocs(db, partner)).map((own) => text(own.pictureId)) : [])]);
  return available.has(id) ? { ok: true, value: null } : { ok: false, status: 400, reason: 'This sample selfie is not in the partner’s sample selfies, so the event cannot take it.' };
}

/** The partner chooses its sample selfies (add more, replace, none, or use the default). */
export async function setPartnerSelfie(db: Db, partner: Document, input: unknown, now: string): Promise<StoreResult<SlotValue>> {
  const parsed = parseSlotValue(input);
  if (!parsed.ok) return parsed;
  for (const id of parsed.value.items ?? []) {
    const allowed = await checkPartnerPick(db, partner, id);
    if (!allowed.ok) return allowed;
  }
  const update = slotMode(parsed.value) === 'default' ? { $unset: { [`slots.${SELFIE_SLOT}`]: '' }, $set: { updatedAt: now } } : { $set: { [`slots.${SELFIE_SLOT}`]: parsed.value, updatedAt: now } };
  await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId: text(partner.partnerId) }, update);
  return { ok: true, value: parsed.value };
}

/** The event chooses its sample selfies. The first save of an event that is not on the slot model puts it on the model, seeded from its old logo list. */
export async function setEventSelfie(db: Db, event: Document, input: unknown, now: string): Promise<StoreResult<{ value: SlotValue; seeded: boolean }>> {
  const parsed = parseSlotValue(input);
  if (!parsed.ok) return parsed;
  const [partner, globalIds] = await Promise.all([partnerOf(db, event), globalSelfieIds(db)]);
  for (const id of parsed.value.items ?? []) {
    const allowed = await checkEventPick(db, event, partner, globalIds, id);
    if (!allowed.ok) return allowed;
  }
  const seeded = !isOnSlotModel(event as LogoEvent);
  const slots: Record<string, SlotValue> = seeded ? eventSlotsFromLegacy(event as never, partner as LogoPartner | null) : { ...((event.slots as Record<string, SlotValue>) ?? {}) };
  if (slotMode(parsed.value) === 'default') delete slots[SELFIE_SLOT];
  else slots[SELFIE_SLOT] = parsed.value;
  await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId: text(event.eventId) }, { $set: { slots, updatedAt: now } });
  return { ok: true, value: { value: parsed.value, seeded } };
}

/** A sample selfie that was just uploaded for the partner joins what it chose (the default stays in use next to it unless the partner already replaced it). */
export async function addSelfieToPartnerSlot(db: Db, partner: Document, pictureId: string, now: string): Promise<StoreResult<SlotValue>> {
  const current = (partner.slots as Record<string, SlotValue> | undefined)?.[SELFIE_SLOT];
  return setPartnerSelfie(db, partner, { items: [...(current?.items ?? []), pictureId], ...(current?.useDefault === false ? { useDefault: false } : {}) }, now);
}

/** A sample selfie that was just uploaded for the event joins what it chose. */
export async function addSelfieToEventSlot(db: Db, event: Document, pictureId: string, now: string): Promise<StoreResult<{ value: SlotValue; seeded: boolean }>> {
  const current = (event.slots as Record<string, SlotValue> | undefined)?.[SELFIE_SLOT];
  return setEventSelfie(db, event, { items: [...(current?.items ?? []), pictureId], ...(current?.useDefault === false ? { useDefault: false } : {}) }, now);
}

export interface SelfiePanel {
  /** What this level stored. */
  value: SlotValue;
  mode: SlotMode;
  /** What the level above gives: used when this level stores nothing. */
  defaultItems: SelfieItemView[];
  /** What this level chose itself. */
  ownItems: SelfieItemView[];
  /** What is used here now: own first, then the default when it is used next to them. */
  effective: SelfieItemView[];
  /** What the editor can pick. */
  candidates: SelfieItemView[];
  /** The name of the level above, for the screen; null at the top. */
  parentName: string | null;
}

/** The panel of a partner: the global set is its default; it can pick any active global sample selfie or its own uploads. */
export async function loadPartnerSelfiePanel(db: Db, partner: Document): Promise<SelfiePanel> {
  const [globalDocs, ownDocs] = await Promise.all([globalSelfieDocs(db), partnerOwnDocs(db, partner)]);
  const globalIds = globalDocs.map((doc) => text(doc.pictureId));
  const value = ((partner.slots as Record<string, SlotValue> | undefined)?.[SELFIE_SLOT] ?? {}) as SlotValue;
  const docs = new Map([...globalDocs, ...ownDocs, ...(await docsByIds(db, value.items ?? [])).values()].map((doc) => [text(doc.pictureId), doc]));
  const chosen = new Set(value.items ?? []);
  return {
    value,
    mode: slotMode(value),
    defaultItems: withView(globalIds.map((id) => ({ id, level: 'global' })), docs),
    ownItems: withView((value.items ?? []).map((id) => ({ id, level: 'partner' })), docs),
    effective: withView(resolvePartnerSelfies(globalIds, partner as LogoPartner), docs),
    candidates: [...globalDocs, ...ownDocs].filter((doc) => !chosen.has(text(doc.pictureId))).map((doc) => ({ ...itemView('images', doc), level: scopeOf(fieldsOf(doc)) === 'global' ? 'global' : 'partner' })),
    parentName: 'the global library',
  };
}

/** The panel of an event: what its partner uses is its default; it can pick what the partner has or its own uploads. */
export async function loadEventSelfiePanel(db: Db, event: Document): Promise<SelfiePanel & { partner: { name: string } | null }> {
  const [globalDocs, partner, ownDocs] = await Promise.all([globalSelfieDocs(db), partnerOf(db, event), eventOwnDocs(db, event)]);
  const globalIds = globalDocs.map((doc) => text(doc.pictureId));
  const partnerOwn = partner ? await partnerOwnDocs(db, partner) : [];
  const value = ((event.slots as Record<string, SlotValue> | undefined)?.[SELFIE_SLOT] ?? {}) as SlotValue;
  const partnerUsed = resolvePartnerSelfies(globalIds, partner as LogoPartner | null);
  const ids = [...new Set([...partnerUsed.map((item) => item.id), ...(value.items ?? [])])];
  const docs = new Map([...globalDocs, ...partnerOwn, ...ownDocs, ...(await docsByIds(db, ids)).values()].map((doc) => [text(doc.pictureId), doc]));
  const chosen = new Set(value.items ?? []);
  const available = [...new Map([...partnerUsed.map((item) => [item.id, docs.get(item.id)] as const), ...partnerOwn.map((doc) => [text(doc.pictureId), doc] as const), ...ownDocs.map((doc) => [text(doc.pictureId), doc] as const)]).values()].filter((doc): doc is Document => Boolean(doc));
  return {
    value,
    mode: slotMode(value),
    defaultItems: withView(partnerUsed, docs),
    ownItems: withView((value.items ?? []).map((id) => ({ id, level: 'event' })), docs),
    effective: withView(resolveSelfies(globalIds, partner as LogoPartner | null, event as LogoEvent), docs),
    candidates: available.filter((doc) => doc.isActive !== false && !chosen.has(text(doc.pictureId))).map((doc) => ({ ...itemView('images', doc), level: scopeOf(fieldsOf(doc)) })),
    parentName: partner ? 'the partner' : 'the global library',
    partner: partner ? { name: text(partner.name) } : null,
  };
}

/** The global list of the Sample selfies page: every global sample selfie, switched off ones too, newest first. */
export async function listSampleSelfies(db: Db): Promise<LibraryItemView[]> {
  const docs = await images(db).find({ ...GLOBAL_FILTER, tags: SAMPLE_SELFIE_TAG }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
  return docs.sort(byNewest).map((doc) => itemView('images', doc));
}
