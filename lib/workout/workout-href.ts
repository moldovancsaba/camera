import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

/** Member workout hub (lessons list). No query — use activity cookie from I DO IT when needed. */
export function workoutListUrl(): string {
  return '/workout';
}

/**
 * When the server must preserve sport (redirect after session, etc.) — query is reliable
 * because `cookies().set` is not available in all Server Component contexts.
 */
export function workoutListUrlWithSportQuery(sport: string | null | undefined): string {
  const s = typeof sport === 'string' ? sport.trim() : '';
  if (!s) return '/workout';
  return `/workout?sport=${encodeURIComponent(s)}`;
}

export async function workoutListUrlWithSportQueryForLessonId(
  db: Db,
  lessonId: unknown
): Promise<string> {
  if (typeof lessonId !== 'string' || !lessonId.trim()) return '/workout';
  const lesson = await db.collection(COLLECTIONS.GYM_LESSONS).findOne({ lessonId: lessonId.trim() });
  const rec = lesson as unknown as { sport?: string } | null;
  return workoutListUrlWithSportQuery(rec?.sport);
}
