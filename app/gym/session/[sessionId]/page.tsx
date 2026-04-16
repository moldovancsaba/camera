/**
 * Active or past workout: step checklist + link to gym selfie capture.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { notFound, redirect } from 'next/navigation';
import SessionActions from '@/components/gym/SessionActions';
import Link from 'next/link';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';

export const dynamic = 'force-dynamic';

export default async function GymSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect('/api/auth/login');
  }

  const { sessionId } = await params;
  let row: Record<string, unknown> | null = null;
  let lessonSteps: { order: number; title: string; detail?: string }[] = [];
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    row = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
    if (row && row.userId === session.user.id) {
      const lesson = await db.collection(COLLECTIONS.GYM_LESSONS).findOne({ lessonId: row.lessonId });
      lessonSteps = (lesson?.steps as typeof lessonSteps) ?? [];
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

  const selfieUrl = row.selfieImageUrl as string | undefined;

  return (
    <div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        <Link href="/gym" className="text-blue-600 hover:underline dark:text-blue-400">
          ← Back to gym
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">{String(row.lessonTitle)}</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Started {new Date(String(row.startedAt)).toLocaleString()} · {String(row.status)}
      </p>

      {selfieUrl ? (
        <div className="mt-6">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Selfie</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selfieUrl} alt="Workout selfie" className="mt-2 max-h-64 rounded-lg border border-slate-200 dark:border-gray-700" />
        </div>
      ) : null}

      <div className="mt-8">
        <SessionActions
          sessionId={sessionId}
          steps={lessonSteps}
          initialStatus={String(row.status)}
          initialStepLog={(row.stepLog as { stepOrder: number; completedAt: string; notes?: string }[]) ?? []}
        />
      </div>
    </div>
  );
}
