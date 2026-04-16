/**
 * Gym home: published lessons. Past workouts are listed under FunFitFan History.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import Link from 'next/link';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';

export const dynamic = 'force-dynamic';

export default async function GymHomePage() {
  let lessons: unknown[] = [];
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    lessons = await db
      .collection(COLLECTIONS.GYM_LESSONS)
      .find({ isPublished: true })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();
  } catch (e) {
    dbError = e;
  }

  return (
    <div>
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
        </>
      )}
    </div>
  );
}
