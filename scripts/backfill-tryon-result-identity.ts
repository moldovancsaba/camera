import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isTryOnPlaceholderEmail, resolveTryOnSubmissionIdentity } from '@/lib/tryon/identity';

const apply = process.argv.includes('--apply');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number.parseInt(limitArg.split('=')[1] ?? '', 10) || 0) : 0;

function needsIdentityPatch(doc: Submission, identity: ReturnType<typeof resolveTryOnSubmissionIdentity>): boolean {
  return (
    doc.userName !== identity.name ||
    doc.userEmail !== (identity.email ?? '') ||
    isTryOnPlaceholderEmail(doc.userEmail) ||
    (identity.userInfo ? JSON.stringify(doc.userInfo ?? null) !== JSON.stringify(identity.userInfo) : false)
  );
}

async function main() {
  const db = await connectToDatabase();
  const cursor = db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .find({ submissionKind: 'tryon_result' })
    .sort({ createdAt: 1 });
  const docs = limit > 0 ? await cursor.limit(limit).toArray() : await cursor.toArray();
  const sourceIds = docs
    .map((doc) => doc.sourceSubmissionId)
    .filter((value): value is string => typeof value === 'string' && ObjectId.isValid(value))
    .map((value) => new ObjectId(value));
  const sourceDocs = sourceIds.length > 0
    ? await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).find({ _id: { $in: sourceIds } }).toArray()
    : [];
  const sourceMap = new Map(sourceDocs.map((doc) => [doc._id?.toString() ?? '', doc]));

  let scanned = 0;
  let patched = 0;
  for (const doc of docs) {
    scanned += 1;
    const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) : null;
    const identity = resolveTryOnSubmissionIdentity(doc, source);
    if (!needsIdentityPatch(doc, identity)) continue;
    patched += 1;

    const patch: Record<string, unknown> = {
      userName: identity.name,
      userEmail: identity.email ?? '',
      updatedAt: new Date().toISOString(),
    };
    if (identity.userInfo) {
      patch.userInfo = identity.userInfo;
    }

    if (apply && doc._id) {
      await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne({ _id: doc._id }, { $set: patch });
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', scanned, patched }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
