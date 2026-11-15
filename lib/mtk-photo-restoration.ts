/**
 * One-photo-at-a-time restoration of the owner-authorized MTK media archive.
 * This runs only inside Camera's server runtime; it never returns image URLs,
 * contacts, or stored image bytes to the browser.
 */

import { createHash, randomUUID } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import { ObjectId, type Db, type Document } from 'mongodb';
import { COLLECTIONS, type ImageCopy } from '@/lib/db/schemas';
import { uploadToImgbbOnly, type MirrorResult } from '@/lib/imgbb/upload';
import { isRenderableImgbbImageUrl } from '@/lib/imgbb/url';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';
import { recordImageCopy } from '@/lib/storage/image-copies';
import { putVerifiedCameraImageR2Copy } from '@/lib/storage/r2';
import { blobStoreHostFromToken } from '@/lib/submissions/original-image';

export const MTK_RESTORATION_EVENT_MONGO_ID = '6ac636415fa8994cb2d3df85';
export const MTK_RESTORATION_EVENT_UUID = 'f2391dfc-f5be-4c01-8ee8-e69034df4fa0';
export const MTK_RESTORATION_EXPECTED_COUNT = 40;
const RECOVERY_STORE = 'camera-mtk-recovery';
const RESTORATION_BATCH = 'mtk-owner-authorized-2026-10-30-v1';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const LEASE_MS = 150_000;
const OWNER_NOTE = 'Owner-directed restoration of this MTK event image from the supplied archive. Participant consent evidence and contact details were not reconstructed.';

type RestoreResult = { status: 'restored' | 'busy' | 'complete'; restored: number; remaining: number; total: number };

function eventMembership(): Document {
  return { $or: [{ eventId: MTK_RESTORATION_EVENT_UUID }, { eventIds: { $in: [MTK_RESTORATION_EVENT_UUID] } }] };
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

async function readPrivateRecovery(pathname: string, storeId: string, expectedHash: string): Promise<Buffer> {
  // @vercel/blob obtains its server-side Vercel OIDC token from the runtime.
  const blob = await get(pathname, { access: 'private', storeId, useCache: false });
  if (!blob || blob.statusCode !== 200) throw new Error('Private archived image is unavailable');
  const bytes = await readLimited(new Response(blob.stream, { headers: { 'content-type': 'image/jpeg' } }));
  if (!validJpeg(bytes) || sha256(bytes) !== expectedHash) throw new Error('Private archived image did not match its stored SHA-256');
  return bytes;
}

function copyOf(row: Document, store: ImageCopy['store']): ImageCopy | null {
  if (!Array.isArray(row.imageCopies)) return null;
  return (row.imageCopies as ImageCopy[]).find((item) => item?.role === 'composed' && item.store === store && item.state === 'verified') ?? null;
}

async function saveCopy(db: Db, rowId: ObjectId, copy: ImageCopy): Promise<void> {
  if (!await recordImageCopy(db, rowId, copy)) throw new Error('Submission disappeared before its verified media copy could be recorded');
}

function storageConfig(): { blobToken: string; publicStoreId: string; privateStoreId: string; recoveryUrlHost: string } {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? '';
  const publicStoreId = process.env.BLOB_STORE_ID?.trim() ?? '';
  const privateStoreId = process.env.CAMERA_MTK_RECOVERY_STORE_ID?.trim() ?? '';
  const recoveryUrlHost = blobStoreHostFromToken(blobToken);
  if (!blobToken || !publicStoreId || !privateStoreId || !recoveryUrlHost) {
    throw new Error('Required Camera Blob and recovery-store credentials are not configured.');
  }
  return { blobToken, publicStoreId, privateStoreId, recoveryUrlHost };
}

async function targetRows(db: Db): Promise<Document[]> {
  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  const membership = eventMembership();
  const [recoveryRows, completedRows] = await Promise.all([
    submissions.find({ $and: [membership, { 'adminRecovery.state': 'available', 'adminRecovery.store': RECOVERY_STORE }, PRIVACY_ERASURE_ACTIVE_FILTER] }, { projection: { _id: 1, adminRecovery: 1, mediaUseAuthorization: 1, reviewHistory: 1, imageCopies: 1, imageUrl: 1, approvedAt: 1, privacyErasure: 1, reviewStatus: 1, isShareVisible: 1, isArchived: 1 } }).limit(MTK_RESTORATION_EXPECTED_COUNT + 1).toArray(),
    submissions.find({ $and: [membership, { 'mediaUseAuthorization.batchId': RESTORATION_BATCH }, PRIVACY_ERASURE_ACTIVE_FILTER] }, { projection: { _id: 1, adminRecovery: 1, mediaUseAuthorization: 1, reviewHistory: 1, imageCopies: 1, imageUrl: 1, approvedAt: 1, privacyErasure: 1, reviewStatus: 1, isShareVisible: 1, isArchived: 1 } }).limit(MTK_RESTORATION_EXPECTED_COUNT + 1).toArray(),
  ]);
  const rows = new Map<string, Document>();
  for (const row of [...recoveryRows, ...completedRows]) rows.set(String(row._id), row);
  if (rows.size !== MTK_RESTORATION_EXPECTED_COUNT) {
    throw new Error(`MTK restore is paused: expected ${MTK_RESTORATION_EXPECTED_COUNT} verified archive matches, found ${rows.size}.`);
  }
  for (const row of rows.values()) {
    const id = String(row._id);
    const recovery = row.adminRecovery as Document | undefined;
    const authorization = row.mediaUseAuthorization as Document | undefined;
    if (row.privacyErasure?.state === 'fenced' || row.privacyErasure?.state === 'record_erased') {
      throw new Error('MTK restore is paused because a target has an active privacy-erasure fence.');
    }
    const digest = typeof recovery?.sha256 === 'string' ? recovery.sha256 : typeof authorization?.sourceSha256 === 'string' ? authorization.sourceSha256 : '';
    const previous = recovery?.originalReviewStatus ?? authorization?.historicalReviewStatus;
    if (!ObjectId.isValid(id) || !/^[a-f0-9]{64}$/.test(digest) || (previous !== 'approved' && previous !== 'rejected')) {
      throw new Error('MTK restore is paused because a target does not match the verified archive manifest.');
    }
    if (recovery && (recovery.state !== 'available' || recovery.store !== RECOVERY_STORE || recovery.pathname !== `camera-admin-recovery/mtk/${id}.jpg`)) {
      throw new Error('MTK restore is paused because a target has an unexpected private archive record.');
    }
    if (authorization && (authorization.batchId !== RESTORATION_BATCH || authorization.eventId !== MTK_RESTORATION_EVENT_UUID || authorization.sourceSha256 !== digest)) {
      throw new Error('MTK restore is paused because a saved owner authorization does not match the verified batch.');
    }
  }
  return [...rows.values()].sort((a, b) => String(a._id).localeCompare(String(b._id)));
}

async function progress(db: Db): Promise<{ restored: number; remaining: number; total: number; complete: boolean }> {
  const rows = await targetRows(db);
  const restored = rows.filter((row) => {
    const authorization = row.mediaUseAuthorization as Document | undefined;
    return authorization?.batchId === RESTORATION_BATCH && row.reviewStatus === 'approved' && row.isShareVisible === true && row.isArchived !== true;
  }).length;
  const remaining = rows.filter((row) => {
    const authorization = row.mediaUseAuthorization as Document | undefined;
    const visible = authorization?.batchId === RESTORATION_BATCH && row.reviewStatus === 'approved' && row.isShareVisible === true && row.isArchived !== true;
    // Completion also requires removing the temporary private recovery copy after normal storage is durable.
    return !visible || Boolean(row.adminRecovery);
  }).length;
  return { restored, remaining, total: MTK_RESTORATION_EXPECTED_COUNT, complete: remaining === 0 };
}

export async function getMtkRestorationProgress(db: Db): Promise<ReturnType<typeof progress> extends Promise<infer T> ? T : never> {
  const events = db.collection(COLLECTIONS.EVENTS);
  const event = await events.findOne({ _id: new ObjectId(MTK_RESTORATION_EVENT_MONGO_ID) }, { projection: { eventId: 1 } });
  if (!event || event.eventId !== MTK_RESTORATION_EVENT_UUID) throw new Error('MTK restore is paused: the event identity does not match the approved batch.');
  return progress(db);
}

async function restorePhoto(db: Db, row: Document, actor: string): Promise<void> {
  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  const { blobToken, publicStoreId, privateStoreId, recoveryUrlHost } = storageConfig();
  const id = row._id as ObjectId;
  const idText = String(id);
  const membership = eventMembership();
  const recovery = row.adminRecovery as Document | undefined;
  const existingAuthorization = row.mediaUseAuthorization as Document | undefined;
  const digest = typeof recovery?.sha256 === 'string' ? recovery.sha256 : typeof existingAuthorization?.sourceSha256 === 'string' ? existingAuthorization.sourceSha256 : '';
  const previousReview = recovery?.originalReviewStatus ?? existingAuthorization?.historicalReviewStatus;
  if (!/^[a-f0-9]{64}$/.test(digest) || (previousReview !== 'approved' && previousReview !== 'rejected')) throw new Error('MTK restore is paused because a target lacks its verified archive manifest.');
  const recoveryPath = typeof recovery?.pathname === 'string' ? recovery.pathname : null;
  if (recoveryPath && recoveryPath !== `camera-admin-recovery/mtk/${idText}.jpg`) throw new Error('MTK restore is paused because a target has an unexpected private archive path.');

  let bytes: Buffer;
  if (recoveryPath) {
    try {
      bytes = await readPrivateRecovery(recoveryPath, privateStoreId, digest);
    } catch (sourceError) {
      const imageUrl = typeof row.imageUrl === 'string' ? row.imageUrl : '';
      let hostname = '';
      try { hostname = new URL(imageUrl).hostname.toLowerCase(); } catch { /* fail below */ }
      if (!existingAuthorization || existingAuthorization.batchId !== RESTORATION_BATCH || hostname !== recoveryUrlHost.toLowerCase()) throw sourceError;
      bytes = await fetchAndVerify(imageUrl, digest);
    }
  } else {
    const imageUrl = typeof row.imageUrl === 'string' ? row.imageUrl : '';
    let hostname = '';
    try { hostname = new URL(imageUrl).hostname.toLowerCase(); } catch { /* fail below */ }
    if (!existingAuthorization || existingAuthorization.batchId !== RESTORATION_BATCH || hostname !== recoveryUrlHost.toLowerCase()) {
      throw new Error('MTK restore is paused because a partially restored image has no trusted Vercel Blob source.');
    }
    bytes = await fetchAndVerify(imageUrl, digest);
  }
  if (!validJpeg(bytes) || sha256(bytes) !== digest) throw new Error('MTK restore source did not match its recorded SHA-256.');

  const composedPath = `camera/composed/${MTK_RESTORATION_EVENT_UUID}/${idText}/${digest}.jpg`;
  const at = new Date().toISOString();
  let blobUrl: string;
  const existingBlob = copyOf(row, 'blob');
  if (existingBlob?.url) {
    try {
      assertBlobHost(existingBlob.url, recoveryUrlHost);
      await fetchAndVerify(existingBlob.url, digest);
      blobUrl = existingBlob.url;
    } catch {
      const uploaded = await put(composedPath, bytes, { access: 'public', storeId: publicStoreId, token: blobToken, contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true });
      assertBlobHost(uploaded.url, recoveryUrlHost);
      await fetchAndVerify(uploaded.url, digest);
      blobUrl = uploaded.url;
    }
  } else {
    const uploaded = await put(composedPath, bytes, { access: 'public', storeId: publicStoreId, token: blobToken, contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true });
    assertBlobHost(uploaded.url, recoveryUrlHost);
    await fetchAndVerify(uploaded.url, digest);
    blobUrl = uploaded.url;
  }
  await saveCopy(db, id, { role: 'composed', store: 'blob', state: 'verified', url: blobUrl, bytes: bytes.byteLength, verifiedAt: at, recordedAt: at });

  await putVerifiedCameraImageR2Copy({ key: composedPath, bytes, sha256: digest });
  await saveCopy(db, id, { role: 'composed', store: 'r2', state: 'verified', url: null, objectKey: composedPath, bytes: bytes.byteLength, verifiedAt: at, recordedAt: at });

  const existingMirror = copyOf(row, 'imgbb');
  let mirror: MirrorResult | null = existingMirror?.url
    ? { imageUrl: existingMirror.url, deleteUrl: existingMirror.deleteUrl ?? '', imageId: existingMirror.externalId ?? '' }
    : null;
  if (mirror?.imageUrl) {
    try {
      if (!isRenderableImgbbImageUrl(mirror.imageUrl)) throw new Error('Stored ImgBB host is invalid');
      await fetchAndVerify(mirror.imageUrl, digest);
    } catch {
      mirror = null;
    }
  }
  if (!mirror) {
    const uploaded = await uploadToImgbbOnly(bytes.toString('base64'), { name: `camera-composed-${idText}`, maxRetries: 2, retryDelay: 1000, validatePublicUrl: false });
    if (!isRenderableImgbbImageUrl(uploaded.imageUrl)) throw new Error('ImgBB returned an invalid image address');
    await fetchAndVerify(uploaded.imageUrl, digest);
    mirror = uploaded;
  }
  await saveCopy(db, id, { role: 'composed', store: 'imgbb', state: 'verified', url: mirror.imageUrl, deleteUrl: mirror.deleteUrl, externalId: mirror.imageId, bytes: bytes.byteLength, verifiedAt: at, recordedAt: at });

  const current = await submissions.findOne({ _id: id, ...membership, ...PRIVACY_ERASURE_ACTIVE_FILTER });
  if (!current) throw new Error('MTK restore stopped because the submission was removed or privacy-fenced.');
  const currentAuthorization = current.mediaUseAuthorization as Document | undefined;
  const authorization = currentAuthorization?.batchId === RESTORATION_BATCH
    ? currentAuthorization
    : {
        version: 1,
        status: 'active',
        source: 'event_owner_instruction',
        batchId: RESTORATION_BATCH,
        authorizationId: authorizationId(idText),
        eventId: MTK_RESTORATION_EVENT_UUID,
        grantedAt: at,
        scopes: ['storage', 'admin_review', 'public_gallery', 'public_share', 'slideshow', 'download'],
        note: OWNER_NOTE,
        sourceSha256: digest,
        historicalReviewStatus: previousReview,
      };
  if (authorization.sourceSha256 !== digest || authorization.eventId !== MTK_RESTORATION_EVENT_UUID) throw new Error('Saved owner authorization does not match the verified MTK image.');

  const reviewHistory = Array.isArray(current.reviewHistory) ? current.reviewHistory as Document[] : [];
  const historyEntry = reviewHistory.some((entry) => entry.action === 'approve' && entry.by === actor && entry.reason === OWNER_NOTE)
    ? null
    : { action: 'approve', by: actor, at, reason: OWNER_NOTE };
  const setFields: Document = {
    imageUrl: blobUrl,
    finalImageUrl: blobUrl,
    previewImageUrl: blobUrl,
    imageCopies: current.imageCopies,
    mediaUseAuthorization: authorization,
    reviewStatus: 'approved',
    approvedAt: current.approvedAt || at,
    approvedBy: actor,
    reviewedAt: at,
    reviewedBy: actor,
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
    { _id: id, ...membership, 'adminRecovery.sha256': digest, ...PRIVACY_ERASURE_ACTIVE_FILTER },
    updateOperation,
  );
  if (!update.modifiedCount) throw new Error('MTK approved state could not be saved; the private recovery copy remains for retry.');

  // Retain the private source until the normal photo record and all three verified backup records are durable.
  if (recoveryPath) await del(recoveryPath, { storeId: privateStoreId });
  await submissions.updateOne(
    { _id: id, ...membership, 'mediaUseAuthorization.batchId': RESTORATION_BATCH, 'mediaUseAuthorization.sourceSha256': digest, ...PRIVACY_ERASURE_ACTIVE_FILTER },
    { $unset: { adminRecovery: '' }, $set: { updatedAt: new Date().toISOString() } },
  );
}

export async function restoreNextMtkPhoto(db: Db, actor: string): Promise<RestoreResult> {
  const events = db.collection(COLLECTIONS.EVENTS);
  const eventFilter = { _id: new ObjectId(MTK_RESTORATION_EVENT_MONGO_ID), eventId: MTK_RESTORATION_EVENT_UUID };
  const before = await progress(db);
  if (before.complete) return { status: 'complete', ...before };

  const leaseId = randomUUID();
  const now = new Date();
  const claim = await events.findOneAndUpdate(
    { $and: [eventFilter, { $or: [{ mtkRestorationLease: { $exists: false } }, { 'mtkRestorationLease.expiresAt': { $lte: now.toISOString() } }] }] },
    { $set: { mtkRestorationLease: { owner: leaseId, expiresAt: new Date(now.getTime() + LEASE_MS).toISOString() } } },
    { returnDocument: 'after' },
  );
  if (!claim) {
    const current = await progress(db);
    return current.complete ? { status: 'complete', ...current } : { status: 'busy', ...current };
  }

  const submissions = db.collection(COLLECTIONS.SUBMISSIONS);
  try {
    const row = await submissions.findOne(
      { $and: [eventMembership(), { 'adminRecovery.state': 'available', 'adminRecovery.store': RECOVERY_STORE }, PRIVACY_ERASURE_ACTIVE_FILTER] },
      { sort: { _id: 1 } },
    );
    if (row) await restorePhoto(db, row, actor);
    const after = await progress(db);
    if (!row && !after.complete) throw new Error('MTK restore is paused because an incomplete target has no retryable private recovery source.');
    return { status: after.complete ? 'complete' : 'restored', ...after };
  } finally {
    await events.updateOne({ ...eventFilter, 'mtkRestorationLease.owner': leaseId }, { $unset: { mtkRestorationLease: '' } });
  }
}
