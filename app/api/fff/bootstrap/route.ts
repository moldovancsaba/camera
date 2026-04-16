/**
 * FunFitFan: ensure partner + personal virtual event + slideshow; returns capture/slideshow ids.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAuth, apiSuccess, apiError } from '@/lib/api';
import { ensureFunFitFanUserContext, FffBootstrapError } from '@/lib/funfitfan/bootstrap';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  const db = await connectToDatabase();
  try {
    const ctx = await ensureFunFitFanUserContext(db, session);
    return apiSuccess(ctx);
  } catch (e) {
    if (e instanceof FffBootstrapError) {
      throw apiError(e.message, e.status);
    }
    throw e;
  }
});
