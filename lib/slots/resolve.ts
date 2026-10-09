/**
 * The one mechanism behind every element a level can choose (camera#418, docs/BUILDING_BRICKS.md sections 2 and 4; owner, 2026-10-09): a place of use
 * uses the default by default, and the editor chooses there. What a level stores for a slot is only what the editor set, never a copy of the parent:
 *
 * - nothing stored: **use the default**, the items of the level above;
 * - own items and `useDefault` left on: **add more**, the own items next to the default;
 * - own items and `useDefault: false`: **replace** the default;
 * - no own items and `useDefault: false`: **none**, nothing is used here.
 *
 * Several items: the user sees a random one (`pickRandom`); one item is used as it is. Pure and free of server code, so the pages use it too;
 * unit-tested (resolve.test.ts).
 */

export interface SlotValue {
  /** The items this level chose itself (ids of library items), in the order the editor gave. */
  items?: readonly string[];
  /** On unless it is `false`: the level above's items are used next to the own ones. */
  useDefault?: boolean;
}

export type SlotMode = 'default' | 'add' | 'replace' | 'none';

/** One level of the chain, from the root down: a name (`global`, `partner`, `event`, a place) and what the editor stored there, if anything. */
export interface SlotLevel {
  level: string;
  value?: SlotValue | null;
}

export interface ResolvedItem {
  id: string;
  /** The level that holds the item: the closest one when two levels hold it. */
  level: string;
}

export interface ResolvedSlot {
  /** What is used at the last level of the chain: its own items first, then the ones it takes from above. */
  items: ResolvedItem[];
  /** The choice of the last level. */
  mode: SlotMode;
  /** For the screen: whether the items are the level's own, come from above, or both. */
  source: 'own' | 'inherited' | 'both' | 'none';
}

const uniqueIds = (items: readonly string[] | undefined): string[] => [...new Set((items ?? []).filter((id) => typeof id === 'string' && id.length > 0))];

export function slotMode(value: SlotValue | null | undefined): SlotMode {
  const own = uniqueIds(value?.items).length > 0;
  const useDefault = value?.useDefault !== false;
  if (own) return useDefault ? 'add' : 'replace';
  return useDefault ? 'default' : 'none';
}

/** The items used at the last level of `chain` (ordered from the root to that level). A level with nothing stored uses the default. */
export function resolveSlot(chain: readonly SlotLevel[]): ResolvedSlot {
  let used: ResolvedItem[] = [];
  let own: string[] = [];
  for (const { level, value } of chain) {
    own = uniqueIds(value?.items);
    const above = value?.useDefault === false ? [] : used.filter((item) => !own.includes(item.id));
    used = [...own.map((id) => ({ id, level })), ...above];
  }
  const last = chain.at(-1)?.value;
  const fromAbove = used.length - own.length;
  const source = used.length === 0 ? 'none' : own.length === 0 ? 'inherited' : fromAbove > 0 ? 'both' : 'own';
  return { items: used, mode: slotMode(last), source };
}

/** One item at random, or null when there is none. One item is returned as it is. `random` is injectable for tests. */
export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export interface LookedUp<T> extends ResolvedItem {
  /** What the library has for the id, or null when the item is gone. */
  item: T | null;
  /** True when the library no longer has the item: the place where the fail-safe gate plugs in (camera#421), instead of dropping it silently. */
  missing: boolean;
}

/** The resolved items with what the library has for each; an id with no item stays in the list, marked missing, so nothing disappears silently. */
export function lookUp<T>(resolved: ResolvedSlot, find: (id: string) => T | null | undefined): LookedUp<T>[] {
  return resolved.items.map((entry) => {
    const item = find(entry.id) ?? null;
    return { ...entry, item, missing: item === null };
  });
}

