import type { Db, Document } from 'mongodb';
import { ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

type MatchFilter = { $and: object[] };

/**
 * FunFitFan “My reel” slideshow (`fff_user_profiles.slideshowId`): one stream of
 * “I DO IT” log submissions + gym selfies for the same user, oldest → newest.
 */
export async function fetchPersonalFffReelRows(
  db: Db,
  userId: string,
  buildMatchFilter: (excludeOids: ObjectId[]) => MatchFilter,
  excludeOids: ObjectId[]
): Promise<Document[]> {
  const base = buildMatchFilter(excludeOids);
  const match: MatchFilter = { $and: [...base.$and, { userId }] };

  const [subs, gymRows] = await Promise.all([
    db.collection(COLLECTIONS.SUBMISSIONS).find(match).toArray(),
    db
      .collection(COLLECTIONS.GYM_WORKOUT_SESSIONS)
      .find({
        userId,
        selfieImageUrl: { $type: 'string', $gt: '' },
      })
      .toArray(),
  ]);

  type Row = { sortAt: number; doc: Document };
  const rows: Row[] = [];

  for (const s of subs) {
    const t = Date.parse(String(s.createdAt));
    rows.push({ sortAt: Number.isFinite(t) ? t : 0, doc: s });
  }

  for (const g of gymRows) {
    const url = typeof g.selfieImageUrl === 'string' ? g.selfieImageUrl.trim() : '';
    if (!url) continue;
    const sessionId = typeof g.sessionId === 'string' ? g.sessionId : '';
    if (!sessionId) continue;
    const iso =
      (typeof g.selfieUploadedAt === 'string' && g.selfieUploadedAt) ||
      (typeof g.completedAt === 'string' && g.completedAt) ||
      (typeof g.startedAt === 'string' && g.startedAt) ||
      '';
    const t = Date.parse(iso);
    const sortAt = Number.isFinite(t) ? t : 0;

    rows.push({
      sortAt,
      doc: {
        _id: `gym:${sessionId}`,
        imageUrl: url,
        finalImageUrl: url,
        playCount: 0,
        metadata: {
          finalWidth: 1080,
          finalHeight: 1920,
          originalWidth: 1080,
          originalHeight: 1920,
        },
        createdAt: iso || new Date(sortAt).toISOString(),
      } as Document,
    });
  }

  rows.sort((a, b) => a.sortAt - b.sortAt);
  return rows.map((r) => r.doc);
}
