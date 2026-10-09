/**
 * Slideshows API
 * 
 * POST: Create new slideshow for an event
 * GET: List all slideshows for an event (query param: eventId)
 * DELETE: Delete a slideshow
 */

import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import {
  SLIDESHOW_DEFAULT_BACKGROUND_ACCENT,
  SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY,
} from '@/lib/gds/tokens/colors';
import { normalizeStageAspectInput } from '@/lib/slideshow/stage-aspect';
import { parseScreenDesign } from '@/lib/slideshow/screen-design';
import { logWarn } from '@/lib/observability/logger';
import { scheduleWelcomeScreen } from '@/lib/screen/welcome-screen-store';
import {
  getPartnerScopedAccessForEvent,
  getPartnerScopedAccessForEventUuid,
  isGlobalAdminSession,
} from '@/lib/partners/authorization';
import { withErrorHandler } from '@/lib/api/withErrorHandler';

/**
 * POST /api/slideshows
 * Create a new slideshow for an event
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      eventId, 
      name, 
      transitionDurationMs = 5000, 
      fadeDurationMs = 1000,
      bufferSize = 10,
      refreshStrategy = 'continuous',
      playMode: bodyPlayMode,
      orderMode: bodyOrderMode,
      crossfade: bodyCrossfade,
      stageAspect: bodyStageAspect,
      submissionSourceMode: bodySubmissionSourceMode,
    } = body;

    const playMode = bodyPlayMode === 'once' ? 'once' : 'loop';
    const orderMode = bodyOrderMode === 'random' ? 'random' : 'fixed';
    const backgroundPrimaryColor =
      typeof body.backgroundPrimaryColor === 'string' && body.backgroundPrimaryColor.trim()
        ? body.backgroundPrimaryColor.trim()
        : SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY;
    const backgroundAccentColor =
      typeof body.backgroundAccentColor === 'string' && body.backgroundAccentColor.trim()
        ? body.backgroundAccentColor.trim()
        : SLIDESHOW_DEFAULT_BACKGROUND_ACCENT;
    const backgroundImageUrl =
      typeof body.backgroundImageUrl === 'string' && body.backgroundImageUrl.trim()
        ? body.backgroundImageUrl.trim()
        : null;
    const viewportScale = body.viewportScale === 'fill' ? 'fill' : 'fit';
    const submissionSourceMode =
      bodySubmissionSourceMode === 'approved_tryon_only'
        ? 'approved_tryon_only'
        : bodySubmissionSourceMode === 'originals_and_approved_tryon'
          ? 'originals_and_approved_tryon'
          : 'originals_only';
    const stageAspectNorm = normalizeStageAspectInput(bodyStageAspect);

    if (!eventId || !name) {
      return NextResponse.json(
        { error: 'Event ID and slideshow name are required' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    // Validate that event exists and get its UUID
    const event = await db
      .collection(COLLECTIONS.EVENTS)
      .findOne({ _id: new ObjectId(eventId) });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (!isGlobalAdminSession(session)) {
      const access = await getPartnerScopedAccessForEvent(db, eventId, session, 'manager');
      if (!access.allowed) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Partner-level Events manager access is required' },
          { status: 403 }
        );
      }
    }

    // Create slideshow document
    // IMPORTANT: Store event UUID (event.eventId), not MongoDB _id
    // This matches how submissions store events and allows direct filtering
    const slideshow: Record<string, unknown> = {
      slideshowId: generateId(),
      eventId: event.eventId,  // UUID, not MongoDB _id
      eventName: event.name,
      name,
      isActive: true,
      transitionDurationMs,
      fadeDurationMs,
      bufferSize,
      refreshStrategy,
      playMode,
      orderMode,
      crossfade: bodyCrossfade === true,
      backgroundPrimaryColor,
      backgroundAccentColor,
      backgroundImageUrl,
      viewportScale,
      submissionSourceMode,
      createdBy: session.user.id,
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    };
    if (stageAspectNorm !== undefined && stageAspectNorm !== null) {
      slideshow.stageAspect = stageAspectNorm;
    }

    const result = await db.collection(COLLECTIONS.SLIDESHOWS).insertOne(slideshow);

    return NextResponse.json({
      success: true,
      slideshow: {
        _id: result.insertedId,
        ...slideshow,
      },
    });
  } catch (error) {
    console.error('Error creating slideshow:', error);
    return NextResponse.json(
      { error: 'Failed to create slideshow' },
      { status: 500 }
    );
  }
});

/**
 * GET /api/slideshows?eventId=...
 * List all slideshows for an event
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    if (!isGlobalAdminSession(session)) {
      const access = await getPartnerScopedAccessForEventUuid(db, eventId, session);
      if (!access.allowed) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Partner-level Events access is required' },
          { status: 403 }
        );
      }
    }

    const slideshows = await db
      .collection(COLLECTIONS.SLIDESHOWS)
      .find({ eventId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ slideshows });
  } catch (error) {
    console.error('Error fetching slideshows:', error);
    return NextResponse.json(
      { error: 'Failed to fetch slideshows' },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/slideshows?id=...
 * Update slideshow settings
 */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Valid slideshow ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const {
      name,
      bufferSize,
      transitionDurationMs,
      fadeDurationMs,
      refreshStrategy,
      isActive,
      playMode,
      orderMode,
      crossfade,
      backgroundPrimaryColor,
      backgroundAccentColor,
      backgroundImageUrl,
      viewportScale,
      stageAspect: bodyStageAspectPatch,
      screenDesign,
      submissionSourceMode,
    } = body;

    const hexOk = (s: string) =>
      /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: generateTimestamp(),
    };
    // An open screen reads its settings and its screen design when it loads: a save asks every open copy to reload at its next slide (lib/slideshow/reload.ts), so a saved change shows
    // on the screens without anybody pressing "Reload the screen" (owner, 2026-10-09: it has to be recalculated every time a save happens).
    updates.reloadRequestedAt = updates.updatedAt;

    if (name !== undefined) updates.name = name;
    if (bufferSize !== undefined) updates.bufferSize = Math.max(1, Math.min(50, parseInt(bufferSize)));
    if (transitionDurationMs !== undefined) updates.transitionDurationMs = Math.max(1000, parseInt(transitionDurationMs));
    if (fadeDurationMs !== undefined) updates.fadeDurationMs = Math.max(0, parseInt(fadeDurationMs));
    if (refreshStrategy !== undefined) updates.refreshStrategy = refreshStrategy;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (playMode !== undefined) {
      if (playMode !== 'once' && playMode !== 'loop') {
        return NextResponse.json({ error: 'playMode must be "once" or "loop"' }, { status: 400 });
      }
      updates.playMode = playMode;
    }
    if (crossfade !== undefined) {
      if (typeof crossfade !== 'boolean') {
        return NextResponse.json({ error: 'crossfade must be true or false' }, { status: 400 });
      }
      updates.crossfade = crossfade;
    }
    if (orderMode !== undefined) {
      if (orderMode !== 'fixed' && orderMode !== 'random') {
        return NextResponse.json({ error: 'orderMode must be "fixed" or "random"' }, { status: 400 });
      }
      updates.orderMode = orderMode;
    }
    if (backgroundPrimaryColor !== undefined) {
      const v = String(backgroundPrimaryColor).trim();
      if (!hexOk(v)) {
        return NextResponse.json(
          { error: 'backgroundPrimaryColor must be a #RGB or #RRGGBB hex value' },
          { status: 400 }
        );
      }
      updates.backgroundPrimaryColor = v;
    }
    if (backgroundAccentColor !== undefined) {
      const v = String(backgroundAccentColor).trim();
      if (!hexOk(v)) {
        return NextResponse.json(
          { error: 'backgroundAccentColor must be a #RGB or #RRGGBB hex value' },
          { status: 400 }
        );
      }
      updates.backgroundAccentColor = v;
    }
    if (backgroundImageUrl !== undefined) {
      if (backgroundImageUrl === null || backgroundImageUrl === '') {
        updates.backgroundImageUrl = null;
      } else if (typeof backgroundImageUrl === 'string' && backgroundImageUrl.trim()) {
        updates.backgroundImageUrl = backgroundImageUrl.trim();
      } else {
        return NextResponse.json({ error: 'backgroundImageUrl must be a non-empty string or null' }, { status: 400 });
      }
    }
    if (screenDesign !== undefined) {
      const parsed = parseScreenDesign(screenDesign);
      if (!parsed.ok) {
        // A refused save is only seen by the person who pressed Save unless it is logged (owner, 2026-10-09: "do you save the errors?").
        logWarn('slideshow.save_refused', 'A slideshow save was refused: the screen design did not pass the check', { slideshowId: id, userId: session.user?.id ?? null, error: parsed.error });
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      updates.screenDesign = parsed.value;
    }
    if (viewportScale !== undefined) {
      if (viewportScale !== 'fit' && viewportScale !== 'fill') {
        return NextResponse.json(
          { error: 'viewportScale must be "fit" or "fill"' },
          { status: 400 }
        );
      }
      updates.viewportScale = viewportScale;
    }
    if (submissionSourceMode !== undefined) {
      if (
        submissionSourceMode !== 'originals_only' &&
        submissionSourceMode !== 'approved_tryon_only' &&
        submissionSourceMode !== 'originals_and_approved_tryon'
      ) {
        return NextResponse.json(
          { error: 'submissionSourceMode must be "originals_only", "approved_tryon_only", or "originals_and_approved_tryon"' },
          { status: 400 }
        );
      }
      updates.submissionSourceMode = submissionSourceMode;
    }
    if (bodyStageAspectPatch !== undefined) {
      if (bodyStageAspectPatch === null) {
        updates.stageAspect = null;
      } else {
        const n = normalizeStageAspectInput(bodyStageAspectPatch);
        if (n === undefined || n === null) {
          return NextResponse.json(
            {
              error:
                'stageAspect must be a finite number (0.25–4 width÷height) or null for event default',
            },
            { status: 400 }
          );
        }
        updates.stageAspect = n;
      }
    }

    const db = await connectToDatabase();
    const existing = await db
      .collection(COLLECTIONS.SLIDESHOWS)
      .findOne({ _id: new ObjectId(id) });

    if (!existing) {
      return NextResponse.json({ error: 'Slideshow not found' }, { status: 404 });
    }

    if (!isGlobalAdminSession(session)) {
      const access = await getPartnerScopedAccessForEventUuid(db, existing.eventId as string, session, 'manager');
      if (!access.allowed) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Partner-level Events manager access is required' },
          { status: 403 }
        );
      }
    }
    const result = await db.collection(COLLECTIONS.SLIDESHOWS).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: 'after' }
    );

    // The welcome page screen is the default slideshow's screen: a saved screen design draws it again, also for an event that had none (owner, 2026-10-09).
    if (existing.isDefault === true && screenDesign !== undefined) {
      const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: existing.eventId }, { projection: { _id: 1 } });
      if (event) scheduleWelcomeScreen(event._id);
    }

    return NextResponse.json({ success: true, slideshow: result });
  } catch (error) {
    console.error('Error updating slideshow:', error);
    return NextResponse.json(
      { error: 'Failed to update slideshow' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/slideshows?id=...
 * Delete a slideshow
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Valid slideshow ID is required' }, { status: 400 });
    }

    const db = await connectToDatabase();
    const existing = await db
      .collection(COLLECTIONS.SLIDESHOWS)
      .findOne({ _id: new ObjectId(id) });

    if (!existing) {
      return NextResponse.json({ error: 'Slideshow not found' }, { status: 404 });
    }

    if (!isGlobalAdminSession(session)) {
      const access = await getPartnerScopedAccessForEventUuid(db, existing.eventId as string, session, 'manager');
      if (!access.allowed) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Partner-level Events manager access is required' },
          { status: 403 }
        );
      }
    }

    // The default slideshow is what the welcome page screen and the giant screen start from: it is replaced (make another the default), never just removed (camera#327).
    if (existing.isDefault === true) {
      return NextResponse.json({ error: 'This is the default slideshow of the event. Make another slideshow the default first, then delete this one.' }, { status: 409 });
    }

    await db.collection(COLLECTIONS.SLIDESHOWS).deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting slideshow:', error);
    return NextResponse.json(
      { error: 'Failed to delete slideshow' },
      { status: 500 }
    );
  }
});
