/**
 * Gym home: published lessons and recent workout sessions.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import Link from 'next/link';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import DeleteGymSessionButton from '@/components/gym/DeleteGymSessionButton';

export const dynamic = 'force-dynamic';

export default async function GymHomePage() {
  const session = await getSession();
  let lessons: unknown[] = [];
  let recentSessions: unknown[] = [];
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    lessons = await db
      .collection(COLLECTIONS.GYM_LESSONS)
      .find({ isPublished: true })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();

    if (session) {
      recentSessions = await db
        .collection(COLLECTIONS.GYM_WORKOUT_SESSIONS)
        .find({ userId: session.user.id })
        .sort({ startedAt: -1 })
        .limit(10)
        .toArray();
    }
  } catch (e) {
    dbError = e;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Your gym</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Lessons are managed in admin. Log a workout and optionally add a selfie (same camera + hosting as
        Camera).
      </p>

      {dbError != null ? <div className="mt-6"><DatabaseConnectionAlert error={dbError} /></div> : null}

      {!dbError && (
        <>
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Lessons</h2>
            {lessons.length === 0 ? (
              <p className="mt-3 text-slate-500 dark:text-slate-400">No published lessons yet.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {(lessons as { lessonId: string; title: string; description?: string }[]).map((l) => (
                  <li key={l.lessonId}>
                    <Link
                      href={`/gym/lesson/${l.lessonId}`}
                      className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
                    >
                      <span className="font-medium text-slate-900 dark:text-white">{l.title}</span>
                      {l.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                          {l.description}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Recent workouts</h2>
            {recentSessions.length === 0 ? (
              <p className="mt-3 text-slate-500 dark:text-slate-400">Start a lesson to log a session.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {(
                  recentSessions as {
                    sessionId: string;
                    lessonTitle: string;
                    status: string;
                    startedAt: string;
                    selfieImageUrl?: string;
                  }[]
                ).map((s) => (
                  <li
                    key={s.sessionId}
                    className="flex items-stretch gap-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                  >
                    <Link
                      href={`/gym/session/${s.sessionId}`}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 p-3 transition hover:bg-slate-50 dark:hover:bg-gray-800/80"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white">{s.lessonTitle}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {s.status} · {new Date(s.startedAt).toLocaleString()}
                        </p>
                      </div>
                      {s.selfieImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.selfieImageUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                      ) : null}
                    </Link>
                    <div className="flex items-center border-l border-slate-200 dark:border-gray-700">
                      <DeleteGymSessionButton sessionId={s.sessionId} lessonTitle={s.lessonTitle} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
