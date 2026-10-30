/**
 * Restore only archive-confirmed MTK photos for read-only display in existing manager decision/gallery views.
 *
 * Dry run:
 *   npx tsx scripts/restore-mtk-erased-photos.ts --event-mongo-id <id> --manifest <path>
 * Apply:
 *   npx tsx scripts/restore-mtk-erased-photos.ts --event-mongo-id <id> --manifest <path> --apply
 *
 * The manifest and images stay outside git. This script never changes consent, retention, review,
 * publication, guest-contact, e-mail, or Fanmass fields. It uploads one image at a time, verifies the
 * private Blob bytes against SHA-256, then atomically records the recovery pathname on that row.
 */

import { del, get, put } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ObjectId, type Document } from 'mongodb';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd());

const EXPECTED_COUNT = 40;
const EXPECTED_EVENT_UUID = 'f2391dfc-f5be-4c01-8ee8-e69034df4fa0';
const SOURCE_ARCHIVE = 'event-mtk-budapest-x-vasas-fc-images-2026-10-17.zip';
const RECOVERY_STORE = 'camera-mtk-recovery';
const RECOVERY_PATH_PREFIX = 'camera-admin-recovery/mtk';

interface ManifestEntry {
  mongoId: string;
  submissionId: string;
  imagePath: string;
  sourceFileName: string;
  sha256: string;
  originalReviewStatus: 'approved' | 'rejected';
}

function argument(name: string): string | null {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] ?? null : null;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function eventMembership(eventUuid: string): Document {
  return { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] };
}

async function streamBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

async function main() {
  const eventMongoId = argument('--event-mongo-id');
  const manifestPath = argument('--manifest');
  const apply = process.argv.includes('--apply');
  if (!eventMongoId || !ObjectId.isValid(eventMongoId) || !manifestPath) {
    throw new Error('Provide a valid --event-mongo-id and --manifest path.');
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ManifestEntry[];
  if (!Array.isArray(manifest) || manifest.length !== EXPECTED_COUNT) throw new Error(`Expected exactly ${EXPECTED_COUNT} confirmed archive matches.`);
  if (new Set(manifest.map((entry) => entry.mongoId)).size !== EXPECTED_COUNT || new Set(manifest.map((entry) => entry.submissionId)).size !== EXPECTED_COUNT) throw new Error('The manifest contains duplicate submission ids.');

  const db = await connectToDatabase();
  const events = db.collection(COLLECTIONS.EVENTS);
  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  const event = await events.findOne({ _id: new ObjectId(eventMongoId) }, { projection: { eventId: 1 } });
  if (!event || event.eventId !== EXPECTED_EVENT_UUID) throw new Error('The selected event does not match the verified MTK event.');

  const storeId = process.env.CAMERA_MTK_RECOVERY_STORE_ID?.trim();
  const oidcToken = process.env.VERCEL_OIDC_TOKEN?.trim();
  if (apply && (!storeId || !oidcToken)) throw new Error('The private recovery store OIDC connection is missing.');

  const rows: Array<{ entry: ManifestEntry; bytes: Buffer; alreadyRestored: boolean }> = [];
  for (const entry of manifest) {
    if (!ObjectId.isValid(entry.mongoId) || !/^submission_\d+$/.test(entry.submissionId) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !['approved', 'rejected'].includes(entry.originalReviewStatus)) {
      throw new Error('The recovery manifest has an invalid record.');
    }
    const bytes = await readFile(entry.imagePath);
    if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || sha256(bytes) !== entry.sha256) {
      throw new Error('A recovery source image is empty, not a JPEG, oversized, or does not match its recorded hash.');
    }
    const row = await submissions.findOne({
      $and: [
        { _id: new ObjectId(entry.mongoId), submissionId: entry.submissionId, ...eventMembership(EXPECTED_EVENT_UUID) },
        { consentStatus: 'expired', retentionStatus: 'erased', reviewStatus: entry.originalReviewStatus },
        PRIVACY_ERASURE_ACTIVE_FILTER,
      ],
    });
    if (!row) throw new Error('A manifest photo no longer matches the verified erased MTK record.');
    if (Array.isArray(row.consents) && row.consents.length > 0) throw new Error('A recovered record unexpectedly contains consent evidence; no data was changed.');

    const current = row.adminRecovery as Document | undefined;
    if (current) {
      if (current.state !== 'available' || current.store !== RECOVERY_STORE || current.sha256 !== entry.sha256 || current.pathname !== `${RECOVERY_PATH_PREFIX}/${entry.mongoId}.jpg`) {
        throw new Error('An existing recovery copy does not match the verified archive; no data was changed.');
      }
      rows.push({ entry, bytes, alreadyRestored: true });
    } else {
      rows.push({ entry, bytes, alreadyRestored: false });
    }
  }

  console.log(`${apply ? 'Apply' : 'Dry run'} validated: ${rows.length} exact archive matches; ${rows.filter((row) => row.alreadyRestored).length} already recovered.`);
  if (!apply) return;

  for (const { entry, bytes, alreadyRestored } of rows) {
    if (alreadyRestored) continue;
    const pathname = `${RECOVERY_PATH_PREFIX}/${entry.mongoId}.jpg`;
    const uploaded = await put(pathname, bytes, {
      access: 'private',
      storeId,
      contentType: 'image/jpeg',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    const stored = await get(uploaded.pathname, { access: 'private', storeId });
    if (!stored || stored.statusCode !== 200 || sha256(await streamBuffer(stored.stream)) !== entry.sha256) {
      await del(uploaded.pathname, { storeId }).catch(() => undefined);
      throw new Error('Private storage verification failed; no recovery record was activated.');
    }

    const recoveredAt = new Date().toISOString();
    const update = await submissions.updateOne({
      $and: [
        { _id: new ObjectId(entry.mongoId), submissionId: entry.submissionId, ...eventMembership(EXPECTED_EVENT_UUID), 'adminRecovery': { $exists: false } },
        { consentStatus: 'expired', retentionStatus: 'erased', reviewStatus: entry.originalReviewStatus },
        PRIVACY_ERASURE_ACTIVE_FILTER,
      ],
    }, {
      $set: {
        adminRecovery: {
          state: 'available',
          store: RECOVERY_STORE,
          pathname,
          sourceArchive: SOURCE_ARCHIVE,
          sourceFileName: entry.sourceFileName,
          sha256: entry.sha256,
          recoveredAt,
          originalReviewStatus: entry.originalReviewStatus,
        },
      },
    });
    if (update.modifiedCount !== 1) {
      await del(uploaded.pathname, { storeId }).catch(() => undefined);
      throw new Error('A photo changed during recovery; its private upload was removed and the manifest must be rechecked.');
    }
  }

  const recoveredCount = await submissions.countDocuments({
    $and: [
      eventMembership(EXPECTED_EVENT_UUID),
      { consentStatus: 'expired', retentionStatus: 'erased', 'adminRecovery.state': 'available', 'adminRecovery.store': RECOVERY_STORE },
      PRIVACY_ERASURE_ACTIVE_FILTER,
    ],
  });
  if (recoveredCount !== EXPECTED_COUNT) throw new Error(`Post-recovery count mismatch: expected ${EXPECTED_COUNT}, found ${recoveredCount}.`);
  console.log(`Recovery complete: ${recoveredCount} manager-only copies verified in the private recovery store.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Recovery failed.');
  process.exitCode = 1;
}).finally(async () => {
  await closeConnection();
});
