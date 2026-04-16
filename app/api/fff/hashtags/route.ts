/**
 * FunFitFan: list distinct "Feel so" tags the signed-in user has used before (for predictive input).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess } from '@/lib/api';
import { FUNFITFAN_PARTNER_ID } from '@/lib/funfitfan/constants';
import { normalizeFeelSoTag } from '@/lib/funfitfan/feel-so-tags';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  const db = await connectToDatabase();

  const subs = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find(
      { userId: session.user.id, partnerId: FUNFITFAN_PARTNER_ID },
      { projection: { metadata: 1, createdAt: 1 } }
    )
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const s of subs) {
    const meta = s.metadata as Record<string, unknown> | undefined;
    const tags = meta?.funfitfanFeelSoTags;
    if (!Array.isArray(tags)) continue;
    for (const t of tags) {
      if (typeof t !== 'string') continue;
      const n = normalizeFeelSoTag(t);
      if (!n) continue;
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(n);
    }
  }

  return apiSuccess({ hashtags: ordered });
});
