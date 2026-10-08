/**
 * The libraries on the database (camera#361, docs/LIBRARIES.md): what a partner's library and an event's library hold, and the checks and
 * writes that keep the one-way rule (Global -> Partner -> Event). Every function takes the database as an argument, so tests pass a fake one.
 * The pure rules are in rules.ts.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  KIND_META,
  LIBRARY_KINDS,
  eventAssignedIds,
  partnerDefaultIds,
  partnerSavedIds,
  type LibraryKind,
  type ScopeFields,
} from './kinds';
import { applyLibraryEdit, assignedFromGlobal, canEventAssign, canPartnerAssign, scopeOf } from './rules';
import type { EventLibrary, EventLibraryEntry, LibraryItemView, PartnerLibrary, PartnerLibraryEntry } from './types';

/** Matches the global items: a missing or null scope (everything from before the libraries) and `global`. */
export const GLOBAL_FILTER = { $or: [{ scope: null }, { scope: 'global' }] };

/** The most items one list returns (the libraries hold tens of items; a longer list needs paging first). */
const LIST_LIMIT = 500;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const urlOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
/** The owner fields of a stored item. */
const fieldsOf = (doc: Document): ScopeFields => ({ scope: doc.scope as ScopeFields['scope'], partnerId: text(doc.partnerId) || null, eventId: text(doc.eventId) || null });
const coll = (db: Db, kind: LibraryKind) => db.collection(KIND_META[kind].collection);
const idOf = (kind: LibraryKind, doc: Document): string => text(doc[KIND_META[kind].idField]);


export function itemView(kind: LibraryKind, doc: Document): LibraryItemView {
  return {
    id: idOf(kind, doc),
    kind,
    name: text(doc.name) || idOf(kind, doc),
    description: text(doc.description),
    imageUrl: urlOrNull(doc.imageUrl),
    thumbnailUrl: urlOrNull(doc.thumbnailUrl),
    scope: scopeOf(fieldsOf(doc)),
    itemActive: doc.isActive !== false,
    createdAt: urlOrNull(doc.createdAt),
  };
}

const byNewest = (a: Document, b: Document): number => text(b.createdAt).localeCompare(text(a.createdAt));

/** The ids of the items the events of a partner already use (their assigned frames or logos), without duplicates. */
export async function usedByPartnerEvents(db: Db, partnerId: string, kind: LibraryKind): Promise<string[]> {
  const events = await db.collection(COLLECTIONS.EVENTS).find({ partnerId }, { projection: { [kind]: 1 } }).toArray();
  return [...new Set(events.flatMap((event) => eventAssignedIds(kind, event)))];
}

interface ResolvedPartnerLibrary {
  /** False while the library is still computed from what the partner had (nothing saved yet). */
  saved: boolean;
  /** Global items in the library that exist. */
  globalDocs: Document[];
  /** The partner's own uploads. */
  ownDocs: Document[];
  /** Ids the library lists that no longer exist in the collection. */
  missing: string[];
}

async function resolvePartnerLibrary(db: Db, partner: Document, kind: LibraryKind): Promise<ResolvedPartnerLibrary> {
  const savedIds = partnerSavedIds(kind, partner);
  const used = savedIds ? [] : await usedByPartnerEvents(db, text(partner.partnerId), kind);
  const { ids, saved } = assignedFromGlobal({ saved: savedIds, defaults: partnerDefaultIds(kind, partner), usedByEvents: used });
  const idField = KIND_META[kind].idField;
  const found = ids.length ? await coll(db, kind).find({ [idField]: { $in: ids } }).toArray() : [];
  // What a partner had before the libraries can include an event's own upload; that is not a partner item.
  const globalDocs = found.filter((doc) => scopeOf(fieldsOf(doc)) === 'global');
  const ownDocs = await coll(db, kind).find({ scope: 'partner', partnerId: text(partner.partnerId) }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
  const foundIds = new Set(found.map((doc) => idOf(kind, doc)));
  return { saved, globalDocs, ownDocs, missing: ids.filter((id) => !foundIds.has(id)) };
}

/** Every id in a partner's library: the global items it took and its own uploads. */
export async function partnerLibraryIds(db: Db, partner: Document, kind: LibraryKind): Promise<Set<string>> {
  const resolved = await resolvePartnerLibrary(db, partner, kind);
  return new Set([...resolved.globalDocs, ...resolved.ownDocs].map((doc) => idOf(kind, doc)));
}



export async function loadPartnerLibrary(db: Db, partner: Document, kind: LibraryKind): Promise<PartnerLibrary> {
  const resolved = await resolvePartnerLibrary(db, partner, kind);
  const defaults = new Set(partnerDefaultIds(kind, partner));
  const entry = (doc: Document, via: 'assigned' | 'own'): PartnerLibraryEntry => ({ ...itemView(kind, doc), via, isDefault: defaults.has(idOf(kind, doc)) });
  const items = [...resolved.globalDocs.map((doc) => entry(doc, 'assigned')), ...resolved.ownDocs.map((doc) => entry(doc, 'own'))];
  const held = resolved.globalDocs.map((doc) => idOf(kind, doc));
  const availableDocs = await coll(db, kind)
    .find({ ...GLOBAL_FILTER, isActive: true, ...(held.length ? { [KIND_META[kind].idField]: { $nin: held } } : {}) })
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .toArray();
  return { kind, saved: resolved.saved, items, available: availableDocs.sort(byNewest).map((doc) => itemView(kind, doc)), missing: resolved.missing };
}



async function partnerOf(db: Db, event: Document): Promise<Document | null> {
  const partnerId = text(event.partnerId);
  return partnerId ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId }) : null;
}

export async function loadEventLibrary(db: Db, event: Document, kind: LibraryKind): Promise<EventLibrary> {
  const eventId = text(event.eventId);
  const partner = await partnerOf(db, event);
  const resolved = partner ? await resolvePartnerLibrary(db, partner, kind) : { saved: true, globalDocs: [], ownDocs: [], missing: [] as string[] };
  const inPartnerLibrary = new Set([...resolved.globalDocs, ...resolved.ownDocs].map((doc) => idOf(kind, doc)));

  const idField = KIND_META[kind].idField;
  const rows = ((event as Record<string, unknown>)[kind] as Document[] | undefined) ?? [];
  const assignedIds = [...new Set(rows.map((row) => text(row?.[idField])).filter(Boolean))];
  const docs = assignedIds.length ? await coll(db, kind).find({ [idField]: { $in: assignedIds } }).toArray() : [];
  const docById = new Map(docs.map((doc) => [idOf(kind, doc), doc]));

  const assigned: EventLibraryEntry[] = [];
  const missing: EventLibrary['missing'] = [];
  for (const row of rows) {
    const id = text(row?.[idField]);
    const doc = id ? docById.get(id) : undefined;
    if (!id) continue;
    if (!doc) {
      missing.push({ id, assignment: row });
      continue;
    }
    const scope = scopeOf(fieldsOf(doc));
    assigned.push({ ...itemView(kind, doc), assignment: row, stillInPartnerLibrary: scope === 'event' ? true : inPartnerLibrary.has(id) });
  }

  const ownEventDocs = await coll(db, kind).find({ scope: 'event', eventId }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
  const taken = new Set(assignedIds);
  const candidates = [...resolved.globalDocs, ...resolved.ownDocs, ...ownEventDocs].filter((doc) => doc.isActive !== false && !taken.has(idOf(kind, doc)));
  return {
    kind,
    partner: partner ? { partnerId: text(partner.partnerId), name: text(partner.name) } : null,
    assigned,
    available: candidates.sort(byNewest).map((doc) => itemView(kind, doc)),
    missing,
  };
}

export type AssignCheck = { ok: true; item: Document } | { ok: false; status: 400 | 404; reason: string };

/** May this event newly take this item? One way only: from its partner's library, or its own upload. */
export async function checkEventAssign(db: Db, event: Document, kind: LibraryKind, itemId: string): Promise<AssignCheck> {
  const noun = KIND_META[kind].noun;
  const item = await coll(db, kind).findOne({ [KIND_META[kind].idField]: itemId });
  if (!item) return { ok: false, status: 404, reason: `${noun[0].toUpperCase()}${noun.slice(1)} not found` };
  if (item.isActive === false) return { ok: false, status: 400, reason: `This ${noun} is switched off in the library.` };
  const partner = await partnerOf(db, event);
  const resolved = partner ? await resolvePartnerLibrary(db, partner, kind) : null;
  const check = canEventAssign(fieldsOf(item), {
    noun,
    itemId,
    eventId: text(event.eventId),
    partnerId: partner ? text(partner.partnerId) : null,
    partnerLibrary: new Set((resolved?.globalDocs ?? []).map((doc) => idOf(kind, doc))),
  });
  return check.ok ? { ok: true, item } : { ok: false, status: 400, reason: check.reason };
}

export interface PartnerLibraryChange {
  add?: readonly string[];
  remove?: readonly string[];
  /** The ids marked "default for new events" (frames only); omitted keeps the current ones that are still in the library. */
  defaults?: readonly string[];
}

export type SavePartnerLibraryResult =
  | { ok: true; defaults: string[]; defaultsChanged: boolean; removedInUse: Record<string, number> }
  | { ok: false; status: 400 | 404; reason: string };

/**
 * Edits a partner's library: adds items of the global library, removes items, sets the defaults for new events. The first save turns what the
 * partner had before (its defaults and what its events use) into its own saved list for every kind, so nothing disappears. Removing an item
 * does not touch the events that already use it; the result says how many do.
 */
export async function savePartnerLibrary(db: Db, partner: Document, kind: LibraryKind, change: PartnerLibraryChange, now: string): Promise<SavePartnerLibraryResult> {
  const add = [...new Set(change.add ?? [])];
  const remove = [...new Set(change.remove ?? [])];
  const noun = KIND_META[kind].noun;
  if (change.defaults && kind !== 'frames') return { ok: false, status: 400, reason: `Defaults for new events are set for frames here; ${noun} defaults are set with their scenario.` };

  if (add.length) {
    const docs = await coll(db, kind).find({ [KIND_META[kind].idField]: { $in: add } }).toArray();
    const byId = new Map(docs.map((doc) => [idOf(kind, doc), doc]));
    for (const id of add) {
      const doc = byId.get(id);
      if (!doc) return { ok: false, status: 404, reason: `Unknown ${noun}: ${id}` };
      if (doc.isActive === false) return { ok: false, status: 400, reason: `This ${noun} is switched off in the library: ${text(doc.name) || id}` };
      const check = canPartnerAssign(fieldsOf(doc), noun);
      if (!check.ok) return { ok: false, status: 400, reason: check.reason };
    }
  }

  const library: Record<string, string[]> = {};
  let ownIds: string[] = [];
  for (const k of LIBRARY_KINDS) {
    const resolved = await resolvePartnerLibrary(db, partner, k);
    // An id whose item no longer exists is not carried into the saved list.
    library[k] = resolved.globalDocs.map((doc) => idOf(k, doc));
    if (k === kind) ownIds = resolved.ownDocs.map((doc) => idOf(k, doc));
  }
  library[kind] = applyLibraryEdit(library[kind], add, remove);

  const currentDefaults = partnerDefaultIds(kind, partner);
  const allowed = new Set([...library[kind], ...ownIds]);
  let defaults = currentDefaults;
  if (change.defaults) {
    const wanted = [...new Set(change.defaults)];
    const outside = wanted.filter((id) => !allowed.has(id));
    if (outside.length) return { ok: false, status: 400, reason: `A default for new events must be in the partner library: ${outside.join(', ')}` };
    defaults = wanted;
  } else {
    defaults = currentDefaults.filter((id) => allowed.has(id));
  }
  const defaultsChanged = defaults.length !== currentDefaults.length || defaults.some((id, i) => id !== currentDefaults[i]);

  const set: Record<string, unknown> = { 'library.frames': library.frames, 'library.logos': library.logos, updatedAt: now };
  if (defaultsChanged && kind === 'frames') set.defaultFrames = defaults;
  await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId: text(partner.partnerId) }, { $set: set });

  const removedInUse: Record<string, number> = {};
  for (const id of remove) {
    const count = await db.collection(COLLECTIONS.EVENTS).countDocuments({ partnerId: text(partner.partnerId), [`${kind}.${KIND_META[kind].idField}`]: id });
    if (count > 0) removedInUse[id] = count;
  }
  return { ok: true, defaults, defaultsChanged: defaultsChanged && kind === 'frames', removedInUse };
}

/** `eventId` here is the event UUID (`Event.eventId`), like the `eventId` an upload carries. */
export type DeleteUploadResult = { ok: true } | { ok: false; status: 400 | 404 | 409; reason: string };

/**
 * Deletes an item that was uploaded at the partner level or the event level (never a global one: that is the global admins' list). An event's
 * own upload is unassigned from its event first; a partner's own upload cannot be deleted while one of its events has it assigned.
 */
export async function deleteLibraryUpload(db: Db, kind: LibraryKind, itemId: string, level: { scope: 'partner'; partnerId: string } | { scope: 'event'; eventId: string }): Promise<DeleteUploadResult> {
  const { idField, noun } = KIND_META[kind];
  const item = await coll(db, kind).findOne({ [idField]: itemId });
  if (!item) return { ok: false, status: 404, reason: `${noun[0].toUpperCase()}${noun.slice(1)} not found` };
  const scope = scopeOf(fieldsOf(item));
  if (level.scope === 'event') {
    if (scope !== 'event' || text(item.eventId) !== level.eventId) return { ok: false, status: 400, reason: `Only a ${noun} uploaded for this event can be deleted here.` };
    await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId: level.eventId }, { $pull: { [kind]: { [idField]: itemId } } as Document });
  } else {
    if (scope !== 'partner' || text(item.partnerId) !== level.partnerId) return { ok: false, status: 400, reason: `Only a ${noun} uploaded for this partner can be deleted here.` };
    const inUse = await db.collection(COLLECTIONS.EVENTS).countDocuments({ partnerId: level.partnerId, [`${kind}.${idField}`]: itemId });
    if (inUse > 0) return { ok: false, status: 409, reason: `${inUse} event${inUse === 1 ? '' : 's'} still use${inUse === 1 ? 's' : ''} this ${noun}. Remove it from them first.` };
    if (kind === 'frames') await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId: level.partnerId }, { $pull: { defaultFrames: itemId } as Document });
  }
  await coll(db, kind).deleteOne({ [idField]: itemId });
  return { ok: true };
}
