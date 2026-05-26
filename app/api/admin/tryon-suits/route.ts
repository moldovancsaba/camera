import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type LeatherSuit, generateTimestamp } from '@/lib/db/schemas';
import {
  apiBadRequest,
  apiCreated,
  apiSuccess,
  requireAdmin,
  withErrorHandler,
} from '@/lib/api';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const db = await connectToDatabase();
  const suits = await db
    .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
    .find({})
    .sort({ active: -1, name: 1 })
    .toArray();

  return apiSuccess({ suits });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin();

  const body = await request.json();
  const leatherSuitId = normalizeString(body.leatherSuitId);
  const name = normalizeString(body.name);
  const assetKey = normalizeString(body.assetKey);
  const assetRelativePath = normalizeString(body.assetRelativePath);

  if (!leatherSuitId) {
    throw apiBadRequest('leatherSuitId is required');
  }
  if (!name) {
    throw apiBadRequest('name is required');
  }
  if (!assetKey) {
    throw apiBadRequest('assetKey is required');
  }
  if (!assetRelativePath) {
    throw apiBadRequest('assetRelativePath is required');
  }

  const db = await connectToDatabase();
  const now = generateTimestamp();
  const suit: LeatherSuit = {
    leatherSuitId,
    name,
    category: 'motogp_full_body_leather',
    assetKey,
    assetVersion: Number.isFinite(Number(body.assetVersion)) ? Math.max(1, Number(body.assetVersion)) : 1,
    assetRelativePath,
    previewUrl: normalizeString(body.previewUrl) || null,
    sourceImageUrl: normalizeString(body.sourceImageUrl) || null,
    active: body.active !== false,
    metadata: {
      pose: 'front_a_pose',
      notes: normalizeString(body.notes) || null,
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

  const saved = await db
    .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
    .findOne({ leatherSuitId });

  return apiCreated({ suit: saved });
});
