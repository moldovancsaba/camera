/**
 * A photo of the event in the photo window of the welcome page screen (issue 540, step 5 of docs/WELCOME_SCREEN_PHOTO_PLAN.md; owner answers 257 and 256): the editor picks, from the event's
 * gallery, a photo the editor uploaded (a **clean** picture, kept as the original when the event's frame was put on it) or an approved guest photo (**framed** already). A clean picture is
 * drawn like a sample selfie, with the event's frame over it; a framed one is drawn as it is, with **no second frame**. Only a photo that passes the one visibility rule
 * (`lib/submissions/visibility.ts`: approved, not hidden, not archived, not broken) can be picked or shown; **no other condition** (owner answer 256: every approved or uploaded image may be
 * used anywhere, any time, in any context). The list shows no name or e-mail of a guest. Database side; pure parts are unit-tested.
 */

import { ObjectId, type Db, type Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isPubliclyVisible, publiclyVisibleClauses, visibilityInputOf } from '@/lib/submissions/visibility';

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const LIST_LIMIT = 200;
const SHOWN = 60;

export interface WindowPicture {
  url: string;
  /** True when the picture already has the event's frame (a guest photo, an uploaded photo that was framed and has no plain original): it is drawn as it is. */
  framed: boolean;
}

/** The picture of a photo for the window, or null when it has none. An editor's upload is clean (its plain original when a frame was put on it); anything else is the public, framed picture. */
export function windowPictureOf(doc: Document): WindowPicture | null {
  const publicUrl = text(doc.screenImageUrl) || text(doc.imageUrl) || text(doc.finalImageUrl);
  const metadata = (doc.metadata ?? {}) as { adminGalleryUpload?: unknown; galleryFrame?: unknown };
  if (metadata.adminGalleryUpload === true) {
    const original = text(doc.originalImageUrl);
    if (original && original !== text(doc.imageUrl)) return { url: original, framed: false };
    if (metadata.galleryFrame !== true && text(doc.imageUrl)) return { url: text(doc.imageUrl), framed: false };
  }
  return publicUrl ? { url: publicUrl, framed: true } : null;
}

const isOfEvent = (doc: Document, event: Document): boolean => {
  const keys = [text(event.eventId), String(event._id ?? '')].filter(Boolean);
  const refs = [text(doc.eventId), ...(Array.isArray(doc.eventIds) ? doc.eventIds.map(text) : [])];
  return refs.some((ref) => keys.includes(ref));
};

/** The photo of the event that may be shown in the window, or null (gone, hidden, not approved, another event's, a try-on result, no picture). */
export async function eligiblePhoto(db: Db, event: Document, photoId: string): Promise<{ id: string; doc: Document; picture: WindowPicture } | null> {
  if (!ObjectId.isValid(photoId)) return null;
  const doc = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({ _id: new ObjectId(photoId) });
  if (!doc || doc.submissionKind === 'tryon_result' || !isOfEvent(doc, event) || !isPubliclyVisible(visibilityInputOf(doc))) return null;
  const picture = windowPictureOf(doc);
  return picture ? { id: photoId, doc, picture } : null;
}

export interface WindowPhotoView {
  id: string;
  imageUrl: string;
  /** `clean` for an editor's upload with a plain picture, `framed` for the rest. */
  kind: 'clean' | 'framed';
  createdAt: string | null;
}

/** The photos the editor can pick, clean uploads first, then the newest approved photos; at most 60. */
export async function listWindowPhotos(db: Db, event: Document): Promise<WindowPhotoView[]> {
  const keys = [text(event.eventId), String(event._id ?? '')].filter(Boolean);
  const docs = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find({ $and: [{ $or: [{ eventId: { $in: keys } }, { eventIds: { $in: keys } }] }, ...publiclyVisibleClauses(keys), { submissionKind: { $ne: 'tryon_result' } }] })
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .toArray();
  const views = docs.flatMap((doc): WindowPhotoView[] => {
    const picture = windowPictureOf(doc);
    if (!picture) return [];
    const thumb = picture.framed ? text(doc.previewImageUrl) || picture.url : picture.url;
    return [{ id: String(doc._id), imageUrl: thumb, kind: picture.framed ? 'framed' : 'clean', createdAt: text(doc.createdAt) || null }];
  });
  return [...views.filter((view) => view.kind === 'clean'), ...views.filter((view) => view.kind === 'framed')].slice(0, SHOWN);
}
