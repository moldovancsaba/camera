/**
 * Admin: gym training — list and create (same SSO admin gate as rest of Camera admin API).
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import {
  PartnerAccessRole,
  COLLECTIONS,
  generateId,
  generateTimestamp,
  type GymLessonStep,
} from '@/lib/db/schemas';
import {
  withErrorHandler,
  requireAuth,
  apiSuccess,
  apiCreated,
  apiBadRequest,
  apiForbidden,
} from '@/lib/api';
import { readFunFitFanSportActivities } from '@/lib/funfitfan/bootstrap';
import { resolveLessonSportFromAllowlist } from '@/lib/gym/lesson-sport';
import { FUNFITFAN_PARTNER_ID } from '@/lib/funfitfan/constants';
import { getPartnerScopedAccessForPartner, isGlobalAdminSession } from '@/lib/partners/authorization';

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

async function assertGymAccess(
  request: NextRequest | undefined,
  minRole: PartnerAccessRole
) {
  const session = await requireAuth(request);
  if (isGlobalAdminSession(session)) {
    return { session, db: null as null };
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
  return { session, db };
}

export const GET = withErrorHandler(async () => {
  const { db: existingDb } = await assertGymAccess(undefined, 'viewer');
  const db = existingDb ?? (await connectToDatabase());
  const rows = await db
    .collection(COLLECTIONS.GYM_LESSONS)
    .find({})
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray();

  const training = rows.map((l) => ({
    ...l,
    _id: l._id?.toString(),
  }));

  return apiSuccess({
    training,
    /** @deprecated use `training` */
    lessons: training,
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { session, db: existingDb } = await assertGymAccess(request, 'manager');
  const body = await request.json();
  const { title, description, steps, isPublished, sport } = body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw apiBadRequest('title is required');
  }
  if (typeof sport !== 'string' || !sport.trim()) {
    throw apiBadRequest('sport is required (must match FunFitFan sport activities)');
  }

  const db = existingDb ?? (await connectToDatabase());
  const allowedSports = await readFunFitFanSportActivities(db);
  const canonicalSport = resolveLessonSportFromAllowlist(sport, allowedSports);
  if (!canonicalSport) {
    throw apiBadRequest(
      'sport must be one of the activities configured under Admin → Sport → FunFitFan settings (sport activities list)'
    );
  }

  const normalizedSteps = normalizeSteps(steps);
  const now = generateTimestamp();
  const lessonId = generateId();

  const doc = {
    lessonId,
    sport: canonicalSport,
    title: title.trim(),
    description: typeof description === 'string' ? description.trim() : undefined,
    steps: normalizedSteps,
    isPublished: Boolean(isPublished),
    createdBy: session.user.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(COLLECTIONS.GYM_LESSONS).insertOne(doc);

  return apiCreated({ training: doc, lesson: doc });
});
