/**
 * Reading and saving a tagged picture slot (issue 540 for the sample selfie, issue 326 for the stadium background; docs/WELCOME_SCREEN_PHOTO_PLAN.md): the database side of `lib/slots/picture-slot.ts`,
 * made once for every kind of tagged picture (`taggedPictureStore({ slot, tag })`), so the sample selfie and the stadium background are the same code with another tag and another slot id.
 *
 * - The pictures are library images with the tag. The **global default set** is every active global one.
 * - A partner chooses `Partner.slots[slot]`: global pictures (straight from the global list, nothing is added to its Images library) or its own tagged uploads.
 * - An event chooses `Event.slots[slot]`: what its partner uses or its partner's own uploads (one way only, camera#361), or its own tagged uploads. **The first save of an event that is not on
 *   the slot model yet seeds its slots from its old logo list** (`eventSlotsFromLegacy`) so that writing the slot never switches the event's logos to the model unseeded.
 * - A value that is just "use the default" is not stored: a child that stored nothing follows.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { GLOBAL_FILTER, fieldsOf, itemView } from '@/lib/library/db';
import { scopeOf } from '@/lib/library/rules';
import type { LibraryItemView } from '@/lib/library/types';
import { eventSlotsFromLegacy, isOnSlotModel, type LogoEvent, type LogoPartner } from './logo';
import { parseSlotValue, type StoreResult } from './logo-store';
import { resolvePartnerPictures, resolvePictures } from './picture-slot';
import { slotMode, type ResolvedItem, type SlotMode, type SlotValue } from './resolve';
import { resolveAssetVisibility } from '@/lib/visual-assets/resolve';
import type { VisualAssetLevelPolicy } from '@/lib/visual-assets/contracts';

const LIST_LIMIT = 500;
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const images = (db: Db) => db.collection(COLLECTIONS.IMAGES);
const byNewest = (a: Document, b: Document): number => text(b.createdAt).localeCompare(text(a.createdAt));

export interface PictureItemView extends LibraryItemView {
  /** The level that holds the picture in the chain: `global`, `partner` or `event`. */
  level?: string;
}

export interface PicturePanel {
  /** What this level stored. */
  value: SlotValue;
  mode: SlotMode;
  /** What the level above gives: used when this level stores nothing. */
  defaultItems: PictureItemView[];
  /** What this level chose itself. */
  ownItems: PictureItemView[];
  /** What is used here now: own first, then the default when it is used next to them. */
  effective: PictureItemView[];
  /** What the editor can pick. */
  candidates: PictureItemView[];
  /** Partner-owned tagged uploads whose owner can share them with child events. */
  shareableItems?: PictureItemView[];
  /** Event-owned tagged uploads switched off at source, retained for restoration. */
  inactiveOwnItems?: PictureItemView[];
  /** The name of the level above, for the screen; null at the top. */
  parentName: string | null;
}

export interface TaggedPictureKind {
  /** The id of the slot in `Partner.slots` and `Event.slots`. */
  slot: string;
  /** The tag the library images of this kind carry. */
  tag: string;
}

/** The items with their views; an id the library no longer has (or switched off) is left out: the slot falls back to the next item and, with none, to what the place has without it. */
function withView(resolved: readonly ResolvedItem[], docs: Map<string, Document>): PictureItemView[] {
  return resolved.flatMap((entry) => {
    const doc = docs.get(entry.id);
    return doc && doc.isActive !== false ? [{ ...itemView('images', doc), level: entry.level }] : [];
  });
}

async function partnerOf(db: Db, event: Document): Promise<Document | null> {
  const partnerId = text(event.partnerId);
  return partnerId ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId }) : null;
}

function inheritanceEnabled(record: Document | null | undefined): boolean {
  return (record?.visualAssetPolicy as { inheritanceVersion?: unknown } | undefined)?.inheritanceVersion === 2;
}

function visibleToPartner(doc: Document, id: string, partner: Document): boolean {
  return resolveAssetVisibility({
    asset: doc,
    kind: 'images',
    id,
    targetLevel: 'partner',
    partnerId: text(partner.partnerId),
    partnerPolicy: inheritanceEnabled(partner) ? partner.visualAssetPolicy as VisualAssetLevelPolicy : null,
  }).available;
}

function visibleToEvent(doc: Document, id: string, event: Document, partner: Document | null): boolean {
  const policiesEnabled = inheritanceEnabled(partner);
  return resolveAssetVisibility({
    asset: doc,
    kind: 'images',
    id,
    targetLevel: 'event',
    partnerId: partner ? text(partner.partnerId) : text(event.partnerId),
    eventId: text(event.eventId),
    partnerPolicy: policiesEnabled ? partner?.visualAssetPolicy as VisualAssetLevelPolicy | null : null,
    eventPolicy: policiesEnabled ? event.visualAssetPolicy as VisualAssetLevelPolicy | null : null,
  }).available;
}

export function taggedPictureStore({ slot, tag }: TaggedPictureKind) {
  /** The active global pictures of the kind, newest first: the global default set. */
  async function globalDocs(db: Db, partner?: Document | null): Promise<Document[]> {
    const docs = await images(db).find({ ...GLOBAL_FILTER, tags: tag, isActive: true, shareToChildren: { $ne: false } }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
    return docs.filter((doc) => !partner || visibleToPartner(doc, text(doc.pictureId), partner)).sort(byNewest);
  }

  async function globalIds(db: Db, partner?: Document | null): Promise<string[]> {
    return (await globalDocs(db, partner)).map((doc) => text(doc.pictureId)).filter(Boolean);
  }

  /** A partner's own uploads of the kind, newest first. */
  async function partnerOwnDocs(db: Db, partner: Document): Promise<Document[]> {
    const docs = await images(db).find({ scope: 'partner', partnerId: text(partner.partnerId), tags: tag }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
    return docs.sort(byNewest);
  }

  /** An event's own uploads of the kind, newest first. */
  async function eventOwnDocs(db: Db, event: Document): Promise<Document[]> {
    const docs = await images(db).find({ scope: 'event', eventId: text(event.eventId), tags: tag }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
    return docs.sort(byNewest);
  }

  async function docsByIds(db: Db, ids: readonly string[]): Promise<Map<string, Document>> {
    const docs = ids.length ? await images(db).find({ pictureId: { $in: [...ids] }, tags: tag }).toArray() : [];
    return new Map(docs.map((doc) => [text(doc.pictureId), doc]));
  }

  /** What an event uses now: the resolved ids, in order, as documents (active ones that still exist). */
  async function resolveEventDocs(db: Db, event: Document): Promise<Document[]> {
    const partner = await partnerOf(db, event);
    const ids = await globalIds(db, partner);
    const resolved = resolvePictures(slot, ids, partner as LogoPartner | null, event as LogoEvent);
    const docs = await docsByIds(db, resolved.map((item) => item.id));
    return resolved.flatMap((item) => {
      const doc = docs.get(item.id);
      return doc && doc.isActive !== false && visibleToEvent(doc, item.id, event, partner) ? [doc] : [];
    });
  }

  /** The partner may choose a global picture (active) or its own upload; another partner's or an event's upload is refused. */
  async function checkPartnerPick(db: Db, partner: Document, id: string): Promise<StoreResult<null>> {
    const doc = (await docsByIds(db, [id])).get(id);
    if (!doc) return { ok: false, status: 404, reason: `Unknown ${tag.replace(/-/g, ' ')}: ${id}` };
    if (doc.isActive === false) return { ok: false, status: 400, reason: `This ${tag.replace(/-/g, ' ')} is switched off: ${text(doc.name) || id}` };
    const scope = scopeOf(fieldsOf(doc));
    if (scope === 'global' && visibleToPartner(doc, id, partner)) return { ok: true, value: null };
    if (scope === 'partner' && text(doc.partnerId) === text(partner.partnerId)) return { ok: true, value: null };
    return { ok: false, status: 400, reason: `This ${tag.replace(/-/g, ' ')} belongs to another partner or to an event.` };
  }

  /** The event may choose what its partner uses, its partner's own uploads, or its own uploads (one way only). */
  async function checkEventPick(db: Db, event: Document, partner: Document | null, ids: readonly string[], id: string): Promise<StoreResult<null>> {
    const doc = (await docsByIds(db, [id])).get(id);
    const noun = tag.replace(/-/g, ' ');
    if (!doc) return { ok: false, status: 404, reason: `Unknown ${noun}: ${id}` };
    if (doc.isActive === false) return { ok: false, status: 400, reason: `This ${noun} is switched off: ${text(doc.name) || id}` };
    if (scopeOf(fieldsOf(doc)) === 'event') {
      return text(doc.eventId) === text(event.eventId) ? { ok: true, value: null } : { ok: false, status: 400, reason: `This ${noun} belongs to another event.` };
    }
    const partnerUsed = resolvePartnerPictures(slot, ids, partner as LogoPartner | null);
    const ownPartnerDocs = partner ? await partnerOwnDocs(db, partner) : [];
    const partnerDocs = await docsByIds(db, [...partnerUsed.map((item) => item.id), ...ownPartnerDocs.map((own) => text(own.pictureId))]);
    const available = new Set([
      ...partnerUsed.filter((item) => { const inherited = partnerDocs.get(item.id); return Boolean(inherited && visibleToEvent(inherited, item.id, event, partner)); }).map((item) => item.id),
      ...ownPartnerDocs.filter((own) => visibleToEvent(own, text(own.pictureId), event, partner)).map((own) => text(own.pictureId)),
    ]);
    return available.has(id) ? { ok: true, value: null } : { ok: false, status: 400, reason: `This ${noun} is not in the partner’s ${noun}s, so the event cannot take it.` };
  }

  /** The partner chooses its pictures (add more, replace, none, or use the default). */
  async function setPartner(db: Db, partner: Document, input: unknown, now: string): Promise<StoreResult<SlotValue>> {
    const parsed = parseSlotValue(input);
    if (!parsed.ok) return parsed;
    for (const id of parsed.value.items ?? []) {
      const allowed = await checkPartnerPick(db, partner, id);
      if (!allowed.ok) return allowed;
    }
    const update = slotMode(parsed.value) === 'default' ? { $unset: { [`slots.${slot}`]: '' }, $set: { updatedAt: now } } : { $set: { [`slots.${slot}`]: parsed.value, updatedAt: now } };
    await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId: text(partner.partnerId) }, update);
    return { ok: true, value: parsed.value };
  }

  /** The event chooses its pictures. The first save of an event that is not on the slot model puts it on the model, seeded from its old logo list. */
  async function setEvent(db: Db, event: Document, input: unknown, now: string): Promise<StoreResult<{ value: SlotValue; seeded: boolean }>> {
    const parsed = parseSlotValue(input);
    if (!parsed.ok) return parsed;
    const partner = await partnerOf(db, event);
    const ids = await globalIds(db, partner);
    for (const id of parsed.value.items ?? []) {
      const allowed = await checkEventPick(db, event, partner, ids, id);
      if (!allowed.ok) return allowed;
    }
    const seeded = !isOnSlotModel(event as LogoEvent);
    const slots: Record<string, SlotValue> = seeded ? eventSlotsFromLegacy(event as never, partner as LogoPartner | null) : { ...((event.slots as Record<string, SlotValue>) ?? {}) };
    if (slotMode(parsed.value) === 'default') delete slots[slot];
    else slots[slot] = parsed.value;
    await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId: text(event.eventId) }, { $set: { slots, updatedAt: now } });
    return { ok: true, value: { value: parsed.value, seeded } };
  }

  /** A picture that was just uploaded for the partner joins what it chose (the default stays in use next to it unless the partner already replaced it). */
  async function addToPartnerSlot(db: Db, partner: Document, pictureId: string, now: string): Promise<StoreResult<SlotValue>> {
    const current = (partner.slots as Record<string, SlotValue> | undefined)?.[slot];
    return setPartner(db, partner, { items: [...(current?.items ?? []), pictureId], ...(current?.useDefault === false ? { useDefault: false } : {}) }, now);
  }

  /** A picture that was just uploaded for the event joins what it chose. */
  async function addToEventSlot(db: Db, event: Document, pictureId: string, now: string): Promise<StoreResult<{ value: SlotValue; seeded: boolean }>> {
    const current = (event.slots as Record<string, SlotValue> | undefined)?.[slot];
    return setEvent(db, event, { items: [...(current?.items ?? []), pictureId], ...(current?.useDefault === false ? { useDefault: false } : {}) }, now);
  }

  /** The panel of a partner: the global set is its default; it can pick any active global picture or its own uploads. */
  async function loadPartnerPanel(db: Db, partner: Document): Promise<PicturePanel> {
    const [globals, ownDocs] = await Promise.all([globalDocs(db, partner), partnerOwnDocs(db, partner)]);
    const ids = globals.map((doc) => text(doc.pictureId));
    const value = ((partner.slots as Record<string, SlotValue> | undefined)?.[slot] ?? {}) as SlotValue;
    const docs = new Map([...globals, ...ownDocs, ...(await docsByIds(db, value.items ?? [])).values()].map((doc) => [text(doc.pictureId), doc]));
    const chosen = new Set(value.items ?? []);
    const visibleChosen = (value.items ?? []).filter((id) => {
      const doc = docs.get(id);
      return Boolean(doc && visibleToPartner(doc, id, partner));
    });
    return {
      value,
      mode: slotMode(value),
      defaultItems: withView(ids.map((id) => ({ id, level: 'global' })), docs),
      ownItems: withView(visibleChosen.map((id) => ({ id, level: 'partner' })), docs),
      effective: withView(resolvePartnerPictures(slot, ids, partner as LogoPartner).filter((item) => {
        const doc = docs.get(item.id);
        return Boolean(doc && visibleToPartner(doc, item.id, partner));
      }), docs),
      candidates: [...globals, ...ownDocs].filter((doc) => doc.isActive !== false && !chosen.has(text(doc.pictureId))).map((doc) => ({ ...itemView('images', doc), level: scopeOf(fieldsOf(doc)) === 'global' ? 'global' : 'partner' })),
      shareableItems: ownDocs.map((doc) => ({ ...itemView('images', doc), level: 'partner' })),
      parentName: 'the global library',
    };
  }

  /** The panel of an event: what its partner uses is its default; it can pick what the partner has or its own uploads. */
  async function loadEventPanel(db: Db, event: Document): Promise<PicturePanel & { partner: { name: string } | null }> {
    const [partner, ownDocs] = await Promise.all([partnerOf(db, event), eventOwnDocs(db, event)]);
    const globals = await globalDocs(db, partner);
    const ids = globals.map((doc) => text(doc.pictureId));
    const partnerOwn = partner ? await partnerOwnDocs(db, partner) : [];
    const value = ((event.slots as Record<string, SlotValue> | undefined)?.[slot] ?? {}) as SlotValue;
    const partnerUsed = resolvePartnerPictures(slot, ids, partner as LogoPartner | null);
    const wanted = [...new Set([...partnerUsed.map((item) => item.id), ...(value.items ?? [])])];
    const docs = new Map([...globals, ...partnerOwn, ...ownDocs, ...(await docsByIds(db, wanted)).values()].map((doc) => [text(doc.pictureId), doc]));
    const visiblePartnerUsed = partnerUsed.filter((item) => {
      const doc = docs.get(item.id);
      return Boolean(doc && visibleToEvent(doc, item.id, event, partner));
    });
    const chosen = new Set(value.items ?? []);
    const available = [...new Map([...visiblePartnerUsed.map((item) => [item.id, docs.get(item.id)] as const), ...partnerOwn.map((doc) => [text(doc.pictureId), doc] as const), ...ownDocs.map((doc) => [text(doc.pictureId), doc] as const)]).values()].filter((doc): doc is Document => Boolean(doc));
    const visibleChosen = (value.items ?? []).filter((id) => {
      const doc = docs.get(id);
      return Boolean(doc && visibleToEvent(doc, id, event, partner));
    });
    return {
      value,
      mode: slotMode(value),
      defaultItems: withView(visiblePartnerUsed, docs),
      ownItems: withView(visibleChosen.map((id) => ({ id, level: 'event' })), docs),
      effective: withView(resolvePictures(slot, ids, partner as LogoPartner | null, event as LogoEvent).filter((item) => {
        const doc = docs.get(item.id);
        return Boolean(doc && visibleToEvent(doc, item.id, event, partner));
      }), docs),
      candidates: available.filter((doc) => doc.isActive !== false && visibleToEvent(doc, text(doc.pictureId), event, partner) && !chosen.has(text(doc.pictureId))).map((doc) => ({ ...itemView('images', doc), level: scopeOf(fieldsOf(doc)) })),
      inactiveOwnItems: ownDocs.filter((doc) => doc.isActive === false).map((doc) => ({ ...itemView('images', doc), level: 'event' })),
      parentName: partner ? 'the partner' : 'the global library',
      partner: partner ? { name: text(partner.name) } : null,
    };
  }

  /** The global list of the kind's page: every global picture of the kind, switched off ones too, newest first. */
  async function listGlobal(db: Db): Promise<LibraryItemView[]> {
    const docs = await images(db).find({ ...GLOBAL_FILTER, tags: tag }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
    return docs.sort(byNewest).map((doc) => itemView('images', doc));
  }

  return { globalDocs, globalIds, resolveEventDocs, setPartner, setEvent, addToPartnerSlot, addToEventSlot, loadPartnerPanel, loadEventPanel, listGlobal };
}
