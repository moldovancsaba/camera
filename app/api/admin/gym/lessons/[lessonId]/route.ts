/**
 * Admin: update or delete gym training.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp, type GymLessonStep } from '@/lib/db/schemas';
import {
  withErrorHandler,
  requireAdmin,
  apiSuccess,
  apiBadRequest,
  apiNotFound,
} from '@/lib/api';
import { readFunFitFanSportActivities } from '@/lib/funfitfan/bootstrap';
import { resolveLessonSportFromAllowlist } from '@/lib/gym/lesson-sport';

function normalizeSteps(raw: unknown): GymLessonStep[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw apiBadRequest('steps must be a non-empty array when provided');
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

export const PATCH = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ lessonId: string }> }) => {
    await requireAdmin();
    const { lessonId } = await context.params;
    const body = await request.json();
    const { title, description, steps, isPublished, sport } = body;

    const $set: Record<string, unknown> = { updatedAt: generateTimestamp() };
    if (typeof title === 'string' && title.trim()) $set.title = title.trim();
    if (typeof description === 'string') $set.description = description.trim();
    if (typeof isPublished === 'boolean') $set.isPublished = isPublished;
    if (steps !== undefined) {
      $set.steps = normalizeSteps(steps);
    }
    const db = await connectToDatabase();
    if (sport !== undefined) {
      if (typeof sport !== 'string' || !sport.trim()) {
        throw apiBadRequest('sport must be a non-empty string when provided');
      }
      const allowedSports = await readFunFitFanSportActivities(db);
      const canonicalSport = resolveLessonSportFromAllowlist(sport, allowedSports);
      if (!canonicalSport) {
        throw apiBadRequest(
          'sport must be one of the activities configured under Admin → Sport → FunFitFan settings'
        );
      }
      $set.sport = canonicalSport;
    }

    if (Object.keys($set).length <= 1) {
      throw apiBadRequest('No valid fields to update');
    }

    const upd = await db.collection(COLLECTIONS.GYM_LESSONS).updateOne({ lessonId }, { $set });
    if (upd.matchedCount === 0) {
      throw apiNotFound('Training');
    }
    const res = await db.collection(COLLECTIONS.GYM_LESSONS).findOne({ lessonId });
    if (!res) {
      throw apiNotFound('Training');
    }

    return apiSuccess({
      lesson: {
        ...res,
        _id: res._id?.toString(),
      },
    });
  }
);

export const DELETE = withErrorHandler(
  async (_request: NextRequest, context: { params: Promise<{ lessonId: string }> }) => {
    await requireAdmin();
    const { lessonId } = await context.params;
    const db = await connectToDatabase();
    const del = await db.collection(COLLECTIONS.GYM_LESSONS).deleteOne({ lessonId });
    if (del.deletedCount === 0) {
      throw apiNotFound('Training');
    }
    return apiSuccess({ ok: true });
  }
);
