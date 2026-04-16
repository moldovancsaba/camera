/**
 * Admin: edit gym lesson (PATCH + delete via /api/admin/gym/lessons/[lessonId]).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import AdminEditLessonForm from '@/components/gym/AdminEditLessonForm';
import { readFunFitFanSportActivities } from '@/lib/funfitfan/bootstrap';

export const dynamic = 'force-dynamic';

export default async function AdminEditGymLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  let lesson: Record<string, unknown> | null = null;
  let dbError: unknown = null;

  let sportOptions: string[] = [];

  try {
    const db = await connectToDatabase();
    sportOptions = await readFunFitFanSportActivities(db);
    lesson = (await db.collection(COLLECTIONS.GYM_LESSONS).findOne({ lessonId })) as Record<
      string,
      unknown
    > | null;
  } catch (e) {
    dbError = e;
  }

  if (dbError != null) {
    return (
      <div className="p-8">
        <Link href="/admin/gym/lessons" className="text-sm text-gray-600 hover:underline dark:text-gray-400">
          ← Sport lessons
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">Edit lesson</h1>
        <div className="mt-6">
          <DatabaseConnectionAlert error={dbError} />
        </div>
      </div>
    );
  }

  if (!lesson || typeof lesson.title !== 'string' || typeof lesson.lessonId !== 'string') {
    notFound();
  }

  const steps = lesson.steps;
  const initialStepsJson =
    Array.isArray(steps) && steps.length > 0
      ? JSON.stringify(steps, null, 2)
      : '[{"title":"Warm-up","detail":"5 minutes light cardio"},{"title":"Main block"},{"title":"Cool-down"}]';

  return (
    <div className="p-8">
      <Link href="/admin/gym/lessons" className="text-sm text-gray-600 hover:underline dark:text-gray-400">
        ← Sport lessons
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">Edit lesson</h1>
      <p className="mt-2 max-w-xl text-gray-600 dark:text-gray-400">
        Lesson ID <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">{lesson.lessonId}</code>
      </p>
      <div className="mt-8 max-w-xl">
        <AdminEditLessonForm
          lessonId={lesson.lessonId}
          sportOptions={sportOptions}
          initialSport={typeof lesson.sport === 'string' ? lesson.sport : ''}
          initialTitle={lesson.title}
          initialDescription={typeof lesson.description === 'string' ? lesson.description : ''}
          initialStepsJson={initialStepsJson}
          initialIsPublished={Boolean(lesson.isPublished)}
        />
      </div>
    </div>
  );
}
