/**
 * Workout session overview: redirects into per-step flow when in progress; finish + selfie here when ready.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { normalizeLessonStepsFromUnknown } from '@/lib/gym/normalize-lesson-steps';
import {
  GYM_STEP_SKIP_NOTE,
  gymSessionLandingRedirect,
  sortedLessonSteps,
} from '@/lib/gym/session-workout-path';
import GymSessionWorkoutFooter from '@/components/gym/GymSessionWorkoutFooter';

export const dynamic = 'force-dynamic';

export default async function GymSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  const { sessionId } = await params;
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
  const stepLog = (row.stepLog as { stepOrder: number; completedAt: string; notes?: string }[]) ?? [];
  const selfieUrl = row.selfieImageUrl as string | undefined;
  const hasSelfie = Boolean(selfieUrl?.trim());
  const status = String(row.status);

  if (status === 'completed' || status === 'cancelled') {
    redirect('/gym');
  }

  const landing = gymSessionLandingRedirect({
    sessionId,
    sortedSteps: sorted,
    stepLog,
    hasSelfie,
    status,
  });
  if (landing) {
    redirect(landing);
  }

  return (
    <div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        <Link href="/gym" className="text-blue-600 hover:underline dark:text-blue-400">
          ← Back to gym
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">{String(row.lessonTitle)}</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Started {new Date(String(row.startedAt)).toLocaleString()} · {status}
      </p>

      {selfieUrl ? (
        <div className="mt-6">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Selfie</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selfieUrl}
            alt="Workout selfie"
            className="mt-2 max-h-64 rounded-lg border border-slate-200 dark:border-gray-700"
          />
        </div>
      ) : null}

      {sorted.length > 0 ? (
        <div className="mt-8">
          <h2 className="gym-session-section-title">Progress</h2>
          <ul className="gym-session-step-list">
            {sorted.map((s, i) => {
              const entry = stepLog.find((e) => e.stepOrder === s.order);
              const label = entry ? (entry.notes === GYM_STEP_SKIP_NOTE ? 'Skipped' : 'Done') : '—';
              return (
                <li key={`${s.order}-${i}`} className="gym-session-step-row">
                  <div className="gym-session-step-body">
                    <Link href={`/gym/session/${sessionId}/step/${i}`} className="gym-session-step-title-link">
                      <div className="gym-session-step-title">{s.title}</div>
                    </Link>
                  </div>
                  <div className="gym-session-step-actions">
                    <span className="gym-session-meta-text">{label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-8">
        <GymSessionWorkoutFooter
          sessionId={sessionId}
          hasSelfie={hasSelfie}
          initialStatus={status}
          initialStepLog={stepLog}
        />
      </div>
    </div>
  );
}
