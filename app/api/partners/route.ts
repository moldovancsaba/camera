/**
 * Partners API - List and Create
 * 
 * GET: List all partners with pagination, search, and filtering
 * POST: Create new partner (admin only)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import {
  withErrorHandler,
  requireAdmin,
  parsePaginationParams,
  validateRequiredFields,
  apiSuccess,
  apiCreated,
} from '@/lib/api';

/**
 * GET /api/partners
 * List all partners with optional pagination, search, and filtering
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - search: Search by partner name
 * - active: Filter by active status (true/false)
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const { page, limit } = parsePaginationParams(searchParams);
  const search = searchParams.get('search');
  const active = searchParams.get('active');

  const db = await connectToDatabase();
    
    // Build query
    // Query filters are used to narrow down the result set based on user input
    const query: any = {};
    
    // Search by partner name (case-insensitive)
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    // Filter by active status
    if (active !== null) {
      query.isActive = active === 'true';
    }

    // Get total count for pagination
    const total = await db.collection(COLLECTIONS.PARTNERS).countDocuments(query);

    // Get paginated results sorted by creation date (newest first)
    const partners = await db
      .collection(COLLECTIONS.PARTNERS)
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

  return apiSuccess({
    partners,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * POST /api/partners
 * Create a new partner (admin only)
 * 
 * Required fields in request body:
 * - name: Partner name
 * 
 * Optional fields:
 * - description: Partner description
 * - contactEmail: Contact email
 * - contactName: Contact person name
 * - logoUrl: Partner logo URL
 * - isActive: Active status (default: true)
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  // Check authentication and authorization - only admin users can create partners
  const session = await requireAdmin();

  // Parse request body
  const body = await request.json();
  const { name, description, contactEmail, contactName, logoUrl, isActive } = body;

  // Validate required fields
  validateRequiredFields(body, ['name']);

  // Create partner document
  // partnerId is a UUID for consistent identification across systems
  // Timestamps are in ISO 8601 format with milliseconds UTC
  const db = await connectToDatabase();
  const now = generateTimestamp();
  const partner = {
    partnerId: generateId(),
    name: name.trim(),
    description: description?.trim() || undefined,
    contactEmail: contactEmail?.trim() || undefined,
    contactName: contactName?.trim() || undefined,
    logoUrl: logoUrl?.trim() || undefined,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    eventCount: 0,
    frameCount: 0,
    createdBy: session.user.id,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTIONS.PARTNERS).insertOne(partner);

  return apiCreated({
    partner: {
      _id: result.insertedId,
      ...partner,
    },
  });
});
