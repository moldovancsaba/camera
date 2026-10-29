/**
 * What fills the photo window of the welcome page screen of an event (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md, lib/screen/welcome-window.ts).
 *
 * GET  /api/admin/events/[id]/welcome-window   the setting (`source`: `selfie` by default or `standin`), the sample selfie picked for the event and the stored picture (viewer)
 * PUT  /api/admin/events/[id]/welcome-window   `{ source?, photoId?, again?, composition? }`: set the photo window, pick another sample selfie, and/or select the frame/message variant, then draw the picture again (manager); answers like GET
 *
 * `[id]` is the Mongo _id of the event, as in the other admin event routes. A page's own `screenImageUrl` is never touched.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { apiBadRequest, apiError, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { ensureDefaultSlideshow } from '@/lib/slideshow/default-slideshow';
import { ensureWelcomeScreen } from '@/lib/screen/welcome-screen-store';
import { parseWindowRequest, windowState } from '@/lib/screen/welcome-window';
import { eligiblePhoto } from '@/lib/screen/welcome-photo';
import { selectionWithExperienceOverrides } from '@/lib/visual-assets/templates';

type RouteContext = { params?: Promise<{ id: string }> };

async function load(request: NextRequest, context: RouteContext | undefined, role: 'viewer' | 'manager') {
  const session = await requireAuth(request);
  const { id } = await context!.params!;
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, role);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  return { db, event, id };
}

export const GET = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const { db, event } = await load(request, context, 'viewer');
  return apiSuccess(await windowState(db, event));
});

export const PUT = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { db, event, id } = await load(request, context, 'manager');
  const parsed = parseWindowRequest(await request.json().catch(() => null));
  if (!parsed.ok) throw apiBadRequest(parsed.reason);
  const { source, photoId, again, composition } = parsed.value;
  if (source === 'photo' && !(await eligiblePhoto(db, event, photoId!))) throw apiBadRequest('This photo cannot be shown: it is not a photo of this event that is approved and visible.');
  if (composition && !((event.frameDesign as { variants?: Array<{ frameId?: string | null; index?: number | null }> } | undefined)?.variants ?? []).some((variant) => (variant.frameId ?? null) === composition.frameId && (variant.index ?? null) === composition.messageIndex)) {
    throw apiBadRequest('Choose a frame and message variant that exists for this event.');
  }
  if (source !== undefined) {
    // The sample selfie is the default and is stored as nothing; the stand-in and a photo of the event are choices.
    const now = generateTimestamp();
    const update =
      source === 'photo'
        ? { $set: { 'welcomeWindow.source': 'photo', 'welcomeWindow.photoId': photoId!, updatedAt: now } }
        : source === 'standin'
          ? { $set: { 'welcomeWindow.source': 'standin', updatedAt: now }, $unset: { 'welcomeWindow.photoId': '' } }
          : { $set: { updatedAt: now }, $unset: { 'welcomeWindow.source': '', 'welcomeWindow.photoId': '' } };
    await db.collection(COLLECTIONS.EVENTS).updateOne({ _id: new ObjectId(id) }, update);
  }
  if (composition) {
    const experienceTemplate = selectionWithExperienceOverrides(
      event.experienceTemplate,
      { welcomeScreenComposition: composition },
    );
    await db.collection(COLLECTIONS.EVENTS).updateOne(
      { _id: new ObjectId(id) },
      { $set: { welcomeScreenComposition: composition, ...(experienceTemplate ? { experienceTemplate } : {}) } },
    );
  }
  const current = (await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) })) ?? event;
  const slideshow = await ensureDefaultSlideshow(db, current);
  if (!slideshow.ok) return apiError(slideshow.reason, 503);
  const drawn = await ensureWelcomeScreen(db, current, undefined, { again });
  if (!drawn.ok) return apiError(drawn.reason, 503);
  const saved = (await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) })) ?? current;
  return apiSuccess(await windowState(db, saved));
});
