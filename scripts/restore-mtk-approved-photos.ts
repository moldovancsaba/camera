/**
 * Restore the 40 archive-matched MTK photos into the ordinary approved/gallery flow.
 *
 * Run a read-only preflight first:
 *   npx tsx scripts/restore-mtk-approved-photos.ts --event-mongo-id <id> --env-dir <dir>
 * Apply after the code that understands owner media authorization is deployed:
 *   npx tsx scripts/restore-mtk-approved-photos.ts --event-mongo-id <id> --env-dir <dir> --apply
 *
 * Each framed image is copied and byte-verified in Vercel Blob, private R2, and ImgBB before
 * its submission becomes normally approved/public. Participant contact and consent evidence
 * are not reconstructed. These framed exports are not sent to Fanmass as originals.
 */

import { del, get, put } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { ObjectId, type Document } from 'mongodb';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type ImageCopy } from '@/lib/db/schemas';
import { uploadToImgbbOnly, type MirrorResult } from '@/lib/imgbb/upload';
import { isRenderableImgbbImageUrl } from '@/lib/imgbb/url';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';
import { recordImageCopy } from '@/lib/storage/image-copies';
import { putVerifiedCameraImageR2Copy } from '@/lib/storage/r2';
import { blobStoreHostFromToken } from '@/lib/submissions/original-image';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as typeof import('@next/env');

const EXPECTED_COUNT = 40;
const EXPECTED_EVENT_UUID = 'f2391dfc-f5be-4c01-8ee8-e69034df4fa0';
const RECOVERY_STORE = 'camera-mtk-recovery';
const RESTORATION_BATCH = 'mtk-owner-authorized-2026-10-30-v1';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const OWNER = 'Event owner';
const OWNER_NOTE = 'Owner-directed restoration of this MTK event image from the supplied archive. Participant consent evidence and contact details were not reconstructed.';

function eventMembership(eventUuid: string): Document {
  return { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] };
}

function arg(name: string): string | null {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] ?? null : null;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function authorizationId(id: string): string {
  const suffix = createHash('sha256').update(`camera-owner-media-use:${id.toLowerCase()}`).digest('hex').slice(0, 12);
  return `00000000-0000-4000-8000-${suffix}`;
}

function validJpeg(bytes: Buffer): boolean {
  return bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function readLimited(response: Response): Promise<Buffer> {
  if (!response.ok || !(response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Image read-back failed (HTTP ${response.status})`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Image read-back returned no body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel('Image exceeds supported size').catch(() => undefined);
        throw new Error('Image read-back exceeded supported size');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

async function fetchAndVerify(url: string, expectedHash: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { Accept: 'image/jpeg', 'Cache-Control': 'no-cache' },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  const bytes = await readLimited(response);
  if (!validJpeg(bytes) || sha256(bytes) !== expectedHash) throw new Error('Image provider read-back did not match the archive SHA-256');
  return bytes;
}

function assertBlobHost(url: string, expectedHost: string): void {
  let hostname = '';
  try { hostname = new URL(url).hostname.toLowerCase(); } catch { /* fail below */ }
  if (!hostname || hostname !== expectedHost.toLowerCase()) throw new Error('Vercel Blob returned an unexpected image host');
}

async function readPrivateRecovery(pathname: string, storeId: string, oidcToken: string, expectedHash: string): Promise<Buffer> {
  const blob = await get(pathname, { access: 'private', storeId, oidcToken, useCache: false });
  if (!blob || blob.statusCode !== 200) throw new Error('Private archived image is unavailable');
  const bytes = await readLimited(new Response(blob.stream, { headers: { 'content-type': 'image/jpeg' } }));
  if (!validJpeg(bytes) || sha256(bytes) !== expectedHash) throw new Error('Private archived image did not match its stored SHA-256');
  return bytes;
}

function copyOf(row: Document, store: ImageCopy['store']): ImageCopy | null {
  if (!Array.isArray(row.imageCopies)) return null;
  const copy = (row.imageCopies as ImageCopy[]).find((item) => item?.role === 'composed' && item.store === store && item.state === 'verified');
  return copy ?? null;
}

async function saveCopy(db: Awaited<ReturnType<typeof connectToDatabase>>, rowId: ObjectId, copy: ImageCopy): Promise<void> {
  if (!await recordImageCopy(db, rowId, copy)) throw new Error('Submission disappeared before its verified media copy could be recorded');
}

async function main() {
  const envDir = arg('--env-dir') ?? process.cwd();
  loadEnvConfig(envDir);
  const eventMongoId = arg('--event-mongo-id');
  const apply = process.argv.includes('--apply');
  if (!eventMongoId || !ObjectId.isValid(eventMongoId)) throw new Error('Provide a valid --event-mongo-id.');

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const publicStoreId = process.env.BLOB_STORE_ID?.trim();
  const privateStoreId = process.env.CAMERA_MTK_RECOVERY_STORE_ID?.trim();
  const oidcToken = process.env.VERCEL_OIDC_TOKEN?.trim();
  const recoveryUrlHost = blobStoreHostFromToken(blobToken);
  if (!blobToken || !publicStoreId || !privateStoreId || !oidcToken || !recoveryUrlHost) {
    throw new Error('Required Camera Blob and recovery-store credentials are not configured in the selected environment.');
  }

  const db = await connectToDatabase();
  const events = db.collection(COLLECTIONS.EVENTS);
  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  const event = await events.findOne({ _id: new ObjectId(eventMongoId) }, { projection: { eventId: 1, name: 1 } });
  if (!event || event.eventId !== EXPECTED_EVENT_UUID) throw new Error('The selected event does not match the verified MTK event.');

  const membership = eventMembership(EXPECTED_EVENT_UUID);
  const [recoveryRows, completedRows] = await Promise.all([
    submissions.find({ $and: [membership, { 'adminRecovery.state': 'available', 'adminRecovery.store': RECOVERY_STORE }, PRIVACY_ERASURE_ACTIVE_FILTER] }).toArray(),
    submissions.find({ $and: [membership, { 'mediaUseAuthorization.batchId': RESTORATION_BATCH }, PRIVACY_ERASURE_ACTIVE_FILTER] }).toArray(),
  ]);
  const targets = new Map<string, Document>();
  for (const row of [...recoveryRows, ...completedRows]) targets.set(String(row._id), row);
  if (targets.size !== EXPECTED_COUNT) throw new Error(`Expected ${EXPECTED_COUNT} archive-matched submissions; found ${targets.size}. No changes were made.`);

  const prepared: Array<{ row: Document; bytes: Buffer; digest: string; recoveryPath: string | null; previousReview: 'approved' | 'rejected' }> = [];
  for (const row of targets.values()) {
    const rowId = String(row._id);
    if (!ObjectId.isValid(rowId) || row.privacyErasure?.state === 'fenced' || row.privacyErasure?.state === 'record_erased') {
      throw new Error('A target submission has an active privacy-erasure fence. No changes were made.');
    }
    const existingAuth = row.mediaUseAuthorization as Document | undefined;
    const recovery = row.adminRecovery as Document | undefined;
    const digest = typeof recovery?.sha256 === 'string' ? recovery.sha256 : typeof existingAuth?.sourceSha256 === 'string' ? existingAuth.sourceSha256 : '';
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('A target submission has no valid source SHA-256. No changes were made.');
    const previousReview = recovery?.originalReviewStatus ?? existingAuth?.historicalReviewStatus;
    if (previousReview !== 'approved' && previousReview !== 'rejected') throw new Error('A target submission has no verifiable historical review status. No changes were made.');

    let bytes: Buffer;
    const recoveryPath = typeof recovery?.pathname === 'string' ? recovery.pathname : null;
    if (recoveryPath) {
      if (recoveryPath !== `camera-admin-recovery/mtk/${rowId}.jpg`) throw new Error('A target has an unexpected private archive path. No changes were made.');
      try {
        bytes = await readPrivateRecovery(recoveryPath, privateStoreId, oidcToken, digest);
      } catch (sourceError) {
        const imageUrl = typeof row.imageUrl === 'string' ? row.imageUrl : '';
        let hostname = '';
        try { hostname = new URL(imageUrl).hostname.toLowerCase(); } catch { /* checked below */ }
        if (!existingAuth || existingAuth.batchId !== RESTORATION_BATCH || hostname !== recoveryUrlHost.toLowerCase()) {
          throw sourceError;
        }
        // A prior run may have removed its private source after the public copy was verified.
        bytes = await fetchAndVerify(imageUrl, digest);
      }
    } else {
      const imageUrl = typeof row.imageUrl === 'string' ? row.imageUrl : '';
      let hostname = '';
      try { hostname = new URL(imageUrl).hostname.toLowerCase(); } catch { /* checked below */ }
      if (!existingAuth || existingAuth.batchId !== RESTORATION_BATCH || hostname !== recoveryUrlHost.toLowerCase()) {
        throw new Error('A partially restored submission has no trusted Vercel Blob source. No changes were made.');
      }
      bytes = await fetchAndVerify(imageUrl, digest);
    }
    if (!validJpeg(bytes) || sha256(bytes) !== digest) throw new Error('A target image did not match its recorded source digest. No changes were made.');
    prepared.push({ row, bytes, digest, recoveryPath, previousReview });
  }

  console.log(`${apply ? 'Apply' : 'Dry run'} preflight: ${prepared.length} exact MTK archive matches; ${prepared.filter((item) => item.previousReview === 'approved').length} previously approved and ${prepared.filter((item) => item.previousReview === 'rejected').length} previously rejected. Each image is a framed export; no original selfie or guest contact address is present.`);
  if (!apply) return;

  const grantedAt = new Date().toISOString();
  for (const item of prepared) {
    const row = item.row;
    const id = row._id as ObjectId;
    const idText = String(id);
    const eventId = EXPECTED_EVENT_UUID;
    const composedPath = `camera/composed/${eventId}/${idText}/${item.digest}.jpg`;
    const r2Key = composedPath;
    const at = new Date().toISOString();

    // Vercel Blob is the public primary; do not expose it through a submission until all backups verify.
    let blobUrl: string;
    const existingBlob = copyOf(row, 'blob');
    if (existingBlob?.url) {
      try {
        assertBlobHost(existingBlob.url, recoveryUrlHost);
        await fetchAndVerify(existingBlob.url, item.digest);
        blobUrl = existingBlob.url;
      } catch {
        const uploaded = await put(composedPath, item.bytes, {
          access: 'public', storeId: publicStoreId, token: blobToken,
          contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true,
        });
        assertBlobHost(uploaded.url, recoveryUrlHost);
        await fetchAndVerify(uploaded.url, item.digest);
        blobUrl = uploaded.url;
      }
    } else {
      const uploaded = await put(composedPath, item.bytes, {
        access: 'public', storeId: publicStoreId, token: blobToken,
        contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true,
      });
      assertBlobHost(uploaded.url, recoveryUrlHost);
      await fetchAndVerify(uploaded.url, item.digest);
      blobUrl = uploaded.url;
    }
    await saveCopy(db, id, { role: 'composed', store: 'blob', state: 'verified', url: blobUrl, bytes: item.bytes.byteLength, verifiedAt: at, recordedAt: at });

    await putVerifiedCameraImageR2Copy({ key: r2Key, bytes: item.bytes, sha256: item.digest });
    await saveCopy(db, id, { role: 'composed', store: 'r2', state: 'verified', url: null, objectKey: r2Key, bytes: item.bytes.byteLength, verifiedAt: at, recordedAt: at });

    const existingMirror = copyOf(row, 'imgbb');
    let mirror: MirrorResult | null = existingMirror?.url
      ? { imageUrl: existingMirror.url, deleteUrl: existingMirror.deleteUrl ?? '', imageId: existingMirror.externalId ?? '' }
      : null;
    if (mirror?.imageUrl) {
      try {
        if (!isRenderableImgbbImageUrl(mirror.imageUrl)) throw new Error('Stored ImgBB host is invalid');
        await fetchAndVerify(mirror.imageUrl, item.digest);
      } catch {
        mirror = null;
      }
    }
    if (!mirror) {
      const uploaded: MirrorResult = await uploadToImgbbOnly(item.bytes.toString('base64'), {
        name: `camera-composed-${idText}`,
        maxRetries: 2,
        retryDelay: 1000,
        validatePublicUrl: false,
      });
      if (!isRenderableImgbbImageUrl(uploaded.imageUrl)) throw new Error('ImgBB returned an invalid image address');
      await fetchAndVerify(uploaded.imageUrl, item.digest);
      mirror = uploaded;
    }
    if (!mirror) throw new Error('ImgBB backup was not verified');
    await saveCopy(db, id, { role: 'composed', store: 'imgbb', state: 'verified', url: mirror.imageUrl, deleteUrl: mirror.deleteUrl, externalId: mirror.imageId, bytes: item.bytes.byteLength, verifiedAt: at, recordedAt: at });

    const current = await submissions.findOne({ _id: id, ...membership, ...PRIVACY_ERASURE_ACTIVE_FILTER });
    if (!current) throw new Error('A submission was removed or privacy-fenced before it could be restored.');
    const existingAuthorization = current.mediaUseAuthorization as Document | undefined;
    const authorization = existingAuthorization?.batchId === RESTORATION_BATCH
      ? existingAuthorization
      : {
          version: 1,
          status: 'active',
          source: 'event_owner_instruction',
          batchId: RESTORATION_BATCH,
          authorizationId: authorizationId(idText),
          eventId,
          grantedAt,
          scopes: ['storage', 'admin_review', 'public_gallery', 'public_share', 'slideshow', 'download'],
          note: OWNER_NOTE,
          sourceSha256: item.digest,
          historicalReviewStatus: item.previousReview,
        };
    if (authorization.sourceSha256 !== item.digest || authorization.eventId !== eventId) throw new Error('Existing owner authorization does not match this event photo.');

    const previousHistory = Array.isArray(current.reviewHistory) ? current.reviewHistory as Document[] : [];
    const historyEntry = previousHistory.some((entry) => entry.action === 'approve' && entry.by === OWNER && entry.reason === OWNER_NOTE)
      ? null
      : { action: 'approve', by: OWNER, at, reason: OWNER_NOTE };
    const setFields: Document = {
      imageUrl: blobUrl,
      finalImageUrl: blobUrl,
      previewImageUrl: blobUrl,
      imageCopies: current.imageCopies,
      mediaUseAuthorization: authorization,
      reviewStatus: 'approved',
      approvedAt: current.approvedAt || at,
      approvedBy: OWNER,
      reviewedAt: at,
      reviewedBy: OWNER,
      reviewNotes: OWNER_NOTE,
      isShareVisible: true,
      isSlideshowEligible: true,
      isArchived: false,
      status: 'completed',
      updatedAt: at,
    };
    const updateOperation: Document = { $set: setFields };
    if (historyEntry) updateOperation.$push = { reviewHistory: historyEntry };
    const update = await submissions.updateOne(
      { _id: id, ...membership, 'adminRecovery.sha256': item.digest, ...PRIVACY_ERASURE_ACTIVE_FILTER },
      updateOperation,
    );
    if (!update.modifiedCount && current.mediaUseAuthorization?.batchId !== RESTORATION_BATCH) throw new Error('Submission approval could not be saved; the private source is retained for retry.');

    // Once the public photo and all three verified copies are in normal records, remove the temporary private archive copy.
    if (item.recoveryPath) await del(item.recoveryPath, { storeId: privateStoreId, oidcToken });
    await submissions.updateOne(
      { _id: id, ...membership, 'mediaUseAuthorization.batchId': RESTORATION_BATCH, 'mediaUseAuthorization.sourceSha256': item.digest, ...PRIVACY_ERASURE_ACTIVE_FILTER },
      { $unset: { adminRecovery: '' }, $set: { updatedAt: new Date().toISOString() } },
    );
    console.log(`Restored photo ${idText}: Vercel Blob, R2, ImgBB verified; normal approved state saved.`);
  }

  const [restored, remaining] = await Promise.all([
    submissions.countDocuments({ $and: [membership, { 'mediaUseAuthorization.batchId': RESTORATION_BATCH, reviewStatus: 'approved', 'imageCopies.role': 'composed' }, PRIVACY_ERASURE_ACTIVE_FILTER] }),
    submissions.countDocuments({ $and: [membership, { 'adminRecovery.state': 'available', 'adminRecovery.store': RECOVERY_STORE }, PRIVACY_ERASURE_ACTIVE_FILTER] }),
  ]);
  if (restored !== EXPECTED_COUNT || remaining !== 0) throw new Error(`Post-restore verification failed: ${restored} approved, ${remaining} private archive records remain.`);
  console.log(`Complete: ${restored} normal approved image records; no private recovery records remain. Participant consent and contact fields were not recreated and no emails were sent.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'MTK image restoration failed.');
  process.exitCode = 1;
}).finally(async () => {
  await closeConnection();
});
