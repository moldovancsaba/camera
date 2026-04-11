/**
 * Partner API - Quick Toggle Active Status
 * 
 * PATCH: Toggle partner active/inactive status
 * Used for quick status changes from listing page without full update form
 */

import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';

/**
 * PATCH /api/partners/[id]/toggle
 * Toggle partner active/inactive status (admin only)
 * 
 * This endpoint provides a quick way to toggle status from the listing page
 * without needing to load the full edit form, enabling better UX
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

    const db = await connectToDatabase();
    
    // Get current partner to toggle its isActive state
    const partner = await db
      .collection(COLLECTIONS.PARTNERS)
      .findOne({ _id: new ObjectId(partnerId) });

    if (!partner) {
      return NextResponse.json(
        { error: 'Partner not found' },
        { status: 404 }
      );
    }

    // Toggle isActive status
    const newIsActive = !partner.isActive;

    // Update partner document
    const result = await db
      .collection(COLLECTIONS.PARTNERS)
      .findOneAndUpdate(
        { _id: new ObjectId(partnerId) },
        { 
          $set: { 
            isActive: newIsActive,
            updatedAt: generateTimestamp(),
          },
        },
        { returnDocument: 'after' }
      );

    return NextResponse.json({
      success: true,
      partner: result,
      isActive: newIsActive,
    });
  } catch (error) {
    console.error('Error toggling partner status:', error);
    return NextResponse.json(
      { error: 'Failed to toggle partner status' },
      { status: 500 }
    );
  }
}
