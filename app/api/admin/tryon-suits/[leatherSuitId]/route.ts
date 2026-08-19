import { NextRequest } from 'next/server';
import { ObjectId, type Document, type UpdateFilter } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type GarmentType, type LeatherSuit, type SleeveStyle } from '@/lib/db/schemas';
import {
  apiBadRequest,
  apiNoContent,
  apiNotFound,
  apiSuccess,
  requireAdmin,
  withErrorHandler,
} from '@/lib/api';

interface RouteContext {
  params: Promise<{ leatherSuitId: string }>;
}

const GARMENT_TYPES: GarmentType[] = ['motorsport_suit', 'jersey', 'top', 'bottom'];
const SLEEVE_STYLES: SleeveStyle[] = ['sleeveless', 'short_sleeve', 'long_sleeve'];

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function findSuitByParam(db: Awaited<ReturnType<typeof connectToDatabase>>, rawParam: string) {
  const normalized = normalizeString(rawParam);
  if (!normalized) {
    throw apiBadRequest('Leather suit id is required');
  }

  const query = ObjectId.isValid(normalized)
    ? { _id: new ObjectId(normalized) }
    : { leatherSuitId: normalized };

  const suit = await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).findOne(query);
  return { normalized, suit, query };
}

export const GET = withErrorHandler(async (_request: NextRequest, context: RouteContext) => {
  await requireAdmin();
  const { leatherSuitId } = await context.params;
  const db = await connectToDatabase();
  const { suit } = await findSuitByParam(db, leatherSuitId);

  if (!suit) {
    throw apiNotFound('Leather suit');
  }

  return apiSuccess({
    suit: {
      ...suit,
      _id: suit._id?.toString?.() ?? null,
    },
  });
});

export const PUT = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  await requireAdmin();
  const { leatherSuitId } = await context.params;
  const db = await connectToDatabase();
  const { suit, query } = await findSuitByParam(db, leatherSuitId);

  if (!suit) {
    throw apiNotFound('Leather suit');
  }

  const body = await request.json();
  const updateData: Partial<LeatherSuit> & { updatedAt: string } = {
    updatedAt: new Date().toISOString(),
  };

  if (body.name !== undefined) updateData.name = normalizeString(body.name);
  if (body.description !== undefined) {
    const description = normalizeString(body.description) || null;
    updateData.description = description;
    updateData.metadata = {
      pose: 'front_a_pose',
      notes: description,
    };
  }
  if (body.assetVersion !== undefined) {
    const parsed = Number(body.assetVersion);
    updateData.assetVersion = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
  }
  if (body.active !== undefined) updateData.active = Boolean(body.active);
  if (body.garmentType !== undefined && (GARMENT_TYPES as string[]).includes(body.garmentType)) {
    updateData.garmentType = body.garmentType;
  }
  if (body.sleeveStyle !== undefined) {
    updateData.sleeveStyle = (SLEEVE_STYLES as string[]).includes(body.sleeveStyle) ? body.sleeveStyle : null;
  }

  const result = await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).findOneAndUpdate(
    query,
    { $set: updateData },
    { returnDocument: 'after' }
  );

  if (!result) {
    throw apiNotFound('Leather suit');
  }

  return apiSuccess({
    suit: {
      ...result,
      _id: result._id?.toString?.() ?? null,
    },
  });
});

export const DELETE = withErrorHandler(async (_request: NextRequest, context: RouteContext) => {
  await requireAdmin();
  const { leatherSuitId } = await context.params;
  const db = await connectToDatabase();
  const { suit, query } = await findSuitByParam(db, leatherSuitId);

  if (!suit) {
    throw apiNotFound('Leather suit');
  }

  await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).deleteOne(query);

  await db.collection(COLLECTIONS.EVENTS).updateMany(
    { 'tryOn.allowedLeatherSuitIds': suit.leatherSuitId },
    {
      $pull: {
        'tryOn.allowedLeatherSuitIds': suit.leatherSuitId,
      },
    } as unknown as UpdateFilter<Document>
  );

  return apiNoContent();
});
