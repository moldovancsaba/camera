/**
 * The fail-safe snapshot (camera#421, docs/BUILDING_BRICKS.md; owner requirement 2026-10-09: if a parent element is deleted or lost, the children still have it).
 *
 * With "follow, no copies" an event stores only what its editor chose and looks at its parent, so a parent that loses an item would take it from every child.
 * To keep that from happening an event keeps a **last-known-good snapshot** of what it uses in each place: a small read-only record of each item (name, picture
 * addresses, size). It **never overrides the parent**: it is read only for an item the library no longer has. It is refreshed when a slot is saved and when
 * the answer of an event is built and the live items differ from it; an item whose library entry is gone is kept as it was, never dropped.
 * Pure; unit-tested (snapshot.test.ts).
 */

export interface SnapshotItem {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  /** `messmass` for a logo imported from messmass. */
  source?: string;
  /** `global`, `partner` or `event`: whose item it was. */
  scope: string;
  /** When the item was last seen in the library. */
  takenAt: string;
}

/** Slot id (a place of use) to the items used there, in the order they are used. */
export type Snapshots = Record<string, SnapshotItem[]>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const maybeText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const maybeNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function snapshotItem(id: string, doc: Record<string, unknown>, takenAt: string): SnapshotItem {
  const source = text(doc.source);
  return {
    id,
    name: text(doc.name),
    imageUrl: maybeText(doc.imageUrl),
    thumbnailUrl: maybeText(doc.thumbnailUrl),
    mimeType: maybeText(doc.mimeType),
    width: maybeNumber(doc.width),
    height: maybeNumber(doc.height),
    ...(source ? { source } : {}),
    scope: text(doc.scope) === 'partner' || text(doc.scope) === 'event' ? text(doc.scope) : 'global',
    takenAt,
  };
}

const sameItem = (a: SnapshotItem, b: SnapshotItem) =>
  a.id === b.id && a.name === b.name && a.imageUrl === b.imageUrl && a.thumbnailUrl === b.thumbnailUrl && a.mimeType === b.mimeType && a.width === b.width && a.height === b.height && a.source === b.source && a.scope === b.scope;

/**
 * The snapshots after looking at what each place uses now. `resolved` gives, per place, the ids in use; `docs` are the library items that exist. An id that still
 * resolves but has no item any more keeps its earlier snapshot (the fail-safe); an id that is no longer used is dropped. `changed` is false when nothing
 * but time would differ, so a page view does not write.
 */
export function nextSnapshots(
  previous: Snapshots | null | undefined,
  resolved: Record<string, readonly string[]>,
  docs: ReadonlyMap<string, Record<string, unknown>>,
  now: string
): { snapshots: Snapshots; changed: boolean } {
  const snapshots: Snapshots = {};
  let changed = false;
  for (const [slotId, ids] of Object.entries(resolved)) {
    const before = previous?.[slotId] ?? [];
    const items: SnapshotItem[] = [];
    for (const id of ids) {
      const earlier = before.find((item) => item.id === id);
      const doc = docs.get(id);
      if (doc) {
        const fresh = snapshotItem(id, doc, now);
        items.push(earlier && sameItem(earlier, fresh) ? earlier : fresh);
      } else if (earlier) {
        items.push(earlier);
      }
    }
    snapshots[slotId] = items;
    if (items.length !== before.length || items.some((item, i) => item !== before[i] && !(before[i] && sameItem(item, before[i])))) changed = true;
  }
  for (const slotId of Object.keys(previous ?? {})) if (!(slotId in resolved)) changed = true;
  return { snapshots, changed };
}

/** The snapshot item for an id the library no longer has, from any place of the event (the same item is kept in each place it is used). */
export function lostItem(snapshots: Snapshots | null | undefined, slotId: string, id: string): SnapshotItem | null {
  return snapshots?.[slotId]?.find((item) => item.id === id) ?? Object.values(snapshots ?? {}).flat().find((item) => item.id === id) ?? null;
}
