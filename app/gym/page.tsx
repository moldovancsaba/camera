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
        <section className="mt-10">
          <h2 className="fff-app-page-title">Lessons</h2>
          {lessons.length === 0 ? (
            <p className="mt-3 fff-app-muted">No published lessons yet.</p>
          ) : (
            <ul className="fff-history-list mt-4">
              {(lessons as { lessonId: string; title: string; description?: string }[]).map((l) => (
                <li key={l.lessonId} className="fff-history-row">
                  <Link href={`/gym/lesson/${l.lessonId}`} className="fff-history-row-link">
                    <div className="fff-history-thumb">
                      <div className="fff-history-thumb-placeholder" aria-hidden>
                        🏋️
                      </div>
                    </div>
                    <div className="fff-history-body">
                      <div className="fff-history-title-row">
                        <span className="fff-history-title">{l.title}</span>
                      </div>
                      {l.description ? (
                        <p className="fff-history-subtitle line-clamp-2">{l.description}</p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
