/**
 * Training detail and start workout (creates gym_workout_session).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { notFound } from 'next/navigation';
import StartWorkoutButton from '@/components/gym/StartWorkoutButton';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';

export const dynamic = 'force-dynamic';

export default async function WorkoutTrainingPage({
  params,
}: {
  params: Promise<{ trainingId: string }>;
}) {
  const { trainingId } = await params;
  const lessonId = trainingId;
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
      <h1 className="gym-step-title mt-2">{String(lesson.title)}</h1>
      {lesson.description ? (
        <p className="mt-3 text-sm leading-relaxed fff-app-muted">{String(lesson.description)}</p>
      ) : null}

      <div className="mt-6">
        <StartWorkoutButton lessonId={lessonId} />
      </div>

      <ol className="fff-gym-training-steps">
        {steps
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((step) => (
            <li key={step.order}>
              <span className="fff-gym-training-step-name">{step.title}</span>
              {step.detail ? <p className="fff-gym-training-step-detail">{step.detail}</p> : null}
            </li>
          ))}
      </ol>

      <div className="mt-10">
        <StartWorkoutButton lessonId={lessonId} />
      </div>
    </div>
  );
}
