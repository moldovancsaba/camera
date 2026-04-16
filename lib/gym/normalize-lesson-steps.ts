import type { GymLessonStep } from '@/lib/db/schemas';

/**
 * Coerce Mongo / JSON lesson steps into a stable shape (order, title, optional detail).
 * Handles numeric order stored as other BSON/JSON types.
 */
export function normalizeLessonStepsFromUnknown(raw: unknown): GymLessonStep[] {
  if (!Array.isArray(raw)) return [];
  const out: GymLessonStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) continue;
    const o = item.order;
    const order =
      typeof o === 'number' && Number.isFinite(o)
        ? o
        : typeof o === 'string' && Number.isFinite(Number(o))
          ? Number(o)
          : i;
    const detailRaw = item.detail;
    const detail =
      typeof detailRaw === 'string' && detailRaw.trim() ? detailRaw.trim() : undefined;
    out.push(detail ? { order, title, detail } : { order, title });
  }
  return out;
}
