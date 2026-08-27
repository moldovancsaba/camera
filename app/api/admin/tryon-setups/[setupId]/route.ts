import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type TryOnSetup, type TryOnSetupConfig } from '@/lib/db/schemas';
import { apiBadRequest, apiNotFound, apiSuccess, requireAdmin, withErrorHandler } from '@/lib/api';
import { normalizeDefaultForGarmentTypes } from '@/lib/tryon/setup-resolution';

interface RouteContext {
  params: Promise<{ setupId: string }>;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

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

async function findSetupByParam(db: Awaited<ReturnType<typeof connectToDatabase>>, rawParam: string) {
  const normalized = normalizeString(rawParam);
  if (!normalized) {
    throw apiBadRequest('Setup id is required');
  }
  const query = ObjectId.isValid(normalized) ? { _id: new ObjectId(normalized) } : { setupId: normalized };
  const setup = await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).findOne(query);
  return { setup, query };
}

export const GET = withErrorHandler(async (_request: NextRequest, context: RouteContext) => {
  await requireAdmin();
  const { setupId } = await context.params;
  const db = await connectToDatabase();
  const { setup } = await findSetupByParam(db, setupId);
  if (!setup) throw apiNotFound('Try-on setup');
  return apiSuccess({ setup: { ...setup, _id: setup._id?.toString?.() ?? null } });
});

export const PUT = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  await requireAdmin();
  const { setupId } = await context.params;
  const db = await connectToDatabase();
  const { setup, query } = await findSetupByParam(db, setupId);
  if (!setup) throw apiNotFound('Try-on setup');

  const body = await request.json();
  const updateData: Partial<TryOnSetup> & { updatedAt: string } = {
    updatedAt: new Date().toISOString(),
  };

  if (body.name !== undefined) {
    const name = normalizeString(body.name);
    if (!name) throw apiBadRequest('name cannot be empty');
    updateData.name = name;
  }
  if (body.description !== undefined) updateData.description = normalizeString(body.description) || null;
  if (body.cameraId !== undefined) updateData.cameraId = normalizeString(body.cameraId) || null;
  if (body.active !== undefined) updateData.active = Boolean(body.active);
  if (body.isDefault !== undefined) updateData.isDefault = Boolean(body.isDefault);
  if (body.rank !== undefined && Number.isFinite(Number(body.rank))) updateData.rank = Number(body.rank);
  if (body.defaultForGarmentTypes !== undefined) {
    updateData.defaultForGarmentTypes = normalizeDefaultForGarmentTypes(body.defaultForGarmentTypes);
  }
  updateData.config = buildConfig(body, setup.config);

  const result = await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).findOneAndUpdate(
    query,
    { $set: updateData },
    { returnDocument: 'after' }
  );
  if (!result) throw apiNotFound('Try-on setup');

  return apiSuccess({ setup: { ...result, _id: result._id?.toString?.() ?? null } });
});
