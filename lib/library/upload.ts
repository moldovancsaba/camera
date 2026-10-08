/**
 * An upload into a library (camera#361): the same file checks and the same stored shape as the global frame upload (`POST /api/frames`), with the
 * owner written on the item: global, one partner, or one event. Only frames can be uploaded here so far; logos and images join with their packages.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import { uploadImage } from '@/lib/imgbb/upload';
import { KIND_META, type LibraryKind } from './kinds';

export const UPLOAD_KINDS: readonly LibraryKind[] = ['frames'];

const FRAME_TYPES = ['image/png', 'image/svg+xml'];
const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;

export type Owner =
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
  if (!UPLOAD_KINDS.includes(input.kind)) return { ok: false, reason: `Uploading ${KIND_META[input.kind].noun}s here is not available yet.` };
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, reason: 'A name is required.' };
  if (name.length > MAX_NAME) return { ok: false, reason: `The name can have ${MAX_NAME} characters at most.` };
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > MAX_DESCRIPTION) return { ok: false, reason: `The description can have ${MAX_DESCRIPTION} characters at most.` };
  const file = input.file as { type?: unknown; size?: unknown } | null;
  if (!(typeof File !== 'undefined' && input.file instanceof File) || typeof file?.type !== 'string') return { ok: false, reason: 'Choose a file to upload.' };
  if (!FRAME_TYPES.includes(file.type)) return { ok: false, reason: 'Only PNG and SVG files are allowed.' };
  if (typeof file.size === 'number' && file.size === 0) return { ok: false, reason: 'The file is empty.' };
  return { ok: true, name, description };
}

/** Stores the file and the item. A frame carries the same fields as a global frame, plus who owns it. */
export async function createLibraryItem(db: Db, input: UploadInput): Promise<UploadResult> {
  const checked = checkUpload(input);
  if (!checked.ok) return { ok: false, status: 400, reason: checked.reason };

  const stored = await uploadImage(input.file as File, { name: `frame-${Date.now()}` });
  const now = generateTimestamp();
  const owner =
    input.owner.scope === 'partner'
      ? { scope: 'partner', partnerId: input.owner.partnerId }
      : { scope: 'event', eventId: input.owner.eventId, ...(input.owner.partnerId ? { partnerId: input.owner.partnerId } : {}) };
  const item: Document = {
    frameId: generateId(),
    name: checked.name,
    description: checked.description,
    category: typeof input.category === 'string' && input.category.trim() ? input.category.trim() : 'general',
    imageUrl: stored.imageUrl,
    deleteUrl: stored.deleteUrl,
    imageId: stored.imageId,
    fileSize: stored.fileSize,
    mimeType: stored.mimeType,
    isActive: input.isActive !== false,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    ...owner,
  };
  await db.collection(COLLECTIONS.FRAMES).insertOne(item);
  return { ok: true, item };
}
