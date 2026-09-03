import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, type Slideshow, type Submission } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { nowIso } from '@/lib/tryon/time';

// WHAT: Hand-curates a try-on result into a slideshow's rotation on top of
// whatever its submissionSourceMode policy already matches. WHY: every
// existing source mode is policy-driven (all approved results, or all
// originals) -- there was no way to pick specific Greatest Hits for one
// slideshow. See app/api/slideshows/[slideshowId]/playlist/route.ts for
// where manualSubmissionIds gets read back out.
export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> }
) => {
  const session = await requireAuth(request);
  if (!isGlobalAdminSession(session)) {
    throw apiForbidden('Global admin access is required');
  }

  const { submissionId } = await context.params;
  if (!ObjectId.isValid(submissionId)) {
    throw apiBadRequest('Invalid submission ID');
  }

  const body = (await request.json().catch(() => ({}))) as { slideshowId?: unknown; pin?: unknown };
  const slideshowId = typeof body.slideshowId === 'string' ? body.slideshowId.trim() : '';
  if (!slideshowId) {
    throw apiBadRequest('slideshowId is required');
  }
  const pin = body.pin !== false;

  const db = await connectToDatabase();
  const result = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .findOne({ _id: new ObjectId(submissionId), submissionKind: 'tryon_result' });
  if (!result) {
    throw apiNotFound('Try-on result');
  }

  const slideshow = await db
    .collection<Slideshow>(COLLECTIONS.SLIDESHOWS)
    .findOne({ slideshowId });
  if (!slideshow) {
    throw apiNotFound('Slideshow');
  }
  // Same-event guard: a result belongs to one event's Greatest Hits, and a
  // slideshow belongs to one event -- pinning across events would silently
  // surface one event's guest photo in another's rotation. Empty eventIds is
  // fail-closed, not skipped: it's ambiguous between a genuinely general
  // (never event-tied) submission and one just hidden-from-partner via
  // app/api/partners/[partnerId]/submissions/[submissionId]/route.ts, which
  // clears eventIds specifically to remove it from event-scoped surfaces --
  // this route can't tell the two apart, and the event-scoped Vetting page
  // never surfaces either case today (its query requires an eventIds match),
  // so rejecting here costs no real workflow.
  const resultEventKeys = [result.eventId, result.eventIds].flat().filter(Boolean);
  if (slideshow.eventId) {
    if (resultEventKeys.length === 0) {
      throw apiBadRequest('Result has no event reference; cannot verify it belongs to this slideshow\'s event');
    }
    if (!resultEventKeys.includes(slideshow.eventId)) {
      throw apiBadRequest('That slideshow belongs to a different event than this result');
    }
  }

  const now = nowIso();
  const writeResult = pin
    ? await db.collection<Slideshow>(COLLECTIONS.SLIDESHOWS).updateOne(
        { slideshowId },
        { $addToSet: { manualSubmissionIds: submissionId }, $set: { updatedAt: now } }
      )
    : await db.collection<Slideshow>(COLLECTIONS.SLIDESHOWS).updateOne(
        { slideshowId },
        { $pull: { manualSubmissionIds: submissionId }, $set: { updatedAt: now } }
      );

  if (writeResult.matchedCount === 0) {
    throw apiNotFound('Slideshow no longer exists');
  }

  return apiSuccess({ submissionId, slideshowId, pinned: pin });
});
