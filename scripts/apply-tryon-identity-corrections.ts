import { ObjectId } from 'mongodb';
import { readFileSync } from 'fs';
import { loadEnvFromFiles } from './load-env-from-files';
import { connectToDatabase, closeConnection } from '@/lib/db/mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { isTryOnPlaceholderEmail } from '@/lib/tryon/identity';

type Correction = {
  resultSubmissionId: string;
  userName?: string;
  userEmail?: string;
  reason?: string;
  classificationStatus?: 'reviewed_unrecoverable' | 'manual_corrected';
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readCorrections(): Correction[] {
  const fileArg = process.argv.find((arg) => arg.startsWith('--file='));
  if (!fileArg) throw new Error('Pass --file=corrections.json');
  const path = fileArg.slice('--file='.length);
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('Correction file must be a JSON array');
  return parsed;
}

async function main() {
  loadEnvFromFiles();
  const apply = process.argv.includes('--apply');
  const corrections = readCorrections();
  const db = await connectToDatabase();
  let scanned = 0;
  let patched = 0;
  const skipped: Array<{ resultSubmissionId: string; reason: string }> = [];

  for (const correction of corrections) {
    scanned += 1;
    if (!ObjectId.isValid(correction.resultSubmissionId)) {
      skipped.push({ resultSubmissionId: correction.resultSubmissionId, reason: 'invalid_result_submission_id' });
      continue;
    }
    const userName = typeof correction.userName === 'string' ? correction.userName.trim() : '';
    const userEmail = typeof correction.userEmail === 'string' ? correction.userEmail.trim() : '';
    const classificationStatus = correction.classificationStatus;
    if (!userName && !userEmail && classificationStatus !== 'reviewed_unrecoverable') {
      skipped.push({ resultSubmissionId: correction.resultSubmissionId, reason: 'missing_user_name_or_email' });
      continue;
    }
    if (userEmail && (!EMAIL_PATTERN.test(userEmail) || isTryOnPlaceholderEmail(userEmail))) {
      skipped.push({ resultSubmissionId: correction.resultSubmissionId, reason: 'invalid_or_placeholder_email' });
      continue;
    }
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      updatedAt: now,
    };
    if (classificationStatus === 'reviewed_unrecoverable') {
      patch['metadata.tryOnIdentityClassification'] = {
        status: 'reviewed_unrecoverable',
        reviewedAt: now,
        reviewedBy: 'script:apply-tryon-identity-corrections',
        reason: correction.reason ?? null,
      };
    } else {
      patch['metadata.identityManuallyCorrectedAt'] = now;
      patch['metadata.identityManuallyCorrectedReason'] = correction.reason ?? null;
      patch['metadata.tryOnIdentityClassification'] = {
        status: classificationStatus === 'manual_corrected' ? 'manual_corrected' : 'manual_corrected',
        reviewedAt: now,
        reviewedBy: 'script:apply-tryon-identity-corrections',
        reason: correction.reason ?? null,
      };
      if (userName) patch.userName = userName;
      if (userEmail) patch.userEmail = userEmail;
      if (userName || userEmail) {
        patch.userInfo = {
          ...(userName ? { name: userName } : {}),
          ...(userEmail ? { email: userEmail } : {}),
          collectedAt: now,
        };
      }
    }
    if (apply) {
      const result = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
        { _id: new ObjectId(correction.resultSubmissionId), submissionKind: 'tryon_result' },
        { $set: patch }
      );
      if (result.modifiedCount > 0) patched += 1;
    } else {
      patched += 1;
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', scanned, patchable: patched, skipped }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeConnection();
  });
