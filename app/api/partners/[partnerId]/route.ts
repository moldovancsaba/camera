/**
 * Partner API - Individual Operations
 * 
 * GET: Get single partner details
 * PATCH: Update partner (includes cascade to child events for default styles)
 * DELETE: Delete partner (prevents deletion if has active events)
 */

import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, generateTimestamp, LogoScenario } from '@/lib/db/schemas';
import { updateChildEventsFromPartner } from '@/lib/db/events';

/**
 * GET /api/partners/[id]
 * Get single partner details with aggregated statistics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  try {
    const { partnerId } = await params;

    // Validate MongoDB ObjectId format
    if (!ObjectId.isValid(partnerId)) {
      return NextResponse.json(
        { error: 'Invalid partner ID' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    
    // Get partner document
    const partner = await db
      .collection(COLLECTIONS.PARTNERS)
      .findOne({ _id: new ObjectId(partnerId) });

    if (!partner) {
      return NextResponse.json(
        { error: 'Partner not found' },
        { status: 404 }
      );
    }

    // Get event count for this partner
    const eventCount = await db
      .collection(COLLECTIONS.EVENTS)
      .countDocuments({ partnerId: partner.partnerId });

    // Get frame count for this partner (partner-specific and event-specific frames)
    const frameCount = await db
      .collection(COLLECTIONS.FRAMES)
      .countDocuments({ partnerId: partner.partnerId });

    return NextResponse.json({
      partner: {
        ...partner,
        eventCount,
        frameCount,
      },
    });
  } catch (error) {
    console.error('Error fetching partner:', error);
    return NextResponse.json(
      { error: 'Failed to fetch partner' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/partners/[id]
 * Update partner details (admin only)
 * 
 * Updatable fields:
 * - name
 * - description
 * - contactEmail
 * - contactName
 * - logoUrl
 * - isActive
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  try {
    // Check authentication and authorization
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check app-specific role (appRole), not SSO-level role (user.role)
    if (session.appRole !== 'admin' && session.appRole !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { partnerId } = await params;

    // Validate MongoDB ObjectId format
    if (!ObjectId.isValid(partnerId)) {
      return NextResponse.json(
        { error: 'Invalid partner ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { 
      name, 
      description, 
      contactEmail, 
      contactName, 
      logoUrl, 
      isActive,
      defaultBrandColors,
      defaultFrames,
      defaultLogos,
    } = body;

    // Build update object with only provided fields
    // This allows partial updates without overwriting unspecified fields
    const updates: any = {
      updatedAt: generateTimestamp(),
    };

    if (name !== undefined) {
      if (name.trim() === '') {
        return NextResponse.json(
          { error: 'Partner name cannot be empty' },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    if (contactEmail !== undefined) {
      updates.contactEmail = contactEmail?.trim() || null;
    }

    if (contactName !== undefined) {
      updates.contactName = contactName?.trim() || null;
    }

    if (logoUrl !== undefined) {
      updates.logoUrl = logoUrl?.trim() || null;
    }

    if (isActive !== undefined) {
      updates.isActive = Boolean(isActive);
    }

    // Default style fields (v2.8.0)
    // These will cascade to child events
    if (defaultBrandColors !== undefined) {
      updates.defaultBrandColors = defaultBrandColors;
    }

    if (defaultFrames !== undefined) {
      updates.defaultFrames = defaultFrames;
    }

    if (defaultLogos !== undefined) {
      updates.defaultLogos = defaultLogos;
    }

    const db = await connectToDatabase();
    
    // Get partner to check partnerId before update
    const existingPartner = await db
      .collection(COLLECTIONS.PARTNERS)
      .findOne({ _id: new ObjectId(partnerId) });

    if (!existingPartner) {
      return NextResponse.json(
        { error: 'Partner not found' },
        { status: 404 }
      );
    }

    // Update partner document
    const result = await db
      .collection(COLLECTIONS.PARTNERS)
      .findOneAndUpdate(
        { _id: new ObjectId(partnerId) },
        { $set: updates },
        { returnDocument: 'after' }
      );

    if (!result) {
      return NextResponse.json(
        { error: 'Partner not found' },
        { status: 404 }
      );
    }

    // Cascade style changes to child events (v2.8.0)
    // Only if any default style fields were updated
    let cascadeResult;
    if (defaultBrandColors !== undefined || defaultFrames !== undefined || defaultLogos !== undefined) {
      const cascadeUpdates: any = {};
      
      if (defaultBrandColors !== undefined) {
        cascadeUpdates.defaultBrandColors = defaultBrandColors;
      }
      if (defaultFrames !== undefined) {
        cascadeUpdates.defaultFrames = defaultFrames;
      }
      if (defaultLogos !== undefined) {
        cascadeUpdates.defaultLogos = defaultLogos;
      }

      cascadeResult = await updateChildEventsFromPartner(
        existingPartner.partnerId,
        cascadeUpdates
      );
    }

    return NextResponse.json({
      success: true,
      partner: result,
      cascade: cascadeResult, // Include cascade stats if defaults were updated
    });
  } catch (error) {
    console.error('Error updating partner:', error);
    return NextResponse.json(
      { error: 'Failed to update partner' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/partners/[id]
 * Delete partner (admin only)
 * 
 * Prevents deletion if partner has active events
 * This maintains referential integrity in the database
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  try {
    // Check authentication and authorization
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check app-specific role (appRole), not SSO-level role (user.role)
    if (session.appRole !== 'admin' && session.appRole !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { partnerId } = await params;

    // Validate MongoDB ObjectId format
    if (!ObjectId.isValid(partnerId)) {
      return NextResponse.json(
        { error: 'Invalid partner ID' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    
    // Get partner to check existence and get partnerId
    const partner = await db
      .collection(COLLECTIONS.PARTNERS)
      .findOne({ _id: new ObjectId(partnerId) });

    if (!partner) {
      return NextResponse.json(
        { error: 'Partner not found' },
        { status: 404 }
      );
    }

    // Check for existing events
    // Prevent deletion if partner has events to maintain data integrity
    const eventCount = await db
      .collection(COLLECTIONS.EVENTS)
      .countDocuments({ partnerId: partner.partnerId });

    if (eventCount > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete partner with existing events',
          eventCount,
        },
        { status: 409 }
      );
    }

    // Delete partner
    await db
      .collection(COLLECTIONS.PARTNERS)
      .deleteOne({ _id: new ObjectId(partnerId) });

    return NextResponse.json({
      success: true,
      message: 'Partner deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting partner:', error);
    return NextResponse.json(
      { error: 'Failed to delete partner' },
      { status: 500 }
    );
  }
}
