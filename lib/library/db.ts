/**
 * The libraries on the database (camera#361, docs/LIBRARIES.md): what a partner's library and an event's library hold, and the checks and
 * writes that keep the one-way rule (Global -> Partner -> Event). Every function takes the database as an argument, so tests pass a fake one.
 * The pure rules are in rules.ts.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { logoDefaultsOf, sameLogoDefaults, type LogoDefault } from './logos';
import { LOGO_SLOT, LOGO_SLOT_IDS } from '@/lib/slots/logo';
import {
  KIND_META,
  LIBRARY_KINDS,
  eventAssignedIds,
  isAssignedKind,
  partnerDefaultIds,
  partnerSavedIds,
  type LibraryKind,
  type ScopeFields,
} from './kinds';
import { parseMessageArea } from '@/lib/frame/message-area';
import { withoutSampleSelfies } from './sample-selfie';
import { applyLibraryEdit, assignedFromGlobal, canEventAssign, canPartnerAssign, scopeOf } from './rules';
import type { EventLibrary, EventLibraryEntry, LibraryItemView, PartnerLibrary, PartnerLibraryEntry } from './types';
import { resolveAssetVisibility } from '@/lib/visual-assets/resolve';
import type { ShareableVisualAsset, VisualAssetLevelPolicy } from '@/lib/visual-assets/contracts';

/** Matches the global items: a missing or null scope (everything from before the libraries) and `global`. */
export const GLOBAL_FILTER = { $or: [{ scope: null }, { scope: 'global' }] };

/** The most items one list returns (the libraries hold tens of items; a longer list needs paging first). */
const LIST_LIMIT = 500;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const urlOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
/** The owner fields of a stored item. */
export const fieldsOf = (doc: Document): ScopeFields => ({ scope: doc.scope as ScopeFields['scope'], partnerId: text(doc.partnerId) || null, eventId: text(doc.eventId) || null });
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
    ...(text(doc.source) ? { source: text(doc.source) } : {}),
    scope: scopeOf(fieldsOf(doc)),
    itemActive: doc.isActive !== false,
    shareToChildren: doc.shareToChildren !== false,
    createdAt: urlOrNull(doc.createdAt),
    messageArea: kind === 'frames' ? parseMessageArea(doc.messageArea) : null,
  };
}

const byNewest = (a: Document, b: Document): number => text(b.createdAt).localeCompare(text(a.createdAt));

/** The ids of the items the events of a partner already use (their assigned frames or logos), without duplicates. */
export async function usedByPartnerEvents(db: Db, partnerId: string, kind: LibraryKind): Promise<string[]> {
  if (!isAssignedKind(kind)) return [];
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
  hiddenDocs: Document[];
}

function policyOf(record: Document | null | undefined): VisualAssetLevelPolicy | null {
  const policy = record?.visualAssetPolicy;
  if (!policy || typeof policy !== 'object') return null;
  return policy as VisualAssetLevelPolicy;
}

function hiddenRef(policy: VisualAssetLevelPolicy | null, kind: LibraryKind, id: string): boolean {
  return policy?.hidden?.some((ref) => ref.kind === kind && ref.id === id) ?? false;
}

function blockedRef(policy: VisualAssetLevelPolicy | null, kind: LibraryKind, id: string): boolean {
  return policy?.blockedForChildren?.some((ref) => ref.kind === kind && ref.id === id) ?? false;
}

async function resolvePartnerLibrary(db: Db, partner: Document, kind: LibraryKind): Promise<ResolvedPartnerLibrary> {
  const v2 = (partner.visualAssetPolicy as { inheritanceVersion?: unknown } | undefined)?.inheritanceVersion === 2;
  if (v2) {
    const partnerId = text(partner.partnerId);
    const policy = policyOf(partner);
    const inherited = await coll(db, kind)
      .find({ ...GLOBAL_FILTER, ...withoutSampleSelfies(kind), isActive: { $ne: false }, shareToChildren: { $ne: false } })
      .sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
    const visibleGlobal = inherited.filter((doc) => !hiddenRef(policy, kind, idOf(kind, doc)));
    const hiddenDocs = inherited.filter((doc) => hiddenRef(policy, kind, idOf(kind, doc)));
    const ownDocs = await coll(db, kind).find({ scope: 'partner', partnerId, ...withoutSampleSelfies(kind) }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
    return { saved: true, globalDocs: visibleGlobal, ownDocs, missing: [], hiddenDocs };
  }
  const savedIds = partnerSavedIds(kind, partner);
  const used = savedIds ? [] : await usedByPartnerEvents(db, text(partner.partnerId), kind);
  const { ids, saved } = assignedFromGlobal({ saved: savedIds, defaults: partnerDefaultIds(kind, partner), usedByEvents: used });
  const idField = KIND_META[kind].idField;
  const found = ids.length ? await coll(db, kind).find({ [idField]: { $in: ids } }).toArray() : [];
  // What a partner had before the libraries can include an event's own upload;
  // that is not a partner item. An explicit source-level private setting is
  // enforced even for legacy partner lists; a missing field stays shared.
  const globalDocs = found.filter((doc) => scopeOf(fieldsOf(doc)) === 'global' && doc.shareToChildren !== false);
  const ownDocs = await coll(db, kind).find({ scope: 'partner', partnerId: text(partner.partnerId), ...withoutSampleSelfies(kind) }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
  const foundIds = new Set(found.map((doc) => idOf(kind, doc)));
  return { saved, globalDocs, ownDocs, missing: ids.filter((id) => !foundIds.has(id)), hiddenDocs: [] };
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
  const isV2 = (partner.visualAssetPolicy as { inheritanceVersion?: unknown } | undefined)?.inheritanceVersion === 2;
  const availableDocs = isV2 ? [] : await coll(db, kind)
    .find({ ...GLOBAL_FILTER, ...withoutSampleSelfies(kind), isActive: true, shareToChildren: { $ne: false }, ...(held.length ? { [KIND_META[kind].idField]: { $nin: held } } : {}) })
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .toArray();
  return { kind, saved: resolved.saved, items, ...(isV2 ? { inheritanceEnabled: true as const, policy: policyOf(partner) ?? {}, hidden: resolved.hiddenDocs.map((doc) => itemView(kind, doc)) } : {}), available: availableDocs.sort(byNewest).map((doc) => itemView(kind, doc)), missing: resolved.missing };
}

export type PartnerAssetPolicyAction = 'hide' | 'show' | 'stop-forwarding' | 'allow-forwarding';
export type PartnerAssetPolicyResult = { ok: true; policy: VisualAssetLevelPolicy } | { ok: false; status: 400 | 404; reason: string };

/**
 * Opt a legacy partner into inherited catalogs without changing what it can
 * currently see: legacy omissions become partner-local hides. This is the
 * read-before-write compatibility fence until the explicit dry-run backfill.
 */
async function enablePartnerInheritance(db: Db, partner: Document, now: string): Promise<VisualAssetLevelPolicy> {
  const existing = policyOf(partner);
  if ((partner.visualAssetPolicy as { inheritanceVersion?: unknown } | undefined)?.inheritanceVersion === 2) return existing ?? {};
  const hidden: Array<{ kind: LibraryKind; id: string }> = [];
  for (const kind of LIBRARY_KINDS) {
    const current = await resolvePartnerLibrary(db, partner, kind);
    const currentlyHeld = new Set(current.globalDocs.map((doc) => idOf(kind, doc)));
    const globals = await coll(db, kind).find({ ...GLOBAL_FILTER, ...withoutSampleSelfies(kind) }).limit(10_000).toArray();
    for (const doc of globals) {
      const id = idOf(kind, doc);
      if (id && !currentlyHeld.has(id)) hidden.push({ kind, id });
    }
  }
  const policy: VisualAssetLevelPolicy = { hidden, blockedForChildren: [] };
  await db.collection(COLLECTIONS.PARTNERS).updateOne(
    { partnerId: text(partner.partnerId), 'visualAssetPolicy.inheritanceVersion': { $ne: 2 } },
    { $set: { visualAssetPolicy: { ...policy, inheritanceVersion: 2 }, updatedAt: now } },
  );
  return policy;
}

/** Explicit, idempotent transition from the legacy assigned catalog. */
export async function enablePartnerAssetInheritance(db: Db, partner: Document, now: string): Promise<VisualAssetLevelPolicy> {
  return enablePartnerInheritance(db, partner, now);
}

/** Apply a partner's local visibility/forwarding choice. Parent-level sharing
 * remains authoritative and cannot be restored by a child. */
export async function updatePartnerAssetPolicy(
  db: Db,
  partner: Document,
  kind: LibraryKind,
  itemId: string,
  action: PartnerAssetPolicyAction,
  now: string,
): Promise<PartnerAssetPolicyResult> {
  const item = await coll(db, kind).findOne({ [KIND_META[kind].idField]: itemId });
  if (!item) return { ok: false, status: 404, reason: `${KIND_META[kind].noun} not found` };
  const scope = scopeOf(fieldsOf(item));
  if (scope === 'event' || (scope === 'partner' && text(item.partnerId) !== text(partner.partnerId))) {
    return { ok: false, status: 400, reason: 'Only global assets and this partner’s own assets can be configured here.' };
  }
  if (scope === 'global' && item.shareToChildren === false) {
    return { ok: false, status: 400, reason: 'This global asset is not shared with partners. A child cannot override its owner’s sharing setting.' };
  }
  if (item.isActive === false) return { ok: false, status: 400, reason: 'This asset is inactive at its source level.' };

  const base = await enablePartnerInheritance(db, partner, now);
  const update: Document = { $set: { updatedAt: now } };
  const add: Record<string, unknown> = {};
  const pull: Record<string, unknown> = {};
  if (action === 'hide') add['visualAssetPolicy.hidden'] = { kind, id: itemId };
  if (action === 'show') pull['visualAssetPolicy.hidden'] = { kind, id: itemId };
  if (action === 'stop-forwarding') add['visualAssetPolicy.blockedForChildren'] = { kind, id: itemId };
  if (action === 'allow-forwarding') pull['visualAssetPolicy.blockedForChildren'] = { kind, id: itemId };
  if (Object.keys(add).length) update.$addToSet = add;
  if (Object.keys(pull).length) update.$pull = pull;
  await db.collection(COLLECTIONS.PARTNERS).updateOne(
    { partnerId: text(partner.partnerId), 'visualAssetPolicy.inheritanceVersion': 2 },
    update,
  );
  const saved = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: text(partner.partnerId) });
  return { ok: true, policy: policyOf(saved) ?? base };
}

export type EventAssetPolicyResult = { ok: true; policy: VisualAssetLevelPolicy } | { ok: false; status: 400 | 404; reason: string };

/** Hide/restore one inherited item in one event catalog. Event uploads remain
 * managed through the event's own active switch and are not inherited. */
export async function updateEventAssetPolicy(
  db: Db,
  event: Document,
  kind: LibraryKind,
  itemId: string,
  hidden: boolean,
  now: string,
): Promise<EventAssetPolicyResult> {
  const eventId = text(event.eventId);
  const item = await coll(db, kind).findOne({ [KIND_META[kind].idField]: itemId });
  if (!item) return { ok: false, status: 404, reason: `${KIND_META[kind].noun} not found` };
  if (scopeOf(fieldsOf(item)) === 'event' || (scopeOf(fieldsOf(item)) === 'partner' && text(item.partnerId) !== text(event.partnerId))) {
    return { ok: false, status: 400, reason: 'Only an inherited asset can be hidden in this event.' };
  }
  if (item.isActive === false || item.shareToChildren === false) return { ok: false, status: 400, reason: 'This asset is unavailable at its source level.' };
  const partner = await partnerOf(db, event);
  if (!partner) return { ok: false, status: 400, reason: 'The event needs a partner before it can hide inherited assets.' };
  // A safe compatibility transition snapshots the legacy partner's visible
  // global catalog into local hides before enabling child-level event choices.
  // This keeps the effective catalog unchanged while making the control usable.
  if ((partner.visualAssetPolicy as { inheritanceVersion?: unknown } | undefined)?.inheritanceVersion !== 2) {
    await enablePartnerInheritance(db, partner, now);
  }
  const currentPartner = await partnerOf(db, event);
  if ((currentPartner?.visualAssetPolicy as { inheritanceVersion?: unknown } | undefined)?.inheritanceVersion !== 2) {
    return { ok: false, status: 400, reason: 'The partner catalog could not be prepared for event-level visibility.' };
  }
  const partnerPolicy = policyOf(currentPartner);
  if (hiddenRef(partnerPolicy, kind, itemId) || blockedRef(partnerPolicy, kind, itemId)) {
    return { ok: false, status: 400, reason: 'The partner has hidden or stopped forwarding this asset. An event cannot restore it.' };
  }
  const update: Document = { $set: { 'visualAssetPolicy.inheritanceVersion': 2, updatedAt: now } };
  if (hidden) update.$addToSet = { 'visualAssetPolicy.hidden': { kind, id: itemId } };
  else update.$pull = { 'visualAssetPolicy.hidden': { kind, id: itemId } };
  await db.collection(COLLECTIONS.EVENTS).updateOne(
    { eventId, partnerId: text(event.partnerId) },
    update,
  );
  const saved = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId, partnerId: text(event.partnerId) });
  return { ok: true, policy: policyOf(saved) ?? {} };
}



async function partnerOf(db: Db, event: Document): Promise<Document | null> {
  const partnerId = text(event.partnerId);
  return partnerId ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId }) : null;
}

export async function loadEventLibrary(db: Db, event: Document, kind: LibraryKind): Promise<EventLibrary> {
  const eventId = text(event.eventId);
  const partner = await partnerOf(db, event);
  const resolved = partner ? await resolvePartnerLibrary(db, partner, kind) : { saved: true, globalDocs: [], ownDocs: [], missing: [] as string[], hiddenDocs: [] as Document[] };
  const inPartnerLibrary = new Set([...resolved.globalDocs, ...resolved.ownDocs].map((doc) => idOf(kind, doc)));

  const idField = KIND_META[kind].idField;
  // Images are not assigned: nothing is "assigned" and the event's images library is the whole `available` list (its fields choose from it).
  const rows = isAssignedKind(kind) ? (((event as Record<string, unknown>)[kind] as Document[] | undefined) ?? []) : [];
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

  const ownEventDocs = await coll(db, kind).find({ scope: 'event', eventId, ...withoutSampleSelfies(kind) }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
  // A logo is assigned once per scenario, so a logo the event shows in one scenario can still be taken for another (the page filters per scenario).
  const taken = new Set(kind === 'logos' ? [] : assignedIds);
  const isV2 = (partner?.visualAssetPolicy as { inheritanceVersion?: unknown } | undefined)?.inheritanceVersion === 2;
  const partnerPolicy = policyOf(partner);
  const eventPolicy = policyOf(event);
  const inheritedDocs = [...resolved.globalDocs, ...resolved.ownDocs];
  const childHiddenDocs: Document[] = [];
  const childDocs = inheritedDocs.filter((doc) => {
    if (doc.shareToChildren === false) return false;
    if (!isV2) return true;
    const id = idOf(kind, doc);
    if (blockedRef(partnerPolicy, kind, id)) return false;
    if (hiddenRef(eventPolicy, kind, id)) { childHiddenDocs.push(doc); return false; }
    return true;
  });
  const candidates = [...childDocs, ...ownEventDocs].filter((doc) => doc.isActive !== false && !taken.has(idOf(kind, doc)));
  return {
    kind,
    ...(isV2 ? { inheritanceEnabled: true as const, policy: eventPolicy ?? {} } : {}),
    partner: partner ? { partnerId: text(partner.partnerId), adminId: String(partner._id), name: text(partner.name) } : null,
    assigned,
    ...(isV2 ? { hidden: childHiddenDocs.map((doc) => itemView(kind, doc)) } : {}),
    available: candidates.sort(byNewest).map((doc) => itemView(kind, doc)),
    inactiveOwn: ownEventDocs.filter((doc) => doc.isActive === false).map((doc) => itemView(kind, doc)),
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
  const source = scopeOf(fieldsOf(item));
  if (source === 'event' && text(item.eventId) !== text(event.eventId)) {
    return { ok: false, status: 400, reason: `This ${noun} belongs to another event.` };
  }
  if (source === 'partner' && text(item.partnerId) !== text(partner?.partnerId ?? event.partnerId)) {
    return { ok: false, status: 400, reason: `This ${noun} belongs to another partner.` };
  }
  const inheritanceEnabled = (partner?.visualAssetPolicy as { inheritanceVersion?: unknown } | undefined)?.inheritanceVersion === 2;
  const visible = resolveAssetVisibility({
    asset: item as ShareableVisualAsset,
    kind,
    id: itemId,
    targetLevel: 'event',
    partnerId: partner ? text(partner.partnerId) : null,
    eventId: text(event.eventId),
    partnerPolicy: inheritanceEnabled ? policyOf(partner) : null,
    eventPolicy: inheritanceEnabled ? policyOf(event) : null,
  });
  if (!visible.available) {
    const reason = visible.reason === 'wrong-owner' && source === 'event'
      ? `This ${noun} belongs to another event.`
      : visible.reason === 'wrong-owner' && source === 'partner'
        ? `This ${noun} belongs to another partner.`
        : `This ${noun} is unavailable to this event (${visible.reason}).`;
    return { ok: false, status: 400, reason };
  }
  if (inheritanceEnabled) return { ok: true, item };
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
  /** The same for logos (`Partner.defaultLogos`): each default with its scenario and order (lib/library/logos.ts). */
  logoDefaults?: readonly LogoDefault[];
}

export type SavePartnerLibraryResult =
  | { ok: true; defaults: string[]; defaultsChanged: boolean; removedInUse: Record<string, number>; logoDefaults?: LogoDefault[] }
  | { ok: false; status: 400 | 404; reason: string };

/**
 * Events that use an item that leaves the partner's library keep it (decision 116, camera#361). The defaults cascade replaces the whole list of an event
 * that follows the defaults, so such an event stops following them: its list is its own from now on (the flag an edit of the list sets).
 */
async function keepInEvents(db: Db, partnerId: string, kind: LibraryKind, ids: string[]): Promise<void> {
  if (!ids.length || !isAssignedKind(kind)) return; // an event never has images assigned
  await db
    .collection(COLLECTIONS.EVENTS)
    .updateMany({ partnerId, [`${kind}.${KIND_META[kind].idField}`]: { $in: ids }, [`${kind}Overridden`]: { $ne: true } }, { $set: { [`${kind}Overridden`]: true } });
}

/**
 * Edits a partner's library: adds items of the global library, removes items, sets the defaults for new events. The first save turns what the
 * partner had before (its defaults and what its events use) into its own saved list for every kind, so nothing disappears. Removing an item
 * does not take it away from the events that already use it (they stop following the defaults, see keepInEvents); the result says how many do.
 */
export async function savePartnerLibrary(db: Db, partner: Document, kind: LibraryKind, change: PartnerLibraryChange, now: string): Promise<SavePartnerLibraryResult> {
  const add = [...new Set(change.add ?? [])];
  const remove = [...new Set(change.remove ?? [])];
  const noun = KIND_META[kind].noun;
  if (change.defaults && !isAssignedKind(kind)) return { ok: false, status: 400, reason: `An ${noun} has no default for new events: each picture field of an event chooses its own.` };
  if (change.defaults && kind !== 'frames') return { ok: false, status: 400, reason: `Defaults for new events are set for frames here; ${noun} defaults are set with their scenario.` };
  if (change.logoDefaults && kind !== 'logos') return { ok: false, status: 400, reason: 'Defaults with a scenario are set for logos only.' };

  if (add.length) {
    const docs = await coll(db, kind).find({ [KIND_META[kind].idField]: { $in: add } }).toArray();
    const byId = new Map(docs.map((doc) => [idOf(kind, doc), doc]));
    for (const id of add) {
      const doc = byId.get(id);
      if (!doc) return { ok: false, status: 404, reason: `Unknown ${noun}: ${id}` };
      if (doc.isActive === false) return { ok: false, status: 400, reason: `This ${noun} is switched off in the library: ${text(doc.name) || id}` };
      if (doc.shareToChildren === false) {
        return { ok: false, status: 400, reason: `This ${noun} is not shared with partner levels: ${text(doc.name) || id}` };
      }
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

  // Logo defaults carry their scenario and order; the same rule holds: a default is always an item of the library.
  let logoDefaults: LogoDefault[] | undefined;
  let logoDefaultsChanged = false;
  if (kind === 'logos') {
    const current = logoDefaultsOf(partner);
    logoDefaults = change.logoDefaults ? [...change.logoDefaults] : current.filter((row) => allowed.has(row.logoId));
    const outside = [...new Set(logoDefaults.map((row) => row.logoId))].filter((id) => !allowed.has(id));
    if (outside.length) return { ok: false, status: 400, reason: `A default for new events must be in the partner library: ${outside.join(', ')}` };
    logoDefaultsChanged = !sameLogoDefaults(logoDefaults, current);
  }

  const set: Record<string, unknown> = { ...Object.fromEntries(LIBRARY_KINDS.map((k) => [`library.${k}`, library[k]])), updatedAt: now };
  if (defaultsChanged && kind === 'frames') set.defaultFrames = defaults;
  if (logoDefaultsChanged) set.defaultLogos = logoDefaults;
  await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId: text(partner.partnerId) }, { $set: set });
  await keepInEvents(db, text(partner.partnerId), kind, remove);
  // A logo taken out of the partner library is no longer the partner's logo (camera#419); the events that chose it themselves keep it, as for frames.
  if (kind === 'logos' && remove.length) await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId: text(partner.partnerId) }, { $pull: { [`slots.${LOGO_SLOT}.items`]: { $in: remove } } as Document });

  const removedInUse: Record<string, number> = {};
  // An image is not assigned, so no event "uses" one here: a picture field that shows it keeps its address, and the picture keeps showing.
  for (const id of isAssignedKind(kind) ? remove : []) {
    const count = await db.collection(COLLECTIONS.EVENTS).countDocuments({ partnerId: text(partner.partnerId), [`${kind}.${KIND_META[kind].idField}`]: id });
    if (count > 0) removedInUse[id] = count;
  }
  if (logoDefaults) return { ok: true, defaults: [...new Set(logoDefaults.map((row) => row.logoId))], defaultsChanged: logoDefaultsChanged, removedInUse, logoDefaults };
  return { ok: true, defaults, defaultsChanged: defaultsChanged && kind === 'frames', removedInUse };
}

/** Where a library item is used: the events that have it assigned, the partner libraries that hold it, and the partners that make it a default for new events. */
export interface ItemUsage {
  events: number;
  partnerLibraries: number;
  partnerDefaults: number;
}

export async function usageOfItem(db: Db, kind: LibraryKind, itemId: string): Promise<ItemUsage> {
  const idField = KIND_META[kind].idField;
  // A logo is also used through the slot model (camera#419): an event holds it in `slots.<slot>.items`, a partner makes it its logo in `slots.logo.items`.
  const eventUse: Document[] = [{ [`${kind}.${idField}`]: itemId }, ...(kind === 'logos' ? LOGO_SLOT_IDS.map((slot) => ({ [`slots.${slot}.items`]: itemId })) : [])];
  const events = await db.collection(COLLECTIONS.EVENTS).countDocuments(eventUse.length > 1 ? { $or: eventUse } : eventUse[0]);
  const partnerLibraries = await db.collection(COLLECTIONS.PARTNERS).countDocuments({ [`library.${kind}`]: itemId });
  const defaultsPaths = kind === 'frames' ? ['defaultFrames'] : kind === 'logos' ? ['defaultLogos.logoId', `slots.${LOGO_SLOT}.items`] : [];
  const partnerDefaults = defaultsPaths.length ? await db.collection(COLLECTIONS.PARTNERS).countDocuments(defaultsPaths.length > 1 ? { $or: defaultsPaths.map((path) => ({ [path]: itemId })) } : { [defaultsPaths[0]]: itemId }) : 0;
  return { events, partnerLibraries, partnerDefaults };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The refusal to delete an item that is in use (camera#392), or null when nothing uses it. Switching it off is the way to retire an item that is in use. */
export function inUseSentence(noun: string, usage: ItemUsage): string | null {
  const parts = [
    usage.events ? plural(usage.events, 'event', 'events') : '',
    usage.partnerLibraries ? plural(usage.partnerLibraries, 'partner library', 'partner libraries') : '',
    usage.partnerDefaults ? `${plural(usage.partnerDefaults, 'partner', 'partners')} that make${usage.partnerDefaults === 1 ? 's' : ''} it a default for new events` : '',
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `This ${noun} is used by ${parts.join(', ')}. Switch it off instead, so nobody can take it any more, or remove it from them first.`;
}

/** `eventId` here is the event UUID (`Event.eventId`), like the `eventId` an upload carries. */
export type UpdateUploadResult = { ok: true; item: Document } | { ok: false; status: 400 | 404; reason: string };

/** What the owner of an own upload may change: its name and, for a frame, its message area (null removes it). */
export interface UploadChanges {
  name?: unknown;
  messageArea?: unknown;
  isActive?: unknown;
}

/**
 * Changes an item that was uploaded at the partner level or the event level (never a global one). A frame's message area (camera#366) says where a message
 * is written on it; with one it carries the messages of an event instead of being a frame the guest picks.
 */
export async function updateLibraryUpload(
  db: Db,
  kind: LibraryKind,
  itemId: string,
  level: { scope: 'partner'; partnerId: string } | { scope: 'event'; eventId: string },
  changes: UploadChanges,
  now: string
): Promise<UpdateUploadResult> {
  const { idField, noun } = KIND_META[kind];
  const item = await coll(db, kind).findOne({ [idField]: itemId });
  if (!item) return { ok: false, status: 404, reason: `${noun[0].toUpperCase()}${noun.slice(1)} not found` };
  const scope = scopeOf(fieldsOf(item));
  const mine = level.scope === 'event' ? scope === 'event' && text(item.eventId) === level.eventId : scope === 'partner' && text(item.partnerId) === level.partnerId;
  if (!mine) return { ok: false, status: 400, reason: `Only a ${noun} uploaded for this ${level.scope} can be changed here.` };

  const set: Record<string, unknown> = { updatedAt: now };
  const unset: Record<string, ''> = {};
  if (changes.name !== undefined) {
    const name = typeof changes.name === 'string' ? changes.name.trim() : '';
    if (!name || name.length > 120) return { ok: false, status: 400, reason: 'The name must have 1 to 120 characters.' };
    set.name = name;
  }
  if (changes.messageArea !== undefined) {
    if (kind !== 'frames') return { ok: false, status: 400, reason: `A ${noun} has no message area.` };
    if (changes.messageArea === null) unset.messageArea = '';
    else {
      const area = parseMessageArea(changes.messageArea);
      if (!area) return { ok: false, status: 400, reason: 'The message area is not usable: the box must sit inside the 1920 x 1080 frame and the colour must be a hex colour.' };
      set.messageArea = area;
    }
  }
  if (changes.isActive !== undefined) {
    if (typeof changes.isActive !== 'boolean') return { ok: false, status: 400, reason: 'isActive must be true or false.' };
    set.isActive = changes.isActive;
  }
  await coll(db, kind).updateOne({ [idField]: itemId }, Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set });
  const updated = await coll(db, kind).findOne({ [idField]: itemId });
  return { ok: true, item: updated ?? { ...item, ...set } };
}

export type DeleteUploadResult = { ok: true } | { ok: false; status: 400 | 404 | 409; reason: string };

/**
 * Deletes an item uploaded at partner or event level. API routes must run `findAssetUsages` first and refuse while any reference remains; this
 * helper retains its legacy cleanup as a final no-op safety net for the already-resolved case. Global uploads use the global catalog delete path.
 */
export async function deleteLibraryUpload(db: Db, kind: LibraryKind, itemId: string, level: { scope: 'partner'; partnerId: string } | { scope: 'event'; eventId: string }): Promise<DeleteUploadResult> {
  const { idField, noun } = KIND_META[kind];
  const item = await coll(db, kind).findOne({ [idField]: itemId });
  if (!item) return { ok: false, status: 404, reason: `${noun[0].toUpperCase()}${noun.slice(1)} not found` };
  const scope = scopeOf(fieldsOf(item));
  // An image is not assigned to an event, so there is no assignment to take away; the file stays in the store, so a field that shows it keeps showing it.
  const assigned = isAssignedKind(kind);
  if (level.scope === 'event') {
    if (scope !== 'event' || text(item.eventId) !== level.eventId) return { ok: false, status: 400, reason: `Only a ${noun} uploaded for this event can be deleted here.` };
    if (assigned) await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId: level.eventId }, { $pull: { [kind]: { [idField]: itemId } } as Document });
    // On the slot model the event holds it in its slots too (camera#419): taken out of every place it was chosen in.
    if (kind === 'logos') await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId: level.eventId }, { $pull: Object.fromEntries(LOGO_SLOT_IDS.map((slot) => [`slots.${slot}.items`, itemId])) as Document });
  } else {
    if (scope !== 'partner' || text(item.partnerId) !== level.partnerId) return { ok: false, status: 400, reason: `Only a ${noun} uploaded for this partner can be deleted here.` };
    const holds: Document[] = [{ [`${kind}.${idField}`]: itemId }, ...(kind === 'logos' ? LOGO_SLOT_IDS.map((slot) => ({ [`slots.${slot}.items`]: itemId })) : [])];
    const inUse = assigned ? await db.collection(COLLECTIONS.EVENTS).countDocuments({ partnerId: level.partnerId, $or: holds }) : 0;
    if (inUse > 0) return { ok: false, status: 409, reason: `${inUse} event${inUse === 1 ? '' : 's'} still use${inUse === 1 ? 's' : ''} this ${noun}. Remove it from them first.` };
    if (kind === 'frames') await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId: level.partnerId }, { $pull: { defaultFrames: itemId } as Document });
    if (kind === 'logos') await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId: level.partnerId }, { $pull: { defaultLogos: { logoId: itemId }, [`slots.${LOGO_SLOT}.items`]: itemId } as Document });
  }
  await coll(db, kind).deleteOne({ [idField]: itemId });
  return { ok: true };
}
