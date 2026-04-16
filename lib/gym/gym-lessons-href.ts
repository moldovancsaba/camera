import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

/** Member lessons list; include sport to show only that sport's lessons. */
export function gymLessonsListHref(sport: string | null | undefined): string {
  const s = typeof sport === 'string' ? sport.trim() : '';
  if (!s) return '/gym';
  return `/gym?sport=${encodeURIComponent(s)}`;
}

export async function gymLessonsListHrefForLessonId(db: Db, lessonId: unknown): Promise<string> {
  if (typeof lessonId !== 'string' || !lessonId.trim()) return '/gym';
  const lesson = await db.collection(COLLECTIONS.GYM_LESSONS).findOne({ lessonId: lessonId.trim() });
  const rec = lesson as unknown as { sport?: string } | null;
  return gymLessonsListHref(rec?.sport);
}
