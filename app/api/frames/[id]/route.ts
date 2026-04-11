/**
 * Frame API - Individual Frame Operations
 * 
 * GET: Get single frame by ID
 * PUT: Update frame
 * DELETE: Delete frame (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { ObjectId } from 'mongodb';

/**
 * GET /api/frames/[id]
 * Get a single frame by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    const frame = await db.collection('frames').findOne({ _id: new ObjectId(id) });

    if (!frame) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 });
    }

    return NextResponse.json({ frame });
  } catch (error) {
    console.error('Error fetching frame:', error);
    return NextResponse.json({ error: 'Failed to fetch frame' }, { status: 500 });
  }
}

/**
 * PUT /api/frames/[id]
 * Update a frame (admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check app-specific role (appRole), not SSO-level role (user.role)
    if (session.appRole !== 'admin' && session.appRole !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, category, isActive } = body;

    const db = await connectToDatabase();
    
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (isActive !== undefined) updateData.isActive = isActive;

    const result = await db.collection('frames').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating frame:', error);
    return NextResponse.json({ error: 'Failed to update frame' }, { status: 500 });
  }
}

/**
 * DELETE /api/frames/[id]
 * Delete a frame (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check app-specific role (appRole), not SSO-level role (user.role)
    if (session.appRole !== 'admin' && session.appRole !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = await connectToDatabase();
    const result = await db.collection('frames').deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting frame:', error);
    return NextResponse.json({ error: 'Failed to delete frame' }, { status: 500 });
  }
}
