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
}

export type UploadResult = { ok: true; item: Document } | { ok: false; status: 400; reason: string };

/** The fields of the upload that do not need the network: checked first, so a bad request never reaches the file store. */
export function checkUpload(input: Pick<UploadInput, 'kind' | 'file' | 'name' | 'description'>): { ok: true; name: string; description: string } | { ok: false; reason: string } {
  const uploader = UPLOADERS[input.kind];
  if (!uploader) return { ok: false, reason: `Uploading ${KIND_META[input.kind].noun}s here is not available yet.` };
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, reason: 'A name is required.' };
  if (name.length > MAX_NAME) return { ok: false, reason: `The name can have ${MAX_NAME} characters at most.` };
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > MAX_DESCRIPTION) return { ok: false, reason: `The description can have ${MAX_DESCRIPTION} characters at most.` };
  const file = input.file as { type?: unknown; size?: unknown } | null;
  if (!(typeof File !== 'undefined' && input.file instanceof File) || typeof file?.type !== 'string') return { ok: false, reason: 'Choose a file to upload.' };
  if (!uploader.fileTypes.includes(file.type)) return { ok: false, reason: `Only ${uploader.fileTypeWords} files are allowed.` };
  if (typeof file.size === 'number' && file.size === 0) return { ok: false, reason: 'The file is empty.' };
  if (uploader.maxBytes && typeof file.size === 'number' && file.size > uploader.maxBytes) return { ok: false, reason: `The file is too big: ${Math.round(uploader.maxBytes / 1048576)} MB at most.` };
  return { ok: true, name, description };
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
    },
    file
  );
  await db.collection(KIND_META[input.kind].collection).insertOne(item);
  return { ok: true, item };
}
