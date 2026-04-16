/**
 * Single workout session: read or update progress / completion.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp, type GymWorkoutSessionStatus } from '@/lib/db/schemas';
import {
  withErrorHandler,
  requireAuth,
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiForbidden,
} from '@/lib/api';
import { assertGymAppAccess } from '@/lib/gym/access';

export const GET = withErrorHandler(
  async (_request: NextRequest, context: { params: Promise<{ sessionId: string }> }) => {
    const session = await requireAuth();
    assertGymAppAccess(session);
    const { sessionId } = await context.params;

    const db = await connectToDatabase();
    const row = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
    if (!row) {
      throw apiNotFound('Session');
    }
    if (row.userId !== session.user.id) {
      throw apiForbidden('Not your session');
    }

    return apiSuccess({
      session: {
        ...row,
        _id: row._id?.toString(),
      },
    });
  }
);

export const PATCH = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ sessionId: string }> }) => {
    const session = await requireAuth();
    assertGymAppAccess(session);
    const { sessionId } = await context.params;
    const body = await request.json();

    const db = await connectToDatabase();
    const row = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
    if (!row) {
      throw apiNotFound('Session');
    }
    if (row.userId !== session.user.id) {
      throw apiForbidden('Not your session');
    }

    const $set: Record<string, unknown> = { updatedAt: generateTimestamp() };

    if (body.status !== undefined) {
      const s = body.status as string;
      if (!['in_progress', 'completed', 'cancelled'].includes(s)) {
        throw apiBadRequest('Invalid status');
      }
      if (s === 'completed') {
        const selfie = row.selfieImageUrl;
        if (typeof selfie !== 'string' || !selfie.trim()) {
          throw apiBadRequest('Add a gym selfie before you can complete this workout.');
        }
      }
      $set.status = s as GymWorkoutSessionStatus;
      if (s === 'completed' || s === 'cancelled') {
        $set.completedAt = generateTimestamp();
      }
    }

    if (body.stepLog !== undefined) {
      if (!Array.isArray(body.stepLog)) {
        throw apiBadRequest('stepLog must be an array');
      }
      for (let i = 0; i < body.stepLog.length; i++) {
        const e = body.stepLog[i];
        if (typeof e.stepOrder !== 'number' || typeof e.completedAt !== 'string') {
          throw apiBadRequest(`stepLog[${i}] needs stepOrder (number) and completedAt (string)`);
        }
      }
      $set.stepLog = body.stepLog;
    }

    if (Object.keys($set).length <= 1) {
      throw apiBadRequest('Nothing to update');
    }

    await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).updateOne({ sessionId }, { $set });

    const next = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
    return apiSuccess({
      session: {
        ...next,
        _id: next?._id?.toString(),
      },
    });
  }
);
