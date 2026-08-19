import { NextRequest } from 'next/server';
import type { Filter } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { uploadImage } from '@/lib/imgbb/upload';
import { COLLECTIONS, generateId, type GarmentType, type LeatherSuit, type SleeveStyle } from '@/lib/db/schemas';
import {
  apiBadRequest,
  apiCreated,
  apiSuccess,
  parsePaginationParams,
  requireAdmin,
  withErrorHandler,
} from '@/lib/api';

const GARMENT_TYPES: GarmentType[] = ['motorsport_suit', 'jersey', 'top', 'bottom'];
const SLEEVE_STYLES: SleeveStyle[] = ['sleeveless', 'short_sleeve', 'long_sleeve'];
// One-word tag per type, used only to keep an auto-generated catalog ID
// legible (e.g. "jersey_home_kit_v1" instead of the old hardcoded
// "motogp_home_kit_v1" for a garment that isn't a motorsport suit at all).
const GARMENT_TYPE_ID_PREFIX: Record<GarmentType, string> = {
  motorsport_suit: 'motogp',
  jersey: 'jersey',
  top: 'top',
  bottom: 'bottom',
};

function normalizeGarmentType(value: unknown): GarmentType {
  return typeof value === 'string' && (GARMENT_TYPES as string[]).includes(value)
    ? (value as GarmentType)
    : 'motorsport_suit';
}

function normalizeSleeveStyle(value: unknown): SleeveStyle | null {
  return typeof value === 'string' && (SLEEVE_STYLES as string[]).includes(value) ? (value as SleeveStyle) : null;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function slugifyTitle(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

async function buildUniqueLeatherSuitId(baseName: string, assetVersion: number, garmentType: GarmentType): Promise<string> {
  const slug = slugifyTitle(baseName) || generateId().replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  const baseId = `${GARMENT_TYPE_ID_PREFIX[garmentType]}_${slug}_v${assetVersion}`;
  const db = await connectToDatabase();
  const exists = await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).findOne(
    { leatherSuitId: baseId },
    { projection: { _id: 1 } }
  );
  if (!exists) {
    return baseId;
  }

  let suffix = 2;
  while (true) {
    const candidate = `${baseId}_${suffix}`;
    const collision = await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).findOne(
      { leatherSuitId: candidate },
      { projection: { _id: 1 } }
    );
    if (!collision) {
      return candidate;
    }
    suffix += 1;
  }
}

/**
 * GET /api/admin/tryon-suits
 * List all leather suits with optional pagination/filtering
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin();

  const { searchParams } = request.nextUrl;
  const { page, limit } = parsePaginationParams(searchParams);
  const active = searchParams.get('active');
  const search = searchParams.get('search')?.trim();

  const db = await connectToDatabase();
  const query: Filter<LeatherSuit> = {};
  if (active !== null) query.active = active === 'true';
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { leatherSuitId: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).countDocuments(query);
  const suits = await db
    .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
    .find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  return apiSuccess({
    suits: suits.map((suit) => ({
      ...suit,
      _id: suit._id?.toString?.() ?? null,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * POST /api/admin/tryon-suits
 * Create a new leather suit resource (global admin only)
 * Supports multipart file upload for the suit asset; JSON remains as a legacy fallback.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin();
  const contentType = request.headers.get('content-type') || '';
  const db = await connectToDatabase();
  const now = new Date().toISOString();

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = normalizeString(formData.get('name'));
    const description = normalizeString(formData.get('description'));
    const providedId = normalizeString(formData.get('leatherSuitId'));
    const assetVersionRaw = normalizeString(formData.get('assetVersion'));
    const assetVersion = Number.isFinite(Number(assetVersionRaw)) ? Math.max(1, Number(assetVersionRaw)) : 1;
    const isActive = formData.get('isActive') === 'true';
    const garmentType = normalizeGarmentType(formData.get('garmentType'));
    const sleeveStyle = normalizeSleeveStyle(formData.get('sleeveStyle'));

    if (!file || !(file instanceof File)) {
      throw apiBadRequest('Suit image file is required');
    }
    if (!name) {
      throw apiBadRequest('name is required');
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw apiBadRequest('Only PNG, JPG, and WebP files are allowed');
    }

    const leatherSuitId = providedId || (await buildUniqueLeatherSuitId(name, assetVersion, garmentType));
    const existing = await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).findOne(
      { leatherSuitId },
      { projection: { _id: 1 } }
    );
    if (existing) {
      throw apiBadRequest('A leather jersey with this catalog ID already exists');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const uploadResult = await uploadImage(base64, { name: `tryon-suit-${Date.now()}` });

    const suit: LeatherSuit = {
      leatherSuitId,
      name,
      description: description || null,
      garmentType,
      sleeveStyle,
      assetKey: leatherSuitId,
      assetVersion,
      imageUrl: uploadResult.imageUrl,
      thumbnailUrl: uploadResult.thumbnailUrl,
      deleteUrl: uploadResult.deleteUrl,
      imageId: uploadResult.imageId,
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType,
      previewUrl: uploadResult.thumbnailUrl || uploadResult.imageUrl,
      sourceImageUrl: uploadResult.imageUrl,
      assetRelativePath: null,
      active: isActive,
      usageCount: 0,
      createdBy: session.user.id,
      metadata: {
        pose: 'front_a_pose',
        notes: description || null,
      },
      createdAt: now,
      updatedAt: now,
    };

    await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).insertOne(suit);
    const saved = await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).findOne({ leatherSuitId });
    return apiCreated({ suit: saved });
  }

  const body = await request.json();
  const leatherSuitId = normalizeString(body.leatherSuitId);
  const name = normalizeString(body.name);
  const assetVersion = Number.isFinite(Number(body.assetVersion)) ? Math.max(1, Number(body.assetVersion)) : 1;

  if (!leatherSuitId) {
    throw apiBadRequest('leatherSuitId is required');
  }
  if (!name) {
    throw apiBadRequest('name is required');
  }

  const suit: LeatherSuit = {
    leatherSuitId,
    name,
    description: normalizeString(body.description || body.notes) || null,
    garmentType: normalizeGarmentType(body.garmentType),
    sleeveStyle: normalizeSleeveStyle(body.sleeveStyle),
    assetKey: normalizeString(body.assetKey) || leatherSuitId,
    assetVersion,
    imageUrl: normalizeString(body.imageUrl || body.sourceImageUrl || body.previewUrl) || null,
    thumbnailUrl: normalizeString(body.thumbnailUrl || body.previewUrl || body.imageUrl) || null,
    deleteUrl: normalizeString(body.deleteUrl) || null,
    imageId: normalizeString(body.imageId) || null,
    fileSize: Number.isFinite(Number(body.fileSize)) ? Number(body.fileSize) : null,
    mimeType: normalizeString(body.mimeType) || null,
    assetRelativePath: normalizeString(body.assetRelativePath) || null,
    previewUrl: normalizeString(body.previewUrl || body.thumbnailUrl || body.imageUrl) || null,
    sourceImageUrl: normalizeString(body.sourceImageUrl || body.imageUrl || body.previewUrl) || null,
    active: body.active !== false,
    usageCount: 0,
    createdBy: session.user.id,
    metadata: {
      pose: 'front_a_pose',
      notes: normalizeString(body.description || body.notes) || null,
    },
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).updateOne(
    { leatherSuitId },
    {
      $set: {
        ...suit,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  const saved = await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).findOne({ leatherSuitId });
  return apiCreated({ suit: saved });
});
