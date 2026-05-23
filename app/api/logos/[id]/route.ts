/**
 * Single Logo API - Get, Update, Delete
 * 
 * GET: Fetch single logo by MongoDB _id
 * PUT: Update logo details (global admin only)
 * DELETE: Delete logo (global admin only)
 */

import { NextRequest } from 'next/server';
import { ObjectId, type Document, type UpdateFilter } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import {
  withErrorHandler,
  requireAdmin,
  apiSuccess,
  apiNotFound,
  apiBadRequest,
  apiNoContent,
} from '@/lib/api';

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface LogoUpdateBody {
  name?: string;
  description?: string;
  isActive?: boolean;
}

/**
 * GET /api/logos/[id]
 * Fetch a single logo by its MongoDB _id
 */
export const GET = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params;

  // Validate MongoDB ObjectId format
  if (!ObjectId.isValid(id)) {
    throw apiBadRequest('Invalid logo ID format');
  }

  const db = await connectToDatabase();
  const logo = await db.collection('logos').findOne({ _id: new ObjectId(id) });

  if (!logo) {
    throw apiNotFound('Logo');
  }

  // Serialize MongoDB ObjectId
  return apiSuccess({
    logo: {
      ...logo,
      _id: logo._id.toString(),
    },
  });
});

/**
 * PUT /api/logos/[id]
 * Update logo details (global admin only)
 */
export const PUT = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  // Check authentication and authorization
  await requireAdmin();

  const { id } = await context.params;

  // Validate MongoDB ObjectId format
  if (!ObjectId.isValid(id)) {
    throw apiBadRequest('Invalid logo ID format');
  }

  // Parse request body
  const body: LogoUpdateBody = await request.json();
  const { name, description, isActive } = body;

  // Build update object (only include provided fields)
  const updateData: Record<string, string | boolean> = {
    updatedAt: new Date().toISOString(),
  };

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (isActive !== undefined) updateData.isActive = isActive;

  // Update in database
  const db = await connectToDatabase();
  const result = await db.collection('logos').findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updateData },
    { returnDocument: 'after' }
  );

  if (!result) {
    throw apiNotFound('Logo');
  }

  // Serialize MongoDB ObjectId
  return apiSuccess({
    logo: {
      ...result,
      _id: result._id.toString(),
    },
  });
});

/**
 * DELETE /api/logos/[id]
 * Delete a logo (global admin only)
 */
export const DELETE = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  // Check authentication and authorization
  await requireAdmin();

  const { id } = await context.params;

  // Validate MongoDB ObjectId format
  if (!ObjectId.isValid(id)) {
    throw apiBadRequest('Invalid logo ID format');
  }

  const db = await connectToDatabase();

  // Check if logo exists
  const logo = await db.collection('logos').findOne({ _id: new ObjectId(id) });
  if (!logo) {
    throw apiNotFound('Logo');
  }

  // Delete the logo
  await db.collection('logos').deleteOne({ _id: new ObjectId(id) });

  // Also remove all event logo assignments for this logo
  await db.collection('events').updateMany(
    { 'logos.logoId': logo.logoId },
    { $pull: { logos: { logoId: logo.logoId } } } as unknown as UpdateFilter<Document>
  );

  return apiNoContent();
});
