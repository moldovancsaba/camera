/**
 * One lesson step per screen: Skip or Mark done, then advance (gym workout flow).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { notFound, redirect } from 'next/navigation';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { normalizeLessonStepsFromUnknown } from '@/lib/gym/normalize-lesson-steps';
import { sortedLessonSteps } from '@/lib/gym/session-workout-path';
import GymSessionStepPanel from '@/components/gym/GymSessionStepPanel';
import { gymLessonsListHrefForLessonId } from '@/lib/gym/gym-lessons-href';

export const dynamic = 'force-dynamic';

export default async function GymSessionStepPage({
  params,
}: {
  params: Promise<{ sessionId: string; ordinal: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  const { sessionId, ordinal: ordStr } = await params;
  const ordinal = parseInt(ordStr, 10);
  if (!Number.isFinite(ordinal) || ordinal < 0) {
    notFound();
  }

  let row: Record<string, unknown> | null = null;
  let lessonSteps: { order: number; title: string; detail?: string }[] = [];
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    row = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
    if (row && row.userId === session.user.id) {
      const fromSession = normalizeLessonStepsFromUnknown(row.lessonSteps);
      if (fromSession.length > 0) {
        lessonSteps = fromSession;
      } else {
        const lesson = await db.collection(COLLECTIONS.GYM_LESSONS).findOne({ lessonId: row.lessonId });
        lessonSteps = normalizeLessonStepsFromUnknown(lesson?.steps);
      }
    }
  } catch (e) {
    dbError = e;
  }

  if (dbError) {
    return <DatabaseConnectionAlert error={dbError} />;
  }

  if (!row || row.userId !== session.user.id) {
    notFound();
  }

  const sorted = sortedLessonSteps(lessonSteps);
  if (ordinal >= sorted.length) {
    notFound();
  }

  const status = String(row.status);
  if (status !== 'in_progress') {
    try {
      const db = await connectToDatabase();
      redirect(await gymLessonsListHrefForLessonId(db, row.lessonId));
    } catch {
      redirect('/gym');
    }
  }

  const step = sorted[ordinal]!;
  const selfieUrl = row.selfieImageUrl as string | undefined;
  const stepLog = (row.stepLog as { stepOrder: number; completedAt: string; notes?: string }[]) ?? [];

  return (
    <GymSessionStepPanel
      sessionId={sessionId}
      sortedSteps={sorted}
      ordinal={ordinal}
      step={step}
      stepLog={stepLog}
      hasSelfie={Boolean(selfieUrl?.trim())}
      status={status}
    />
  );
}
