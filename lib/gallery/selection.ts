/**
 * Selecting several photos of the event gallery at once (camera#488, owner report 207; research: docs/_research/GALLERY_MULTISELECT_RESEARCH.md): a click on the first and
 * a Shift+click on the last selects everything between them, and dragging a box over the pictures selects those it touches. The rules are here, pure, so they are unit-tested;
 * the component only reads the pointer and the positions of the cards.
 */

/** The ids from `anchor` to `target` in display order, both included; just the target when there is no anchor or it is no longer shown. */
export function rangeIds(order: readonly string[], anchor: string | null, target: string): string[] {
  const to = order.indexOf(target);
  const from = anchor === null ? -1 : order.indexOf(anchor);
  if (to < 0) return [];
  if (from < 0) return [target];
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** Shift+click: every photo from the anchor to the target is selected, or, when the anchor was just unchecked, unselected (the range takes the state of the anchor click, as in a mail list). */
export function extendSelection(selected: readonly string[], order: readonly string[], anchor: string | null, target: string, checked: boolean): string[] {
  const range = new Set(rangeIds(order, anchor, target));
  if (checked) return [...order.filter((id) => selected.includes(id) || range.has(id)), ...selected.filter((id) => !order.includes(id))];
  return selected.filter((id) => !range.has(id));
}

export function toggleId(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function boxBetween(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}

export function boxesTouch(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** The ids of the cards the dragged box touches. */
export function idsInBox(cards: ReadonlyArray<{ id: string; box: Box }>, box: Box): string[] {
  return cards.filter((card) => boxesTouch(card.box, box)).map((card) => card.id);
}

/** What is selected while a box is being dragged: the cards in it, plus what was selected before when Shift or Ctrl/Cmd is held. */
export function dragSelection(before: readonly string[], inBox: readonly string[], additive: boolean): string[] {
  return additive ? [...before, ...inBox.filter((id) => !before.includes(id))] : [...inBox];
}

/** The pointer has to move this far before a press on the grid becomes a dragged box (a plain click is not a drag). */
export const DRAG_THRESHOLD_PX = 5;
