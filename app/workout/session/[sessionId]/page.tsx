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
import {
  workoutListUrlWithSportQuery,
  workoutListUrlWithSportQueryForLessonId,
} from '@/lib/workout/workout-href';

export const dynamic = 'force-dynamic';

export default async function WorkoutSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  const { sessionId } = await params;
  let row: Record<string, unknown> | null = null;
  let lessonSteps: { order: number; title: string; detail?: string }[] = [];
  let lessonSport = '';
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    row = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
    if (row && row.userId === session.user.id) {
      const lessonId = row.lessonId;
      let lessonDoc: unknown = null;
      const fromSession = normalizeLessonStepsFromUnknown(row.lessonSteps);
      if (fromSession.length > 0) {
        lessonSteps = fromSession;
      } else {
        const lid = typeof lessonId === 'string' ? lessonId.trim() : '';
        const lesson = lid ? await db.collection(COLLECTIONS.GYM_LESSONS).findOne({ lessonId: lid }) : null;
        lessonDoc = lesson;
        lessonSteps = normalizeLessonStepsFromUnknown(
          (lessonDoc as { steps?: unknown } | null)?.steps
        );
      }
      if (typeof lessonId === 'string' && lessonId.trim()) {
        const le =
          lessonDoc ??
          (await db.collection(COLLECTIONS.GYM_LESSONS).findOne({ lessonId: lessonId.trim() }));
        const rec = le as unknown as { sport?: string } | null;
        if (rec && typeof rec.sport === 'string') lessonSport = rec.sport.trim();
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
    try {
      const db = await connectToDatabase();
      redirect(await workoutListUrlWithSportQueryForLessonId(db, row.lessonId));
    } catch {
      redirect(workoutListUrlWithSportQuery(lessonSport || null));
    }
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
      <p>
        <Link href={workoutListUrlWithSportQuery(lessonSport || null)} className="fff-app-link text-sm">
          ← Workouts
        </Link>
      </p>
      <h1 className="gym-step-title mt-4">{String(row.lessonTitle)}</h1>
      <p className="mt-2 text-sm fff-app-muted">
        Started {new Date(String(row.startedAt)).toLocaleString()} · {status}
      </p>

      {selfieUrl ? (
        <div className="mt-6">
          <p className="text-sm font-medium fff-app-muted">Selfie</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selfieUrl}
            alt="Workout selfie"
            className="mt-2 max-h-64 w-full max-w-md rounded-lg border border-[color:var(--fff-app-border)] object-cover"
          />
        </div>
      ) : null}

      {sorted.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-base font-semibold fff-app-muted">Progress</h2>
          <ul className="fff-history-list mt-3">
            {sorted.map((s, i) => {
              const entry = stepLog.find((e) => e.stepOrder === s.order);
              const label = entry ? (entry.notes === GYM_STEP_SKIP_NOTE ? 'Skipped' : 'Done') : '—';
              return (
                <li key={`${s.order}-${i}`} className="fff-history-row">
                  <Link href={`/workout/session/${sessionId}/step/${i}`} className="fff-history-row-link">
                    <div className="fff-history-thumb">
                      <div className="fff-history-thumb-placeholder" aria-hidden>
                        {entry ? (entry.notes === GYM_STEP_SKIP_NOTE ? '⏭' : '✓') : '○'}
                      </div>
                    </div>
                    <div className="fff-history-body">
                      <div className="fff-history-title-row">
                        <span className="fff-history-title">{s.title}</span>
                        <span className="fff-history-badge">{label}</span>
                      </div>
                    </div>
                  </Link>
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
