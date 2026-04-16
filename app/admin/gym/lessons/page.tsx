/**
 * Admin: list sport lessons (member /workout).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import AdminDeleteLessonButton from '@/components/gym/AdminDeleteLessonButton';
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Sport lessons</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Published lessons appear on /workout for members.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/gym" className="text-sm text-gray-600 hover:underline dark:text-gray-400">
            ← Sport hub
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
          {(
            lessons as {
              lessonId: string;
              title: string;
              sport?: string;
              isPublished: boolean;
              updatedAt: string;
            }[]
          ).map((l) => (
              <li
                key={l.lessonId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">{l.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {typeof l.sport === 'string' && l.sport.trim() ? (
                      <>
                        <span className="font-medium text-gray-700 dark:text-gray-300">{l.sport}</span>
                        {' · '}
                      </>
                    ) : null}
                    {l.isPublished ? 'Published' : 'Draft'} · {l.lessonId}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/gym/lessons/${encodeURIComponent(l.lessonId)}/edit`}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Edit
                  </Link>
                  <AdminDeleteLessonButton lessonId={l.lessonId} title={l.title} />
                  <span className="text-xs text-gray-400">{new Date(l.updatedAt).toLocaleString()}</span>
                </div>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
