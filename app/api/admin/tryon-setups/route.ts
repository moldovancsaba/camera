import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type TryOnSetup, type TryOnSetupConfig } from '@/lib/db/schemas';
import { buildUniqueSetupId } from '@/lib/tryon/setup-resolution';
import { apiBadRequest, apiCreated, apiSuccess, requireAdmin, withErrorHandler } from '@/lib/api';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// WHAT: Only the config fields the resolution/rerun UI actually reads get
// real inputs on the form; anything else already on a document (an unknown
// key under TryOnSetupConfig's index signature) passes through untouched.
// WHY: keeps the form honest about what it edits without silently dropping
// exotic fields nobody told this CRUD about.
function buildConfig(body: Record<string, unknown>, existing?: TryOnSetupConfig): TryOnSetupConfig {
  const config: TryOnSetupConfig = { ...(existing ?? {}) };
  if (body.processingProfile !== undefined || body.processing_profile !== undefined) {
    const value = normalizeString(body.processingProfile ?? body.processing_profile);
    config.processing_profile = value || undefined;
  }
  if (body.category !== undefined) config.category = normalizeString(body.category) || undefined;
  if (body.sleeveLength !== undefined) config.sleeve_length = normalizeString(body.sleeveLength) || undefined;
  if (body.pantLength !== undefined) config.pant_length = normalizeString(body.pantLength) || undefined;
  if (body.resolution !== undefined) config.resolution = normalizeString(body.resolution) || undefined;
  if (body.steps !== undefined) config.steps = Number.isFinite(Number(body.steps)) ? Number(body.steps) : undefined;
  if (body.guidance !== undefined) config.guidance = Number.isFinite(Number(body.guidance)) ? Number(body.guidance) : undefined;
  if (body.showMask !== undefined) config.show_mask = Boolean(body.showMask);
  if (body.maskSharpness !== undefined) config.mask_sharpness = Number.isFinite(Number(body.maskSharpness)) ? Number(body.maskSharpness) : undefined;
  if (body.maskPadding !== undefined) config.mask_padding = Number.isFinite(Number(body.maskPadding)) ? Number(body.maskPadding) : undefined;
  if (body.detailBoost !== undefined) config.detail_boost = Number.isFinite(Number(body.detailBoost)) ? Number(body.detailBoost) : undefined;
  return config;
}

/**
 * GET /api/admin/tryon-setups
 * List every setup (active and archived) for the setups CRUD -- listActiveTryOnSetups
 * (lib/tryon/setup-resolution.ts) is for job resolution and only ever returns active ones.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin();

  const { searchParams } = request.nextUrl;
  const search = searchParams.get('search')?.trim();
  const active = searchParams.get('active');

  const db = await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (active !== null) query.active = active === 'true';
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { setupId: { $regex: search, $options: 'i' } },
    ];
  }

  const setups = await db
    .collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS)
    .find(query)
    .sort({ isDefault: -1, rank: 1, setupId: 1 })
    .toArray();

  return apiSuccess({
    setups: setups.map((setup) => ({ ...setup, _id: setup._id?.toString?.() ?? null })),
  });
});

/**
 * POST /api/admin/tryon-setups
 * Create a new try-on setup (global admin only).
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin();
  const db = await connectToDatabase();
  const now = new Date().toISOString();
  const body = await request.json();

  const name = normalizeString(body.name);
  if (!name) {
    throw apiBadRequest('name is required');
  }

  const providedId = normalizeString(body.setupId);
  const setupId = providedId || (await buildUniqueSetupId(db, name));
  const existing = await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).findOne({ setupId }, { projection: { _id: 1 } });
  if (existing) {
    throw apiBadRequest('A setup with this id already exists');
  }

  const setup: TryOnSetup = {
    setupId,
    name,
    description: normalizeString(body.description) || null,
    cameraId: normalizeString(body.cameraId) || null,
    active: body.active !== false,
    isDefault: Boolean(body.isDefault),
    rank: Number.isFinite(Number(body.rank)) ? Number(body.rank) : 0,
    config: buildConfig(body),
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).insertOne(setup);
  const saved = await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).findOne({ setupId });
  return apiCreated({ setup: { ...saved, _id: saved?._id?.toString?.() ?? null } });
});
