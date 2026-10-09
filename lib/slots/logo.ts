/**
 * The logo of an event on the slot model (camera#419, docs/BUILDING_BRICKS.md): the logo is one slot, `logo`, chosen at the partner and at the event, with
 * places of use under the event's logo (the pages of the user journey, the loading screen of the capture app, the loading screen of the slideshow, the
 * slideshow transition, which has no screen yet). A place uses the event's logo by default and can have its own (use the default, add more, replace).
 *
 * **Nothing is migrated by reading.** An event that is not on the slot model yet (`slots` absent) is read the way it always was, from its own `logos` list: the
 * caller keeps that path (`isOnSlotModel`, `GET /api/events/<id>/logos`), so the answer for every existing event is exactly what it was. An event on the model
 * (`slots` present, even empty) uses the chain of `lib/slots/resolve.ts`, and the partner's logo comes from its slot or, before the partner is on the model,
 * from its `defaultLogos` rows of the place's scenario, so a partner's existing defaults are not lost.
 * Pure and free of server code; unit-tested (logo.test.ts).
 */

import { LOGO_SCENARIOS, type LogoScenarioId } from '@/lib/library/logos';
import { resolveSlot, type ResolvedItem, type SlotLevel, type SlotValue } from './resolve';

export const LOGO_SLOT = 'logo';

/** The place of use of each former scenario: its slot id, under the event's `logo`. Slot ids are stored as field names, so they have no dots. */
export const LOGO_PLACE_SLOTS: Record<LogoScenarioId, string> = {
  'onboarding-thankyou': 'logo-pages',
  'loading-capture': 'logo-capture-loading',
  'loading-slideshow': 'logo-slideshow-loading',
  'slideshow-transition': 'logo-slideshow-transition',
};

/** Every slot id a logo can be stored under (the event's logo and its places of use): where an item is looked for when something asks who uses it. */
export const LOGO_SLOT_IDS: readonly string[] = [LOGO_SLOT, ...Object.values(LOGO_PLACE_SLOTS)];

type Slots = Record<string, SlotValue | undefined> | undefined;
interface LegacyDefault { logoId?: unknown; scenario?: unknown; order?: unknown }

export interface LogoPartner { slots?: Slots; defaultLogos?: readonly LegacyDefault[] }
export interface LogoEvent { slots?: Slots }

const orderOf = (row: { order?: unknown }) => (typeof row.order === 'number' && Number.isFinite(row.order) ? row.order : 0);
const idsOf = (rows: ReadonlyArray<{ logoId?: unknown; order?: unknown }>): string[] =>
  [...new Set([...rows].sort((a, b) => orderOf(a) - orderOf(b)).flatMap((row) => (typeof row.logoId === 'string' && row.logoId ? [row.logoId] : [])))];

/** What the partner chose for the logo: its slot, or, before it is on the model, its default rows of this scenario. */
function partnerValue(partner: LogoPartner | null | undefined, scenario: LogoScenarioId): SlotValue | undefined {
  const own = partner?.slots?.[LOGO_SLOT];
  if (own) return own;
  const rows = (partner?.defaultLogos ?? []).filter((row) => row.scenario === scenario);
  return rows.length > 0 ? { items: idsOf(rows) } : undefined;
}

/** True once an event is on the slot model: its `slots` exists, even empty. Before that its own `logos` list is read as it always was. */
export const isOnSlotModel = (event: LogoEvent): boolean => event.slots !== undefined && event.slots !== null;

/** The levels of the chain for one place of use of an event on the model, root first: the partner, the event, the place. */
export function logoChain(partner: LogoPartner | null | undefined, event: LogoEvent, scenario: LogoScenarioId): SlotLevel[] {
  const slots = event.slots ?? {};
  return [
    { level: 'partner', value: partnerValue(partner, scenario) },
    { level: 'event', value: slots[LOGO_SLOT] },
    { level: 'place', value: slots[LOGO_PLACE_SLOTS[scenario]] },
  ];
}

/** The logos used in one place of use, in the order they are used: the event's own first, then what it takes from the partner. */
export function resolveLogoPlace(partner: LogoPartner | null | undefined, event: LogoEvent, scenario: LogoScenarioId): ResolvedItem[] {
  return resolveSlot(logoChain(partner, event, scenario)).items;
}

export const LOGO_SCENARIO_IDS: readonly LogoScenarioId[] = LOGO_SCENARIOS.map((scenario) => scenario.id);

/** Every place of use with its logos: the answer of `GET /api/events/<id>/logos`, as ids before the library is asked for the pictures. */
export function resolveEventLogos(partner: LogoPartner | null | undefined, event: LogoEvent): Record<LogoScenarioId, ResolvedItem[]> {
  return Object.fromEntries(LOGO_SCENARIO_IDS.map((scenario) => [scenario, resolveLogoPlace(partner, event, scenario)])) as Record<LogoScenarioId, ResolvedItem[]>;
}

interface LegacyAssignment { logoId?: unknown; scenario?: unknown; order?: unknown; isActive?: unknown }
export interface LegacyLogoEvent { logos?: readonly LegacyAssignment[]; logosOverridden?: unknown }

/** The partner's own logos as the panel shows them: its slot, or before it is on the model the logos of its default rows (the ones of all scenarios, by order). */
export function partnerLogoValue(partner: LogoPartner | null | undefined): SlotValue {
  const own = partner?.slots?.[LOGO_SLOT];
  if (own) return own;
  const rows = [...(partner?.defaultLogos ?? [])].sort((a, b) => orderOf(a) - orderOf(b));
  const ids = idsOf(rows);
  return ids.length > 0 ? { items: ids } : {};
}

const legacyIds = (event: LegacyLogoEvent, scenario: LogoScenarioId): string[] =>
  idsOf((event.logos ?? []).filter((row) => row.scenario === scenario && Boolean(row.isActive)));

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * The slots that make an event that is not on the model show exactly what it showed: **following** (nothing stored) when it follows its partner and its list is
 * what the partner's defaults give in every scenario; otherwise its own list, as one `logo` slot when every scenario shows the same logos, else one place of use
 * per scenario. Everything is "replace", so nothing is taken from the partner that the event did not show. Nothing is deleted: the old list stays where it is.
 */
export function eventSlotsFromLegacy(event: LegacyLogoEvent, partner: LogoPartner | null | undefined): Record<string, SlotValue> {
  const lists = LOGO_SCENARIO_IDS.map((scenario) => legacyIds(event, scenario));
  const partnerLists = LOGO_SCENARIO_IDS.map((scenario) => idsOf(((partnerValue(partner, scenario)?.items ?? []) as string[]).map((logoId) => ({ logoId }))));
  const follows = event.logosOverridden !== true && lists.every((ids, i) => sameIds(ids, partnerLists[i]));
  if (follows) return {};
  if (lists.every((ids) => sameIds(ids, lists[0]))) return { [LOGO_SLOT]: lists[0].length > 0 ? { items: lists[0], useDefault: false } : { useDefault: false } };
  return Object.fromEntries(LOGO_SCENARIO_IDS.map((scenario, i) => [LOGO_PLACE_SLOTS[scenario], lists[i].length > 0 ? { items: lists[i], useDefault: false } : { useDefault: false }]));
}

