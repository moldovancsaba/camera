/**
 * Admin: update or delete gym training.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp, type GymLessonStep, type PartnerAccessRole } from '@/lib/db/schemas';
import {
  withErrorHandler,
  requireAuth,
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiForbidden,
} from '@/lib/api';
import { readFunFitFanSportActivities } from '@/lib/funfitfan/bootstrap';
import { resolveLessonSportFromAllowlist } from '@/lib/gym/lesson-sport';
import { FUNFITFAN_PARTNER_ID } from '@/lib/funfitfan/constants';
import { getPartnerScopedAccessForPartner, isGlobalAdminSession } from '@/lib/partners/authorization';

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

async function assertGymAccess(
  request: NextRequest | undefined,
  minRole: PartnerAccessRole
) {
  const session = await requireAuth(request);
  if (isGlobalAdminSession(session)) {
    return { db: null as null };
  }
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForPartner(db, session, FUNFITFAN_PARTNER_ID, 'gym', minRole);
  if (!access.allowed) {
    throw apiForbidden(
      minRole === 'viewer'
        ? 'Partner-level gym access is required to read training content'
        : 'Partner-level gym manager access is required to change training content'
    );
  }
  return { db };
}

export const PATCH = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ lessonId: string }> }) => {
    const { db: existingDb } = await assertGymAccess(request, 'manager');
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
    const db = existingDb ?? (await connectToDatabase());
    if (sport !== undefined) {
      if (typeof sport !== 'string' || !sport.trim()) {
        throw apiBadRequest('sport must be a non-empty string when provided');
      }
      const allowedSports = await readFunFitFanSportActivities(db);
      const canonicalSport = resolveLessonSportFromAllowlist(sport, allowedSports);
      if (!canonicalSport) {
        throw apiBadRequest('sport must be one of the activities configured under Admin → Gym → Gym Settings');
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
    const { db: existingDb } = await assertGymAccess(undefined, 'manager');
    const { lessonId } = await context.params;
    const db = existingDb ?? (await connectToDatabase());
    const del = await db.collection(COLLECTIONS.GYM_LESSONS).deleteOne({ lessonId });
    if (del.deletedCount === 0) {
      throw apiNotFound('Training');
    }
    return apiSuccess({ ok: true });
  }
);
