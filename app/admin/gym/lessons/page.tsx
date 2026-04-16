/**
 * Admin: list gym lessons.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';

export default async function AdminGymLessonsPage() {
  let lessons: unknown[] = [];
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    lessons = await db
      .collection(COLLECTIONS.GYM_LESSONS)
      .find({})
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray();
  } catch (e) {
    dbError = e;
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gym lessons</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Published lessons appear on /gym for members.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/gym" className="text-sm text-gray-600 hover:underline dark:text-gray-400">
            ← Gym hub
          </Link>
          <Link
            href="/admin/gym/lessons/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            New lesson
          </Link>
        </div>
      </div>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && lessons.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">No lessons yet. Create one to get started.</p>
      ) : null}

      {!dbError && lessons.length > 0 ? (
        <ul className="space-y-2">
          {(lessons as { lessonId: string; title: string; isPublished: boolean; updatedAt: string }[]).map(
            (l) => (
              <li
                key={l.lessonId}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{l.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {l.isPublished ? 'Published' : 'Draft'} · {l.lessonId}
                  </p>
                </div>
                <span className="text-xs text-gray-400">{new Date(l.updatedAt).toLocaleString()}</span>
              </li>
            )
          )}
        </ul>
      ) : null}
    </div>
  );
}
