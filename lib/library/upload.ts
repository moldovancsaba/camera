/**
 * An upload into a library (camera#361): the file checks every kind shares, the file store, and the item with its owner written on it: one partner,
 * one event, or the global library (images, `POST /api/images`). What differs per kind (accepted files, size, stored shape) is an `Uploader` in
 * `uploaders/`, registered below: frames, logos and images.
 */

import type { Db, Document } from 'mongodb';
import { generateTimestamp } from '@/lib/db/schemas';
import { uploadImage } from '@/lib/imgbb/upload';
import { KIND_META, type LibraryKind } from './kinds';
import { framesUploader } from './uploaders/frames';
import { imagesUploader } from './uploaders/images';
import { logosUploader } from './uploaders/logos';
import type { Uploader } from './uploaders/types';
import { parseMessageArea, type MessageArea } from '@/lib/frame/message-area';

/** The kinds that can be uploaded here. A kind adds its uploader to this object. */
const UPLOADERS: Partial<Record<LibraryKind, Uploader>> = {
  frames: framesUploader,
  logos: logosUploader,
  images: imagesUploader,
};

export const UPLOAD_KINDS = Object.keys(UPLOADERS) as LibraryKind[];

/** The accepted files of a kind, for the upload form: an accept list and the words. */
export function uploadFileTypes(kind: LibraryKind): { accept: string; words: string } | null {
  const uploader = UPLOADERS[kind];
  return uploader ? { accept: uploader.fileTypes.join(','), words: uploader.fileTypeWords } : null;
}

const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;

export type Owner =
  | { scope: 'global' }
  | { scope: 'partner'; partnerId: string }
  | { scope: 'event'; /** the event UUID (`Event.eventId`) */ eventId: string; partnerId: string | null };

export interface UploadInput {
  kind: LibraryKind;
  file: unknown;
  name: unknown;
  description?: unknown;
  category?: unknown;
  isActive?: boolean;
  createdBy: string;
  owner: Owner;
  /** What the item is for (`lib/library/sample-selfie.ts`), images only. */
  tags?: string[];
  /** Optional event-frame message area, validated before the image is stored. */
  messageArea?: unknown;
}

export type UploadResult = { ok: true; item: Document } | { ok: false; status: 400; reason: string };

/** The fields of the upload that do not need the network: checked first, so a bad request never reaches the file store. */
export function checkUpload(input: Pick<UploadInput, 'kind' | 'file' | 'name' | 'description' | 'messageArea'>): { ok: true; name: string; description: string; messageArea?: MessageArea } | { ok: false; reason: string } {
  const uploader = UPLOADERS[input.kind];
  if (!uploader) return { ok: false, reason: `Uploading ${KIND_META[input.kind].noun}s here is not available yet.` };
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, reason: 'A name is required.' };
  if (name.length > MAX_NAME) return { ok: false, reason: `The name can have ${MAX_NAME} characters at most.` };
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > MAX_DESCRIPTION) return { ok: false, reason: `The description can have ${MAX_DESCRIPTION} characters at most.` };
  let messageArea: MessageArea | undefined;
  if (input.messageArea !== undefined) {
    if (input.kind !== 'frames') return { ok: false, reason: 'Only a frame can carry an event message.' };
    const parsedArea = parseMessageArea(input.messageArea);
    if (!parsedArea) return { ok: false, reason: 'The message area must fit inside a 1920 x 1080 frame.' };
    messageArea = parsedArea;
  }
  const file = input.file as { type?: unknown; size?: unknown } | null;
  if (!(typeof File !== 'undefined' && input.file instanceof File) || typeof file?.type !== 'string') return { ok: false, reason: 'Choose a file to upload.' };
  if (!uploader.fileTypes.includes(file.type)) return { ok: false, reason: `Only ${uploader.fileTypeWords} files are allowed.` };
  if (typeof file.size === 'number' && file.size === 0) return { ok: false, reason: 'The file is empty.' };
  if (uploader.maxBytes && typeof file.size === 'number' && file.size > uploader.maxBytes) return { ok: false, reason: `The file is too big: ${Math.round(uploader.maxBytes / 1048576)} MB at most.` };
  return { ok: true, name, description, ...(messageArea ? { messageArea } : {}) };
}

/** The owner written on the item. */
function ownerFields(owner: Owner): Record<string, string> {
  if (owner.scope === 'global') return { scope: 'global' };
  return owner.scope === 'partner'
    ? { scope: 'partner', partnerId: owner.partnerId }
    : { scope: 'event', eventId: owner.eventId, ...(owner.partnerId ? { partnerId: owner.partnerId } : {}) };
}

/** Stores the file and the item. */
export async function createLibraryItem(db: Db, input: UploadInput): Promise<UploadResult> {
  const checked = checkUpload(input);
  if (!checked.ok) return { ok: false, status: 400, reason: checked.reason };
  const uploader = UPLOADERS[input.kind] as Uploader;
  const file = input.file as File;

  const stored = await uploadImage(file, { name: `${uploader.storeName}-${Date.now()}` });
  const item = await uploader.document(
    { imageUrl: stored.imageUrl, thumbnailUrl: stored.thumbnailUrl, deleteUrl: stored.deleteUrl, imageId: stored.imageId, fileSize: stored.fileSize, mimeType: stored.mimeType },
    {
      name: checked.name,
      description: checked.description,
      category: typeof input.category === 'string' && input.category.trim() ? input.category.trim() : 'general',
      isActive: input.isActive !== false,
      createdBy: input.createdBy,
      now: generateTimestamp(),
      owner: ownerFields(input.owner),
      ...(input.kind === 'images' && input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
      ...(checked.messageArea ? { messageArea: checked.messageArea } : {}),
    },
    file
  );
  // Sharing is an explicit parent decision. Keep new global and partner uploads
  // local until their owner shares them; missing legacy fields keep their historic access.
  if (item.scope === 'global' || item.scope === 'partner') item.shareToChildren = false;
  await db.collection(KIND_META[input.kind].collection).insertOne(item);
  return { ok: true, item };
}

export type ReplaceFrameImageResult =
  | { ok: true; item: Document }
  | { ok: false; status: 400 | 404 | 409; reason: string };

/**
 * Replace a frame's stored image without changing its identity or ownership.
 * The caller supplies an exact owner-scoped selector after authorization. The
 * new file is stored first; an optimistic imageUrl check prevents concurrent
 * edits from silently overwriting one another. Old media is retained because
 * other generated outputs may still reference it until regeneration completes.
 */
export async function replaceLibraryFrameImage(
  db: Db,
  selector: Record<string, unknown>,
  file: unknown,
  name: unknown,
  now: string,
): Promise<ReplaceFrameImageResult> {
  const checked = checkUpload({ kind: 'frames', file, name });
  if (!checked.ok) return { ok: false, status: 400, reason: checked.reason };

  const frames = db.collection(KIND_META.frames.collection);
  const current = await frames.findOne(selector);
  if (!current) return { ok: false, status: 404, reason: 'Frame not found' };

  const stored = await uploadImage(file as File, { name: `frame-${Date.now()}` });
  const result = await frames.updateOne(
    { ...selector, imageUrl: current.imageUrl },
    {
      $set: {
        name: checked.name,
        imageUrl: stored.imageUrl,
        thumbnailUrl: stored.thumbnailUrl,
        deleteUrl: stored.deleteUrl,
        imageId: stored.imageId,
        fileSize: stored.fileSize,
        mimeType: stored.mimeType,
        updatedAt: now,
      },
    },
  );
  if (result.matchedCount === 0) return { ok: false, status: 409, reason: 'This frame changed while the new image was uploading. Reload it and try again.' };
  const updated = await frames.findOne(selector);
  return { ok: true, item: updated ?? { ...current, name: checked.name, imageUrl: stored.imageUrl, thumbnailUrl: stored.thumbnailUrl, updatedAt: now } };
}
