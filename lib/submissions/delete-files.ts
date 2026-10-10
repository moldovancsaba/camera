/**
 * Removes the stored image files of a submission that is being deleted for good (camera#211).
 *
 * Deleting only the database row left every image reachable at its URL, which matters more now
 * that a second, wider full-frame original is stored per fan (camera#210). Order and failure
 * policy, in one place:
 *
 *  1. Files first, row second. A failed Blob delete throws 502 and the row stays, so the caller
 *     can repeat the same request (Blob delete of an already-gone file is not an error) and no
 *     file is ever left without a row that names it.
 *  2. Only files in this project's own Blob store are touched; a URL on any other host is skipped.
 *  3. A file another submission still points at is kept, not deleted.
 *  4. The imgbb mirror is third-party and best effort: its delete link is requested and the
 *     outcome reported, but it never blocks the delete (see RUNBOOK, "Deleting a submission").
 */

import { del } from '@vercel/blob';
import type { Db, Document } from 'mongodb';
import { apiError } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { deleteImage } from '@/lib/imgbb/upload';
import { blobStoreHostFromToken } from '@/lib/submissions/original-image';

/** Display fields another submission may legitimately share a file through. */
const SHARED_URL_FIELDS = ['imageUrl', 'finalImageUrl', 'originalImageUrl', 'previewImageUrl', 'screenImageUrl'] as const;

const IMGBB_DELETE_LINK = /^https:\/\/(?:[a-z0-9-]+\.)*(?:ibb\.co|imgbb\.com)\//i;

export interface SubmissionFilesDeps {
  /** Public host of this project's Blob store, or null when no token is configured. */
  storeHost: string | null;
  del: (urls: string[]) => Promise<void>;
  deleteImage: (url: string) => Promise<boolean>;
  /** Which of `urls` is still referenced by a submission other than `selfId`. */
  referencedElsewhere: (urls: string[], selfId: unknown) => Promise<Set<string>>;
}

export interface SubmissionFilesResult {
  deleted: string[];
  keptShared: string[];
  imgbbRequested: number;
  imgbbFailed: number;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Every file URL the submission owns, de-duplicated; originalImageUrl equals imageUrl for older submissions. */
export function ownedUrls(submission: Document): { fileUrls: string[]; imgbbDeleteLinks: string[] } {
  // The source photo an old try-on request stored on its own (the integration is removed, issue 557, but the file is still the submission's).
  const tryOn = (submission.tryOnRequest ?? {}) as Document;
  const review = (submission.photoReview ?? {}) as Document;
  const fileUrls = new Set(
    [
      submission.imageUrl,
      submission.finalImageUrl,
      submission.originalImageUrl,
      submission.previewImageUrl,
      // The screen-sized picture made for the giant screen (camera#476, S7); equal to imageUrl when that was small enough, which the set de-duplicates.
      submission.screenImageUrl,
      tryOn.sourceImageUrl,
      // The private plain photo of a vetted photo that has not been approved yet (camera#266).
      review.photoUrl,
    ]
      .map(text)
      .filter((url): url is string => url !== null)
  );
  const imgbbDeleteLinks = new Set(
    [submission.deleteUrl, tryOn.sourceDeleteUrl]
      .map(text)
      .filter((url): url is string => url !== null && IMGBB_DELETE_LINK.test(url))
  );
  return { fileUrls: [...fileUrls], imgbbDeleteLinks: [...imgbbDeleteLinks] };
}

function inStore(url: string, storeHost: string | null): boolean {
  if (!storeHost) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === storeHost;
  } catch {
    return false;
  }
}

export function defaultDeps(db: Db): SubmissionFilesDeps {
  return {
    storeHost: blobStoreHostFromToken(process.env.BLOB_READ_WRITE_TOKEN),
    del: (urls) => del(urls),
    deleteImage,
    referencedElsewhere: async (urls, selfId) => {
      const projection = Object.fromEntries(SHARED_URL_FIELDS.map((field) => [field, 1]));
      const others = await db
        .collection(COLLECTIONS.SUBMISSIONS)
        .find(
          { _id: { $ne: selfId } as never, $or: SHARED_URL_FIELDS.map((field) => ({ [field]: { $in: urls } })) },
          { projection }
        )
        .toArray();
      const shared = new Set<string>();
      for (const other of others) {
        for (const field of SHARED_URL_FIELDS) {
          const value = text(other[field]);
          if (value && urls.includes(value)) shared.add(value);
        }
      }
      return shared;
    },
  };
}

export async function deleteSubmissionFiles(
  db: Db,
  submission: Document,
  deps: SubmissionFilesDeps = defaultDeps(db)
): Promise<SubmissionFilesResult> {
  const { fileUrls, imgbbDeleteLinks } = ownedUrls(submission);
  const candidates = fileUrls.filter((url) => inStore(url, deps.storeHost));

  const shared = candidates.length ? await deps.referencedElsewhere(candidates, submission._id) : new Set<string>();
  const toDelete = candidates.filter((url) => !shared.has(url));

  if (toDelete.length) {
    try {
      await deps.del(toDelete);
    } catch (error) {
      console.error(`Submission ${String(submission._id)}: deleting ${toDelete.length} stored file(s) failed`, error);
      throw apiError('Could not delete the stored image files, so the submission was kept. Try again.', 502);
    }
  }

  let imgbbFailed = 0;
  for (const link of imgbbDeleteLinks) {
    if (!(await deps.deleteImage(link))) imgbbFailed += 1;
  }
  if (imgbbFailed) {
    console.warn(`Submission ${String(submission._id)}: ${imgbbFailed} imgbb delete request(s) failed; the mirror may still be online`);
  }

  return {
    deleted: toDelete,
    keptShared: [...shared],
    imgbbRequested: imgbbDeleteLinks.length,
    imgbbFailed,
  };
}
