/**
 * Retired compatibility endpoint. Standalone manual annotations split the
 * image-analysis record from Fanmass and could drift from its boxes/results.
 * Human corrections now save to the same per-photo Fanmass result instead.
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, requireAuth, apiError } from '@/lib/api';

export const PUT = withErrorHandler(async (request: NextRequest) => {
  await requireAuth(request);
  throw apiError('Standalone photo annotations are retired. Open the photo in Fanmass analysis review to edit its result.', 410);
});
