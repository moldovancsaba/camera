import { ObjectId, type Db } from 'mongodb';
import { COLLECTIONS, type Event, type LeatherSuit } from '@/lib/db/schemas';

export interface TryOnSuitOption {
  id: string;
  name: string;
  description?: string | null;
  previewUrl?: string | null;
  garmentType: LeatherSuit['garmentType'];
  sleeveStyle?: LeatherSuit['sleeveStyle'];
}

export interface LeatherSuitSeed {
  leatherSuitId: string;
  name: string;
  description?: string | null;
  garmentType: LeatherSuit['garmentType'];
  sleeveStyle?: LeatherSuit['sleeveStyle'];
  assetKey: string;
  assetVersion?: number;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  deleteUrl?: string | null;
  imageId?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  assetRelativePath?: string | null;
  previewUrl?: string | null;
  sourceImageUrl?: string | null;
  active?: boolean;
  metadata?: LeatherSuit['metadata'];
}

export function getLeatherSuitPreviewUrl(suit: Pick<LeatherSuit, 'thumbnailUrl' | 'previewUrl' | 'imageUrl' | 'sourceImageUrl'>): string | null {
  if (typeof suit.thumbnailUrl === 'string' && suit.thumbnailUrl.trim()) return suit.thumbnailUrl;
  if (typeof suit.previewUrl === 'string' && suit.previewUrl.trim()) return suit.previewUrl;
  if (typeof suit.imageUrl === 'string' && suit.imageUrl.trim()) return suit.imageUrl;
  if (typeof suit.sourceImageUrl === 'string' && suit.sourceImageUrl.trim()) return suit.sourceImageUrl;
  return null;
}

export function getLeatherSuitProcessingUrl(suit: Pick<LeatherSuit, 'sourceImageUrl' | 'imageUrl' | 'previewUrl'>): string | null {
  if (typeof suit.sourceImageUrl === 'string' && suit.sourceImageUrl.trim()) return suit.sourceImageUrl;
  if (typeof suit.imageUrl === 'string' && suit.imageUrl.trim()) return suit.imageUrl;
  if (typeof suit.previewUrl === 'string' && suit.previewUrl.trim()) return suit.previewUrl;
  return null;
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
      garmentType: 1,
      sleeveStyle: 1,
    })
    .toArray();

  return suits.flatMap((suit) =>
    typeof suit.leatherSuitId === 'string' && typeof suit.name === 'string'
      ? [
          {
            id: suit.leatherSuitId,
            name: suit.name,
            description: typeof suit.description === 'string' ? suit.description : suit.metadata?.notes || null,
            previewUrl: getLeatherSuitPreviewUrl(suit),
            // Existing records predate this field - fall back to the
            // system's original (and, until now, only) product.
            garmentType: suit.garmentType || 'motorsport_suit',
            sleeveStyle: suit.sleeveStyle ?? null,
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
      garmentType: 1,
      sleeveStyle: 1,
    })
    .toArray();

  return suits.flatMap((suit) =>
    typeof suit.leatherSuitId === 'string' && typeof suit.name === 'string'
      ? [
          {
            id: suit.leatherSuitId,
            name: suit.name,
            description: typeof suit.description === 'string' ? suit.description : suit.metadata?.notes || null,
            previewUrl: getLeatherSuitPreviewUrl(suit),
            // Existing records predate this field - fall back to the
            // system's original (and, until now, only) product.
            garmentType: suit.garmentType || 'motorsport_suit',
            sleeveStyle: suit.sleeveStyle ?? null,
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
          description: seed.description ?? seed.metadata?.notes ?? null,
          garmentType: seed.garmentType,
          sleeveStyle: seed.sleeveStyle ?? null,
          assetKey: seed.assetKey,
          assetVersion: seed.assetVersion ?? 1,
          imageUrl: seed.imageUrl ?? seed.sourceImageUrl ?? seed.previewUrl ?? null,
          thumbnailUrl: seed.thumbnailUrl ?? seed.previewUrl ?? seed.imageUrl ?? seed.sourceImageUrl ?? null,
          deleteUrl: seed.deleteUrl ?? null,
          imageId: seed.imageId ?? null,
          fileSize: seed.fileSize ?? null,
          mimeType: seed.mimeType ?? null,
          assetRelativePath: seed.assetRelativePath ?? null,
          previewUrl: seed.previewUrl ?? seed.thumbnailUrl ?? seed.imageUrl ?? seed.sourceImageUrl ?? null,
          sourceImageUrl: seed.sourceImageUrl ?? seed.imageUrl ?? seed.previewUrl ?? null,
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
