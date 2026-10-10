/**
 * How a share link finds its photo and what the page may say about it (camera#269, docs/PHOTO_VETTING_PLAN.md).
 *
 * A link carries either the database id (every photo made before vetting, and every approved photo still) or the opaque share
 * token of a vetted photo, which is what the guest's email carries. A photo that is waiting or was not approved is reached by its
 * token only: its database id shows nothing, so those pages cannot be found by counting ids.
 *
 * Pure apart from `findShareSubmission`, which takes the database; unit-tested in share-lookup.test.ts.
 */

import { ObjectId, type Db, type Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isPubliclyVisible, visibilityInputOf } from '@/lib/submissions/visibility';

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export interface ShareLookup {
  doc: Document;
  /** True when the link carried the photo's share token, false when it carried the database id. */
  byToken: boolean;
}

/** The query for a share link; null when the link can be neither an id nor a token. */
export function shareLookupFilter(id: string): Document | null {
  const clauses: Document[] = [];
  if (TOKEN.test(id)) clauses.push({ shareToken: id });
  if (ObjectId.isValid(id)) clauses.push({ _id: new ObjectId(id) });
  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

export async function findShareSubmission(db: Db, id: string): Promise<ShareLookup | null> {
  const filter = shareLookupFilter(id);
  if (!filter) return null;
  const doc = await db.collection(COLLECTIONS.SUBMISSIONS).findOne(filter);
  if (!doc) return null;
  return { doc, byToken: typeof doc.shareToken === 'string' && doc.shareToken === id };
}

/**
 * What the page shows:
 * - `visible`: the photo, as before;
 * - `waiting` / `not_approved`: a vetted photo reached by its token that is waiting or was rejected (no photo, no preview image);
 * - `hidden`: nothing, the page is not found (unknown, archived, removed from its events, pending or rejected by database id, a stored try-on
 *   result: never public, issue 557).
 */
export type ShareState = 'visible' | 'waiting' | 'not_approved' | 'hidden';

export function shareStateOf(lookup: ShareLookup | null): ShareState {
  if (!lookup) return 'hidden';
  const { doc, byToken } = lookup;
  if (isPubliclyVisible(visibilityInputOf(doc))) return 'visible';
  if (!byToken || doc.submissionKind === 'tryon_result' || doc.isArchived === true) return 'hidden';
  if (doc.reviewStatus === 'pending_review') return 'waiting';
  if (doc.reviewStatus === 'rejected') return 'not_approved';
  return 'hidden';
}
