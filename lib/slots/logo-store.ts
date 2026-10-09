/**
 * Saving and reading what a partner and an event chose for the logo (camera#419, docs/BUILDING_BRICKS.md): the database side of `lib/slots/logo.ts`.
 *
 * - A partner's logo is `Partner.slots.logo`; the logos it lists are items of its library (a global logo it takes is added to its library in the same step) or
 *   its own uploads. Nothing is copied into its events: they look at it.
 * - An event chooses `Event.slots.logo` and, per place of use, `Event.slots[<place>]`; the logos are items of its partner's library or its own uploads (one
 *   way only, camera#361). **The first save of an event that is not on the model yet seeds its slots from its old list** (`eventSlotsFromLegacy`), so it keeps
 *   showing exactly what it showed; the old list is never deleted or changed.
 * - A value that is just "use the default" is not stored: an event that stored nothing follows.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { checkEventAssign, fieldsOf, itemView, loadEventLibrary, loadPartnerLibrary, savePartnerLibrary } from '@/lib/library/db';
import { canPartnerAssign, scopeOf } from '@/lib/library/rules';
import type { LibraryItemView } from '@/lib/library/types';
import { LOGO_PLACE_SLOTS, LOGO_SCENARIO_IDS, LOGO_SLOT, LOGO_SLOT_IDS, eventSlotsFromLegacy, isOnSlotModel, logoChain, partnerLogoValue, resolveEventLogos, type LogoEvent, type LogoPartner } from './logo';
import { nextSnapshots, type Snapshots } from './snapshot';
import { resolveSlot, slotMode, type ResolvedItem, type SlotMode, type SlotValue } from './resolve';

const MAX_ITEMS = 50;
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export type StoreResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404; reason: string };

/** What a page sends for a slot: `{ items?: string[], useDefault?: boolean }`, nothing else. */
export function parseSlotValue(input: unknown): StoreResult<SlotValue> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, status: 400, reason: 'A slot value is an object: { items, useDefault }.' };
  const { items, useDefault, ...rest } = input as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false, status: 400, reason: `Unknown field: ${Object.keys(rest)[0]}.` };
  if (items !== undefined && (!Array.isArray(items) || items.length > MAX_ITEMS || items.some((id) => typeof id !== 'string' || !id || id.length > 80))) {
    return { ok: false, status: 400, reason: `items must be a list of ids (at most ${MAX_ITEMS}).` };
  }
  if (useDefault !== undefined && typeof useDefault !== 'boolean') return { ok: false, status: 400, reason: 'useDefault must be true or false.' };
  const ids = [...new Set((items as string[] | undefined) ?? [])];
  return { ok: true, value: { ...(ids.length > 0 ? { items: ids } : {}), ...(useDefault === false ? { useDefault: false } : {}) } };
}

async function logoDocs(db: Db, ids: readonly string[]): Promise<Map<string, Document>> {
  const docs = ids.length ? await db.collection(COLLECTIONS.LOGOS).find({ logoId: { $in: [...ids] } }).toArray() : [];
  return new Map(docs.map((doc) => [text(doc.logoId), doc]));
}

/** The partner chooses its logo. A global logo it takes is added to its library; its own uploads are fine; a switched-off or unknown logo is refused. */
export async function setPartnerLogo(db: Db, partner: Document, input: unknown, now: string): Promise<StoreResult<SlotValue>> {
  const parsed = parseSlotValue(input);
  if (!parsed.ok) return parsed;
  // A partner chooses its logos; "use the default" has no meaning above the events, so only the items are kept.
  const value: SlotValue = parsed.value.items ? { items: parsed.value.items } : {};
  const ids = value.items ?? [];
  const docs = await logoDocs(db, ids);
  const toAdd: string[] = [];
  for (const id of ids) {
    const doc = docs.get(id);
    if (!doc) return { ok: false, status: 404, reason: `Unknown logo: ${id}` };
    if (doc.isActive === false) return { ok: false, status: 400, reason: `This logo is switched off in the library: ${text(doc.name) || id}` };
    const scope = scopeOf(fieldsOf(doc));
    if (scope === 'partner') {
      if (text(doc.partnerId) !== text(partner.partnerId)) return { ok: false, status: 400, reason: 'This logo belongs to another partner.' };
    } else {
      const check = canPartnerAssign(fieldsOf(doc), 'logo');
      if (!check.ok) return { ok: false, status: 400, reason: check.reason };
      toAdd.push(id);
    }
  }
  if (toAdd.length > 0) {
    const added = await savePartnerLibrary(db, partner, 'logos', { add: toAdd }, now);
    if (!added.ok) return { ok: false, status: added.status === 404 ? 404 : 400, reason: added.reason };
  }
  // The partner is on the model once it has a slot, even an empty one: "no logo" is a choice, not a missing value.
  await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId: text(partner.partnerId) }, { $set: { [`slots.${LOGO_SLOT}`]: value, updatedAt: now } });
  return { ok: true, value };
}

/** The snapshots of an event with these slots: what each place would use, from the library as it is now (an item it no longer has keeps its earlier snapshot). */
export async function eventLogoSnapshots(db: Db, partner: Document | null, event: Document, slots: Record<string, SlotValue>, now: string): Promise<Snapshots> {
  const resolved = resolveEventLogos(partner as LogoPartner | null, { slots });
  const ids = [...new Set(Object.values(resolved).flatMap((items) => items.map((item) => item.id)))];
  const docs = await logoDocs(db, ids);
  const bySlot = Object.fromEntries(LOGO_SCENARIO_IDS.map((scenario) => [LOGO_PLACE_SLOTS[scenario], resolved[scenario].map((item) => item.id)]));
  return nextSnapshots(event.slotSnapshots as Snapshots | undefined, bySlot, docs, now).snapshots;
}

async function partnerOf(db: Db, event: Document): Promise<Document | null> {
  const partnerId = text(event.partnerId);
  return partnerId ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId }) : null;
}

/** An event chooses its logo or the logo of one place of use. The first save puts an event that is not on the model on it, from its old list. */
export async function setEventLogoSlot(db: Db, event: Document, slotId: string, input: unknown, now: string): Promise<StoreResult<{ slots: Record<string, SlotValue>; seeded: boolean }>> {
  if (!LOGO_SLOT_IDS.includes(slotId)) return { ok: false, status: 400, reason: `Unknown slot: ${slotId}. It is one of ${LOGO_SLOT_IDS.join(', ')}.` };
  const parsed = parseSlotValue(input);
  if (!parsed.ok) return parsed;
  for (const id of parsed.value.items ?? []) {
    const allowed = await checkEventAssign(db, event, 'logos', id);
    if (!allowed.ok) return { ok: false, status: allowed.status, reason: allowed.reason };
  }
  const partner = await partnerOf(db, event);
  const seeded = !isOnSlotModel(event as LogoEvent);
  const base: Record<string, SlotValue> = seeded ? eventSlotsFromLegacy(event as never, partner as LogoPartner | null) : { ...((event.slots as Record<string, SlotValue>) ?? {}) };
  const slots = { ...base };
  if (slotMode(parsed.value) === 'default') delete slots[slotId];
  else slots[slotId] = parsed.value;
  // The event keeps a snapshot of what it uses in each place (the fail-safe, camera#421): refreshed with every save.
  const snapshots = await eventLogoSnapshots(db, partner, event, slots, now);
  await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId: text(event.eventId) }, { $set: { slots, slotSnapshots: snapshots, updatedAt: now } });
  return { ok: true, value: { slots, seeded } };
}

export interface LogoItemView extends LibraryItemView {
  /** The level that holds the logo in the chain: `partner`, `event` or `place`. */
  level?: string;
}

export interface SlotPanelData {
  slotId: string;
  /** What this level stored (or, for an event not on the model yet, what its old list amounts to). */
  value: SlotValue;
  mode: SlotMode;
  /** What the level above gives: the logos used when this level stores nothing. */
  defaultItems: LogoItemView[];
  /** The logos this level chose itself. */
  ownItems: LogoItemView[];
  /** What is used here now: own first, then the default when it is used next to them. */
  effective: LogoItemView[];
}

const withView = (resolved: readonly ResolvedItem[], views: Map<string, LibraryItemView>): LogoItemView[] =>
  resolved.flatMap((entry) => {
    const view = views.get(entry.id);
    return view ? [{ ...view, level: entry.level }] : [];
  });

async function viewsOf(db: Db, ids: readonly string[]): Promise<Map<string, LibraryItemView>> {
  const docs = await logoDocs(db, ids);
  return new Map([...docs].map(([id, doc]) => [id, itemView('logos', doc)]));
}

export interface PartnerLogoPanel {
  value: SlotValue;
  /** True once the partner has saved a logo choice; before that the panel shows what its old default rows amount to. */
  onModel: boolean;
  ownItems: LogoItemView[];
  /** The items the editor can pick: the partner's library and the global logos it can still take. */
  candidates: LibraryItemView[];
}

export async function loadPartnerLogoPanel(db: Db, partner: Document): Promise<PartnerLogoPanel> {
  const value = partnerLogoValue(partner as LogoPartner);
  const library = await loadPartnerLibrary(db, partner, 'logos');
  const views = await viewsOf(db, value.items ?? []);
  return {
    value,
    onModel: Boolean((partner.slots as Record<string, unknown> | undefined)?.[LOGO_SLOT]),
    ownItems: withView((value.items ?? []).map((id) => ({ id, level: 'partner' })), views),
    candidates: [...library.items.filter((item) => item.itemActive), ...library.available],
  };
}

export interface EventLogoPanels {
  onModel: boolean;
  partner: { partnerId: string; adminId: string; name: string } | null;
  slots: SlotPanelData[];
  /** The items the editor can pick: the partner's library and the event's own uploads. */
  candidates: LibraryItemView[];
}

/** The panels of the event: the event's logo and each place of use, with what each uses now and what it takes from above. */
export async function loadEventLogoPanels(db: Db, event: Document): Promise<EventLogoPanels> {
  const partner = await partnerOf(db, event);
  const onModel = isOnSlotModel(event as LogoEvent);
  const stored: Record<string, SlotValue> = onModel ? ((event.slots as Record<string, SlotValue>) ?? {}) : eventSlotsFromLegacy(event as never, partner as LogoPartner | null);
  const asEvent: LogoEvent = { slots: stored };
  const partnerLevel = (scenario: (typeof LOGO_SCENARIO_IDS)[number]) => logoChain(partner as LogoPartner | null, asEvent, scenario)[0];

  const panels: Array<{ slotId: string; value: SlotValue; effective: ResolvedItem[]; defaults: ResolvedItem[] }> = [];
  // The event's own logo: its default is the partner's logo (the chain of the first place stands for it: the partner level is the same for the slot).
  const eventScenario = LOGO_SCENARIO_IDS[1];
  panels.push({
    slotId: LOGO_SLOT,
    value: stored[LOGO_SLOT] ?? {},
    effective: resolveSlot(logoChain(partner as LogoPartner | null, asEvent, eventScenario).slice(0, 2)).items,
    defaults: resolveSlot([partnerLevel(eventScenario)]).items,
  });
  for (const scenario of LOGO_SCENARIO_IDS) {
    const chain = logoChain(partner as LogoPartner | null, asEvent, scenario);
    panels.push({ slotId: LOGO_PLACE_SLOTS[scenario], value: stored[LOGO_PLACE_SLOTS[scenario]] ?? {}, effective: resolveSlot(chain).items, defaults: resolveSlot(chain.slice(0, 2)).items });
  }

  const ids = [...new Set(panels.flatMap((panel) => [...panel.effective, ...panel.defaults, ...(panel.value.items ?? []).map((id) => ({ id, level: 'own' }))].map((item) => item.id)))];
  const views = await viewsOf(db, ids);
  const library = await loadEventLibrary(db, event, 'logos');
  return {
    onModel,
    partner: library.partner,
    slots: panels.map((panel) => ({
      slotId: panel.slotId,
      value: panel.value,
      mode: slotMode(panel.value),
      defaultItems: withView(panel.defaults, views),
      ownItems: withView((panel.value.items ?? []).map((id) => ({ id, level: 'own' })), views),
      effective: withView(panel.effective, views),
    })),
    candidates: library.available,
  };
}

/** A logo that was just uploaded joins what the event chose for a slot (the default stays in use next to it unless the slot already replaced it). */
export async function addLogoToEventSlot(db: Db, event: Document, slotId: string, logoId: string, now: string): Promise<StoreResult<{ slots: Record<string, SlotValue>; seeded: boolean }>> {
  const partner = await partnerOf(db, event);
  const stored: Record<string, SlotValue> = isOnSlotModel(event as LogoEvent) ? ((event.slots as Record<string, SlotValue>) ?? {}) : eventSlotsFromLegacy(event as never, partner as LogoPartner | null);
  const current = stored[slotId];
  return setEventLogoSlot(db, event, slotId, { items: [...(current?.items ?? []), logoId], ...(current?.useDefault === false ? { useDefault: false } : {}) }, now);
}

/** A logo that was just uploaded for the partner joins its logos. */
export async function addLogoToPartnerSlot(db: Db, partner: Document, logoId: string, now: string): Promise<StoreResult<SlotValue>> {
  return setPartnerLogo(db, partner, { items: [...(partnerLogoValue(partner as LogoPartner).items ?? []), logoId] }, now);
}

