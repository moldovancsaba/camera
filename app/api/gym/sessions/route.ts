/**
 * Gym workout sessions: list current user's sessions, start a new session from a lesson.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import {
  COLLECTIONS,
  generateId,
  generateTimestamp,
  type GymWorkoutSessionStatus,
} from '@/lib/db/schemas';
import { normalizeLessonStepsFromUnknown } from '@/lib/gym/normalize-lesson-steps';
import {
  withErrorHandler,
  requireAuth,
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiNotFound,
} from '@/lib/api';
import { assertGymAppAccess } from '@/lib/gym/access';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  assertGymAppAccess(session);

  const db = await connectToDatabase();
  const sessions = await db
    .collection(COLLECTIONS.GYM_WORKOUT_SESSIONS)
    .find({ userId: session.user.id })
    .sort({ startedAt: -1 })
    .limit(50)
    .toArray();

  return apiSuccess({
    sessions: sessions.map((s) => ({
      ...s,
      _id: s._id?.toString(),
    })),
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth();
  assertGymAppAccess(session);

  const body = await request.json();
  const { lessonId } = body;
  if (!lessonId || typeof lessonId !== 'string') {
    throw apiBadRequest('lessonId is required');
  }

  const db = await connectToDatabase();
  const lesson = await db.collection(COLLECTIONS.GYM_LESSONS).findOne({
    lessonId,
    isPublished: true,
  });
  if (!lesson) {
    throw apiNotFound('Lesson');
  }

  const now = generateTimestamp();
  const sessionId = generateId();
  const lessonSteps = normalizeLessonStepsFromUnknown(lesson.steps);
  const doc = {
    sessionId,
    userId: session.user.id,
    userEmail: session.user.email,
    lessonId: lesson.lessonId as string,
    lessonTitle: lesson.title as string,
    lessonSteps,
    status: 'in_progress' as GymWorkoutSessionStatus,
    startedAt: now,
    stepLog: [] as { stepOrder: number; completedAt: string; notes?: string }[],
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).insertOne(doc);

  return apiCreated({ session: doc });
});
