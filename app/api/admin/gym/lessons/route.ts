/**
 * Admin: gym lessons — list and create (same SSO admin gate as rest of Camera admin API).
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import {
  COLLECTIONS,
  generateId,
  generateTimestamp,
  type GymLessonStep,
} from '@/lib/db/schemas';
import {
  withErrorHandler,
  requireAdmin,
  apiSuccess,
  apiCreated,
  apiBadRequest,
} from '@/lib/api';

function normalizeSteps(raw: unknown): GymLessonStep[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw apiBadRequest('steps must be a non-empty array of { order?, title, detail? }');
  }
  return raw.map((item: unknown, i: number) => {
    const s = item as Record<string, unknown>;
    const title = typeof s.title === 'string' ? s.title.trim() : '';
    if (!title) {
      throw apiBadRequest(`steps[${i}].title is required`);
    }
    const order = typeof s.order === 'number' ? s.order : i;
    const detail =
      typeof s.detail === 'string' && s.detail.trim() ? s.detail.trim() : undefined;
    return { order, title, ...(detail ? { detail } : {}) };
  });
}

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const db = await connectToDatabase();
  const lessons = await db
    .collection(COLLECTIONS.GYM_LESSONS)
    .find({})
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray();

  return apiSuccess({
    lessons: lessons.map((l) => ({
      ...l,
      _id: l._id?.toString(),
    })),
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin();
  const body = await request.json();
  const { title, description, steps, isPublished } = body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw apiBadRequest('title is required');
  }

  const normalizedSteps = normalizeSteps(steps);
  const now = generateTimestamp();
  const lessonId = generateId();

  const doc = {
    lessonId,
    title: title.trim(),
    description: typeof description === 'string' ? description.trim() : undefined,
    steps: normalizedSteps,
    isPublished: Boolean(isPublished),
    createdBy: session.user.id,
    createdAt: now,
    updatedAt: now,
  };

  const db = await connectToDatabase();
  await db.collection(COLLECTIONS.GYM_LESSONS).insertOne(doc);

  return apiCreated({ lesson: doc });
});
