/**
 * Workout selfie: same FunFitFan check-in → Save to reel flow as `/log` on FFF hosts, then complete session.
 */

import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { redirect, notFound } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import GymSelfieClient from '@/components/gym/GymSelfieClient';

export const dynamic = 'force-dynamic';

export default async function WorkoutSelfiePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  const { sessionId } = await params;
  const db = await connectToDatabase();
  const row = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
  if (!row || row.userId !== session.user.id) {
    notFound();
  }

  const lessonId = typeof row.lessonId === 'string' ? row.lessonId.trim() : '';
  let fallbackActivity = '';
  if (lessonId) {
    const lesson = await db.collection(COLLECTIONS.GYM_LESSONS).findOne({ lessonId });
    const rec = lesson as unknown as { sport?: string } | null;
    const s = rec && typeof rec.sport === 'string' ? rec.sport : '';
    fallbackActivity = s.trim();
  }

  return <GymSelfieClient sessionId={sessionId} fallbackActivity={fallbackActivity} />;
}
