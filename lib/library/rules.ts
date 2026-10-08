/**
 * The rules of the libraries (camera#361), pure: who may take what from which level. One way only: Global -> Partner -> Event. Nothing
 * flows upwards, and an event cannot pick from the global library directly; it picks from its partner's library or uploads its own.
 * Unit-tested in rules.test.ts; the database layer (db.ts) feeds these functions.
 */

import type { LibraryScope, ScopeFields } from './kinds';

export type Check = { ok: true } | { ok: false; reason: string };

/** The scope of an item; a missing or unknown scope is global (every item from before the libraries). */
export function scopeOf(item: ScopeFields | null | undefined): LibraryScope {
  return item?.scope === 'partner' || item?.scope === 'event' ? item.scope : 'global';
}

/** A partner takes items from the global library only. */
export function canPartnerAssign(item: ScopeFields, noun: string): Check {
  const scope = scopeOf(item);
  if (scope === 'global') return { ok: true };
  return {
    ok: false,
    reason: `This ${noun} was uploaded for ${scope === 'partner' ? 'a partner' : 'one event'}; only items of the global library can be added to a partner library.`,
  };
}

export interface EventAssignContext {
  noun: string;
  itemId: string;
  /** The event's UUID (`Event.eventId`), the id an event-level upload carries in `eventId`. */
  eventId: string;
  /** The partner of the event; null when the event has none. */
  partnerId: string | null;
  /** Ids of the global items the partner has in its library (see `assignedFromGlobal`). */
  partnerLibrary: ReadonlySet<string>;
}

/** An event takes items from its partner's library, or its own uploads: never straight from the global library. */
export function canEventAssign(item: ScopeFields, ctx: EventAssignContext): Check {
  const scope = scopeOf(item);
  if (scope === 'event') {
    return item.eventId === ctx.eventId ? { ok: true } : { ok: false, reason: `This ${ctx.noun} was uploaded for another event.` };
  }
  if (scope === 'partner') {
    return ctx.partnerId && item.partnerId === ctx.partnerId ? { ok: true } : { ok: false, reason: `This ${ctx.noun} belongs to another partner.` };
  }
  if (!ctx.partnerId) return { ok: false, reason: `This event has no partner, so it has no library to take a ${ctx.noun} from.` };
  return ctx.partnerLibrary.has(ctx.itemId)
    ? { ok: true }
    : { ok: false, reason: `This ${ctx.noun} is not in the partner's library. Add it to the partner library first: an event takes items from its partner's library only.` };
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/**
 * The ids a partner holds from the global library: the list it saved, or, until it has saved one, what it already had before the libraries
 * (its defaults for new events and what its events already use). Nothing is deleted or forced: the first save turns this list into its own.
 * `usedByEvents` must hold global items only (an event's own upload is not a partner item).
 */
export function assignedFromGlobal(input: { saved: readonly string[] | undefined; defaults: readonly string[]; usedByEvents: readonly string[] }): { ids: string[]; saved: boolean } {
  if (input.saved) return { ids: unique(input.saved), saved: true };
  return { ids: unique([...input.defaults, ...input.usedByEvents]), saved: false };
}

/** The list after an edit: the ids added, then the ids removed (an id in both stays removed). */
export function applyLibraryEdit(ids: readonly string[], add: readonly string[], remove: readonly string[]): string[] {
  const drop = new Set(remove);
  return unique([...ids, ...add]).filter((id) => !drop.has(id));
}
