import { ObjectId, type Db } from 'mongodb';
import { COLLECTIONS, type Event, type LeatherSuit } from '@/lib/db/schemas';

export interface TryOnSuitOption {
  id: string;
  name: string;
  previewUrl?: string | null;
  category: LeatherSuit['category'];
}

export interface LeatherSuitSeed {
  leatherSuitId: string;
  name: string;
  category: LeatherSuit['category'];
  assetKey: string;
  assetVersion?: number;
  assetRelativePath?: string | null;
  previewUrl?: string | null;
  sourceImageUrl?: string | null;
  active?: boolean;
  metadata?: LeatherSuit['metadata'];
}

export async function listActiveTryOnSuitOptions(db: Db): Promise<TryOnSuitOption[]> {
  const suits = await db
    .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
    .find({ active: true })
    .sort({ name: 1 })
    .project({
      leatherSuitId: 1,
      name: 1,
      previewUrl: 1,
      category: 1,
    })
    .toArray();

  return suits.flatMap((suit) =>
    typeof suit.leatherSuitId === 'string' && typeof suit.name === 'string'
      ? [
          {
            id: suit.leatherSuitId,
            name: suit.name,
            previewUrl: typeof suit.previewUrl === 'string' ? suit.previewUrl : null,
            category: suit.category,
          },
        ]
      : []
  );
}

export async function listActiveTryOnSuitOptionsForEvent(
  db: Db,
  eventMongoId: string
): Promise<TryOnSuitOption[]> {
  if (!ObjectId.isValid(eventMongoId)) {
    return [];
  }

  const event = await db
    .collection<Event>(COLLECTIONS.EVENTS)
    .findOne(
      { _id: new ObjectId(eventMongoId) },
      { projection: { tryOn: 1 } }
    );

  if (!event?.tryOn?.enabled) {
    return [];
  }

  const allowedSuitIds =
    Array.isArray(event.tryOn.allowedLeatherSuitIds) &&
    event.tryOn.allowedLeatherSuitIds.length > 0
      ? event.tryOn.allowedLeatherSuitIds
      : null;

  const suits = await db
    .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
    .find({
      active: true,
      ...(allowedSuitIds ? { leatherSuitId: { $in: allowedSuitIds } } : {}),
    })
    .sort({ name: 1 })
    .project({
      leatherSuitId: 1,
      name: 1,
      previewUrl: 1,
      category: 1,
    })
    .toArray();

  return suits.flatMap((suit) =>
    typeof suit.leatherSuitId === 'string' && typeof suit.name === 'string'
      ? [
          {
            id: suit.leatherSuitId,
            name: suit.name,
            previewUrl: typeof suit.previewUrl === 'string' ? suit.previewUrl : null,
            category: suit.category,
          },
        ]
      : []
  );
}

export async function getActiveLeatherSuitById(
  db: Db,
  leatherSuitId: string
): Promise<LeatherSuit | null> {
  return db
    .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
    .findOne({ leatherSuitId, active: true });
}

export async function assertValidLeatherSuitId(
  db: Db,
  leatherSuitId: string
): Promise<LeatherSuit> {
  const normalized = leatherSuitId.trim();
  if (!normalized) {
    throw new Error('invalid_leather_suit_id');
  }

  const suit = await getActiveLeatherSuitById(db, normalized);
  if (!suit) {
    throw new Error('invalid_leather_suit_id');
  }

  return suit;
}

export async function upsertLeatherSuitsFromSeed(
  db: Db,
  seeds: LeatherSuitSeed[]
): Promise<number> {
  if (!Array.isArray(seeds) || seeds.length === 0) {
    return 0;
  }

  const now = new Date().toISOString();
  for (const seed of seeds) {
    await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).updateOne(
      { leatherSuitId: seed.leatherSuitId },
      {
        $set: {
          name: seed.name,
          category: seed.category,
          assetKey: seed.assetKey,
          assetVersion: seed.assetVersion ?? 1,
          assetRelativePath: seed.assetRelativePath ?? null,
          previewUrl: seed.previewUrl ?? null,
          sourceImageUrl: seed.sourceImageUrl ?? null,
          active: seed.active !== false,
          metadata: seed.metadata ?? {},
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  return seeds.length;
}
