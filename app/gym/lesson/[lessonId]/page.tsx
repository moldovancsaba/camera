/**
 * Lesson detail and start workout (creates gym_workout_session).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { notFound } from 'next/navigation';
import StartWorkoutButton from '@/components/gym/StartWorkoutButton';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';

export const dynamic = 'force-dynamic';

export default async function GymLessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  let lesson: Record<string, unknown> | null = null;
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    lesson = await db.collection(COLLECTIONS.GYM_LESSONS).findOne({
      lessonId,
      isPublished: true,
    });
  } catch (e) {
    dbError = e;
  }

  if (dbError) {
    return (
      <div>
        <DatabaseConnectionAlert error={dbError} />
      </div>
    );
  }

  if (!lesson) {
    notFound();
  }

  const steps = (lesson.steps as { order: number; title: string; detail?: string }[]) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{String(lesson.title)}</h1>
      {lesson.description ? (
        <p className="mt-3 text-slate-600 dark:text-slate-400">{String(lesson.description)}</p>
      ) : null}

      <ol className="mt-8 list-decimal space-y-3 pl-5 text-slate-800 dark:text-slate-200">
        {steps
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((step) => (
            <li key={step.order}>
              <span className="font-medium">{step.title}</span>
              {step.detail ? <p className="text-sm text-slate-600 dark:text-slate-400">{step.detail}</p> : null}
            </li>
          ))}
      </ol>

      <div className="mt-10">
        <StartWorkoutButton lessonId={lessonId} />
      </div>
    </div>
  );
}
