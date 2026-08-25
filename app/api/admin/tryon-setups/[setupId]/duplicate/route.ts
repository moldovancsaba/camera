import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type TryOnSetup } from '@/lib/db/schemas';
import { buildUniqueSetupId } from '@/lib/tryon/setup-resolution';
import { apiBadRequest, apiCreated, apiNotFound, requireAdmin, withErrorHandler } from '@/lib/api';

/**
 * POST /api/admin/tryon-setups/[setupId]/duplicate
 * Copies an existing setup's config into a new document so an operator can
 * tweak a variant without hand-editing the one that's actually in use.
 * The copy is always inactive-as-default (isDefault: false) and rank 0 --
 * a slip of a click here shouldn't silently change which setup jobs resolve to.
 */
export const POST = withErrorHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ setupId: string }> }
) => {
  await requireAdmin();
  const { setupId: rawParam } = await context.params;
  const normalized = typeof rawParam === 'string' ? rawParam.trim() : '';
  if (!normalized) {
    throw apiBadRequest('Setup id is required');
  }

  const db = await connectToDatabase();
  const query = ObjectId.isValid(normalized) ? { _id: new ObjectId(normalized) } : { setupId: normalized };
  const source = await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).findOne(query);
  if (!source) throw apiNotFound('Try-on setup');

  const now = new Date().toISOString();
  const setupId = await buildUniqueSetupId(db, `${source.name} copy`);
  const copy: TryOnSetup = {
    setupId,
    name: `${source.name} (copy)`,
    description: source.description ?? null,
    cameraId: source.cameraId ?? null,
    active: source.active,
    isDefault: false,
    rank: 0,
    config: { ...source.config },
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).insertOne(copy);
  const saved = await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).findOne({ setupId });
  return apiCreated({ setup: { ...saved, _id: saved?._id?.toString?.() ?? null } });
});
