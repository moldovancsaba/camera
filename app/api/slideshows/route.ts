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

/**
 * POST /api/slideshows
 * Create a new slideshow for an event
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication - only admins can create slideshows
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.appRole !== 'admin' && session.appRole !== 'superadmin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required to create slideshows' },
        { status: 403 }
      );
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
    } = body;

    const playMode = bodyPlayMode === 'once' ? 'once' : 'loop';
    const orderMode = bodyOrderMode === 'random' ? 'random' : 'fixed';
    const backgroundPrimaryColor =
      typeof body.backgroundPrimaryColor === 'string' && body.backgroundPrimaryColor.trim()
        ? body.backgroundPrimaryColor.trim()
        : '#312e81';
    const backgroundAccentColor =
      typeof body.backgroundAccentColor === 'string' && body.backgroundAccentColor.trim()
        ? body.backgroundAccentColor.trim()
        : '#0f172a';
    const backgroundImageUrl =
      typeof body.backgroundImageUrl === 'string' && body.backgroundImageUrl.trim()
        ? body.backgroundImageUrl.trim()
        : null;
    const viewportScale = body.viewportScale === 'fill' ? 'fill' : 'fit';

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

    // Create slideshow document
    // IMPORTANT: Store event UUID (event.eventId), not MongoDB _id
    // This matches how submissions store events and allows direct filtering
    const slideshow = {
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
      backgroundPrimaryColor,
      backgroundAccentColor,
      backgroundImageUrl,
      viewportScale,
      createdBy: session.user.id,
      createdAt: generateTimestamp(),
      updatedAt: generateTimestamp(),
    };

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
}

/**
 * GET /api/slideshows?eventId=...
 * List all slideshows for an event
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

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
}

/**
 * PATCH /api/slideshows?id=...
 * Update slideshow settings
 */
export async function PATCH(request: NextRequest) {
  try {
    // Check authentication
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
      backgroundPrimaryColor,
      backgroundAccentColor,
      backgroundImageUrl,
      viewportScale,
    } = body;

    const hexOk = (s: string) =>
      /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());

    // Build update object
    const updates: any = {
      updatedAt: generateTimestamp(),
    };

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
    if (viewportScale !== undefined) {
      if (viewportScale !== 'fit' && viewportScale !== 'fill') {
        return NextResponse.json(
          { error: 'viewportScale must be "fit" or "fill"' },
          { status: 400 }
        );
      }
      updates.viewportScale = viewportScale;
    }

    const db = await connectToDatabase();

    const result = await db
      .collection(COLLECTIONS.SLIDESHOWS)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updates },
        { returnDocument: 'after' }
      );

    if (!result) {
      return NextResponse.json({ error: 'Slideshow not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, slideshow: result });
  } catch (error) {
    console.error('Error updating slideshow:', error);
    return NextResponse.json(
      { error: 'Failed to update slideshow' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/slideshows?id=...
 * Delete a slideshow
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
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

    const result = await db
      .collection(COLLECTIONS.SLIDESHOWS)
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Slideshow not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting slideshow:', error);
    return NextResponse.json(
      { error: 'Failed to delete slideshow' },
      { status: 500 }
    );
  }
}
