/**
 * Admin: scan/repair mojibake text (see lib/textRepair.ts).
 *
 * WHAT: Scans partners.name, partners.description, organizations.name,
 *     events.name, and events.partnerName for Windows-1252-decoded-as-UTF-8
 *     mojibake (e.g. "VÃ¡ci" -> "Váci") and, when explicitly confirmed,
 *     repairs it in place.
 * WHY: Partner/event names synced in from messmass (whose own data had this
 *     corruption) never get their name field refreshed by the sync's link
 *     logic once linked -- this fixes camera's own stored copies directly.
 * HOW: Defaults to a dry run (reports what WOULD change, writes nothing).
 *     Pass ?apply=1 to actually write the fixes. repairMojibake() never
 *     guesses -- only returns a value for text that's PROVABLY one layer of
 *     this specific corruption, so it's safe to run repeatedly and safe on
 *     text in any other language/script.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { withErrorHandler, requireAdmin, apiSuccess } from '@/lib/api';
import { repairMojibake } from '@/lib/textRepair';

const CAP_PER_COLLECTION = 5000;

interface Candidate {
  id: string;
  before: string;
  after: string;
}

async function scanCollection(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  collection: string,
  field: string
): Promise<{ candidates: Candidate[]; scanned: number }> {
  const docs = await db
    .collection(collection)
    .find({ [field]: { $type: 'string' } }, { projection: { [field]: 1 } })
    .limit(CAP_PER_COLLECTION)
    .toArray();
  const candidates: Candidate[] = [];
  for (const doc of docs) {
    const before = doc[field] as string;
    const after = repairMojibake(before);
    if (after !== null) {
      candidates.push({ id: String(doc._id), before, after });
    }
  }
  return { candidates, scanned: docs.length };
}

const TARGETS: Array<{ collection: string; field: string }> = [
  { collection: COLLECTIONS.PARTNERS, field: 'name' },
  { collection: COLLECTIONS.PARTNERS, field: 'description' },
  { collection: COLLECTIONS.ORGANIZATIONS, field: 'name' },
  { collection: COLLECTIONS.EVENTS, field: 'name' },
  { collection: COLLECTIONS.EVENTS, field: 'partnerName' },
];

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin();

  const apply = request.nextUrl.searchParams.get('apply') === '1';
  const db = await connectToDatabase();

  const results: Record<string, { scanned: number; candidateCount: number; sample: Candidate[]; applied?: number }> = {};

  for (const target of TARGETS) {
    const { candidates, scanned } = await scanCollection(db, target.collection, target.field);
    const key = `${target.collection}.${target.field}`;
    results[key] = {
      scanned,
      candidateCount: candidates.length,
      sample: candidates.slice(0, 15),
    };

    if (apply && candidates.length > 0) {
      let applied = 0;
      for (const c of candidates) {
        await db.collection(target.collection).updateOne(
          { _id: new ObjectId(c.id) },
          { $set: { [target.field]: c.after } }
        );
        applied++;
      }
      results[key].applied = applied;
    }
  }

  return apiSuccess({
    mode: apply ? 'applied' : 'dry_run',
    note: apply
      ? 'Fixes have been written.'
      : 'No changes written. Re-open this same URL with ?apply=1 to actually fix these.',
    results,
  });
});
