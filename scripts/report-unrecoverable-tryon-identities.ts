import { ObjectId } from 'mongodb';
import { loadEnvFromFiles } from './load-env-from-files';
import { connectToDatabase, closeConnection } from '@/lib/db/mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { getTryOnIdentityClassification, isTryOnPlaceholderEmail } from '@/lib/tryon/identity';

type ReportRow = {
  resultSubmissionId: string;
  eventName: string | null;
  createdAt: string;
  sourceJobId: string | null;
  sourceSubmissionId: string | null;
  resultImageUrl: string | null;
  sourceImageUrl: string | null;
  currentUserName: string | null;
  currentUserEmail: string | null;
  sourceUserName: string | null;
  sourceUserEmail: string | null;
  classification: 'source_identity_available' | 'unrecoverable_guest_identity';
  persistedClassificationStatus: string | null;
};

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function readName(submission: Submission | null | undefined): string | null {
  const value = submission?.userInfo?.name ?? submission?.userName ?? null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized !== 'Guest' && normalized !== 'Event Guest' ? normalized : null;
}

function readEmail(submission: Submission | null | undefined): string | null {
  const value = submission?.userInfo?.email ?? submission?.userEmail ?? null;
  return !isTryOnPlaceholderEmail(value) ? value!.trim() : null;
}

function hasGuestIdentity(submission: Submission): boolean {
  const name = readName(submission);
  const email = readEmail(submission);
  return !email || !name;
}

async function main() {
  loadEnvFromFiles();
  const csv = process.argv.includes('--csv');
  const db = await connectToDatabase();
  const docs = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .find({ submissionKind: 'tryon_result' })
    .sort({ createdAt: 1 })
    .toArray();
  const candidates = docs.filter(hasGuestIdentity);
  const sourceIds = candidates
    .map((doc) => doc.sourceSubmissionId)
    .filter((value): value is string => typeof value === 'string' && ObjectId.isValid(value))
    .map((value) => new ObjectId(value));
  const sourceDocs = sourceIds.length
    ? await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).find({ _id: { $in: sourceIds } }).toArray()
    : [];
  const sourceMap = new Map(sourceDocs.map((doc) => [doc._id?.toString() ?? '', doc]));
  const rows: ReportRow[] = candidates.map((doc) => {
    const source = doc.sourceSubmissionId ? sourceMap.get(doc.sourceSubmissionId) : null;
    const sourceName = readName(source);
    const sourceEmail = readEmail(source);
    return {
      resultSubmissionId: doc._id?.toString() ?? '',
      eventName: doc.eventName ?? null,
      createdAt: doc.createdAt,
      sourceJobId: doc.sourceJobId ?? null,
      sourceSubmissionId: doc.sourceSubmissionId ?? null,
      resultImageUrl: doc.imageUrl ?? doc.finalImageUrl ?? null,
      sourceImageUrl: source?.imageUrl ?? source?.finalImageUrl ?? null,
      currentUserName: readName(doc),
      currentUserEmail: readEmail(doc),
      sourceUserName: sourceName,
      sourceUserEmail: sourceEmail,
      classification: sourceName || sourceEmail ? 'source_identity_available' : 'unrecoverable_guest_identity',
      persistedClassificationStatus: getTryOnIdentityClassification(doc)?.status ?? null,
    };
  });

  if (csv) {
    const headers = Object.keys(rows[0] ?? {
      resultSubmissionId: '',
      eventName: '',
      createdAt: '',
      sourceJobId: '',
      sourceSubmissionId: '',
      resultImageUrl: '',
      sourceImageUrl: '',
      currentUserName: '',
      currentUserEmail: '',
      sourceUserName: '',
      sourceUserEmail: '',
      classification: '',
    });
    console.log(headers.join(','));
    for (const row of rows) {
      console.log(headers.map((key) => csvEscape(row[key as keyof ReportRow])).join(','));
    }
  } else {
    console.log(JSON.stringify({
      scanned: docs.length,
      rows: rows.length,
      sourceRecoverable: rows.filter((row) => row.classification === 'source_identity_available').length,
      unrecoverable: rows.filter((row) => row.classification === 'unrecoverable_guest_identity').length,
      results: rows,
    }, null, 2));
  }

}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeConnection();
  });
