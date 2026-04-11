/**
 * Frames API - List and Create
 * 
 * GET: List all frames with pagination
 * POST: Create new frame (admin only)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { uploadImage } from '@/lib/imgbb/upload';
import { generateId } from '@/lib/db/schemas';
import {
  withErrorHandler,
  requireAdmin,
  parsePaginationParams,
  apiSuccess,
  apiCreated,
  apiBadRequest,
} from '@/lib/api';

/**
 * GET /api/frames
 * List all frames with optional pagination and filtering
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const { page, limit } = parsePaginationParams(searchParams);
  const category = searchParams.get('category');
  const active = searchParams.get('active');

  const db = await connectToDatabase();
    
    // Build query
    const query: any = {};
    if (category) query.category = category;
    if (active !== null) query.isActive = active === 'true';

    // Get total count
    const total = await db.collection('frames').countDocuments(query);

    // Get paginated results
    const frames = await db
      .collection('frames')
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

  // Serialize MongoDB ObjectId and ensure frameId exists
  const serializedFrames = [];
  for (const frame of frames) {
    // Auto-migrate: add frameId if missing
    if (!frame.frameId) {
      const frameId = generateId();
      await db.collection('frames').updateOne(
        { _id: frame._id },
        { $set: { frameId, updatedAt: new Date().toISOString() } }
      );
      frame.frameId = frameId;
    }
    
    serializedFrames.push({
      ...frame,
      _id: frame._id.toString(),
    });
  }

  return apiSuccess({
    frames: serializedFrames,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * POST /api/frames
 * Create a new frame (admin only)
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  // Check authentication and authorization - only admin users can create frames
  const session = await requireAdmin();

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const category = formData.get('category') as string;
    // Checkbox: if present and value is 'true', then true; otherwise false
    const isActiveValue = formData.get('isActive');
    const isActive = isActiveValue === 'true';

    console.log('Form data received:', {
      hasFile: !!file,
      fileName: file?.name,
      fileType: file?.type,
      fileSize: file?.size,
      name,
      category,
      isActive,
    });

  if (!file || !name || name.trim() === '') {
    throw apiBadRequest('File and name are required', {
      hasFile: !!file,
      hasName: !!name && name.trim() !== '',
      fileName: file?.name,
      nameValue: name,
    });
  }

  // Check if file is actually a File object
  if (!(file instanceof File)) {
    throw apiBadRequest('Invalid file upload');
  }

  // Validate file type
  const allowedTypes = ['image/png', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    throw apiBadRequest('Only PNG and SVG files are allowed');
  }

  // Upload to imgbb
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const uploadResult = await uploadImage(base64, { name: `frame-${Date.now()}` });

  // Save to database
  const db = await connectToDatabase();
  const frame = {
    frameId: generateId(),
    name,
    description,
    category: category || 'general',
    imageUrl: uploadResult.imageUrl,
    deleteUrl: uploadResult.deleteUrl,
    imageId: uploadResult.imageId,
    fileSize: uploadResult.fileSize,
    mimeType: uploadResult.mimeType,
    isActive,
    createdBy: session.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const result = await db.collection('frames').insertOne(frame);

  return apiCreated({
    frame: {
      _id: result.insertedId,
      ...frame,
    },
  });
});
