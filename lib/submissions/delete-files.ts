/**
 * Removes the stored image files of a submission that is being deleted for good (camera#211).
 *
 * Deleting only the database row left every image reachable at its URL, which mattered more once a
 * second, wider full-frame original was stored per fan (camera#210; the page has not uploaded one since
 * camera#257, but older submissions still carry it, so it is still deleted here). Order and failure
 * policy, in one place:
 *
 *  1. Files first, row second. A failed Blob delete throws 502 and the row stays, so the caller
 *     can repeat the same request (Blob delete of an already-gone file is not an error) and no
 *     file is ever left without a row that names it.
 *  2. Only files in this project's own Blob store are touched; a URL on any other host is skipped.
 *  3. A file another submission still points at is kept, not deleted.
 *  4. The imgbb mirror is third-party and best effort: its delete link is requested and the
 *     outcome reported, but it never blocks the delete (see RUNBOOK, "Deleting a submission").
 *  5. Every copy recorded on the submission (`imageCopies`, issue 509: the unframed crop and the framed picture, on Blob and on imgbb) is deleted with it, through the same two
 *     paths: a Blob copy with the Blob files, an imgbb copy through its stored delete link. A Blob copy already recorded as `deleted` is a historical entry and is not asked for again; its ImgBB copy is still deleted through its link. An ImgBB file whose delete link failed is never silent: it is counted
 *     (`imgbbFailed`), listed with its address (`imgbbNotDeleted`, no secret in it) and logged as a warning (`submission_files.imgbb_not_deleted`), so it can be removed by hand.
 */

import { del } from '@vercel/blob';
import type { Db, Document } from 'mongodb';
import { apiError } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { deleteImage } from '@/lib/imgbb/upload';
import { isRenderableImgbbImageUrl } from '@/lib/imgbb/url';
import { logWarn } from '@/lib/observability/logger';
import { blobStoreHostFromToken } from '@/lib/submissions/original-image';
import { PRIVACY_ERASURE_ACTIVE_FILTER } from '@/lib/privacy/erasure';
import { deleteCameraOriginalR2Copy, isCameraOriginalR2Key } from '@/lib/storage/r2';

/** Display fields another submission may legitimately share a file through. */
const SHARED_URL_FIELDS = ['imageUrl', 'finalImageUrl', 'originalImageUrl', 'previewImageUrl', 'screenImageUrl'] as const;

const IMGBB_DELETE_LINK = /^https:\/\/(?:[a-z0-9-]+\.)*(?:ibb\.co|imgbb\.com)\//i;

export interface SubmissionFilesDeps {
  /** Public host of this project's Blob store, or null when no token is configured. */
  storeHost: string | null;
  del: (urls: string[]) => Promise<void>;
  deleteImage: (url: string, publicImageUrl?: string | null) => Promise<boolean>;
  /** Delete a path from the separate private recovery store, if this submission has one. */
  deleteRecovery?: (pathname: string) => Promise<void>;
  /** Which of `urls` is still referenced by a submission other than `selfId`. */
  referencedElsewhere: (urls: string[], selfId: unknown) => Promise<Set<string>>;
}

export interface SubmissionFilesResult {
  deleted: string[];
  keptShared: string[];
  imgbbRequested: number;
  imgbbFailed: number;
  /** The addresses of the imgbb files whose delete request failed (they may still be online; remove them by hand). Public addresses, never a delete link. */
  imgbbNotDeleted: string[];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The copies recorded on the submission (issue 509): the address of each file and, for imgbb, the link that deletes it. */
function copiesOf(submission: Document): Array<{ url: string | null; deleteUrl: string | null; objectKey: string | null; store: string | null; role: string | null; deleted: boolean }> {
  if (!Array.isArray(submission.imageCopies)) return [];
  return (submission.imageCopies as Document[]).map((copy) => ({ url: text(copy?.url), deleteUrl: text(copy?.deleteUrl), objectKey: text(copy?.objectKey), store: text(copy?.store), role: text(copy?.role), deleted: copy?.state === 'deleted' }));
}

/** Every file URL the submission owns, de-duplicated; originalImageUrl equals imageUrl for older submissions. */
export function ownedUrls(submission: Document): { fileUrls: string[]; imgbbDeleteLinks: string[] } {
  // The source photo an old try-on request stored on its own (the integration is removed, issue 557, but the file is still the submission's).
  const tryOn = (submission.tryOnRequest ?? {}) as Document;
  const review = (submission.photoReview ?? {}) as Document;
  const copies = copiesOf(submission);
  const fileUrls = new Set(
    [
      submission.imageUrl,
      submission.finalImageUrl,
      submission.originalImageUrl,
      submission.previewImageUrl,
      // The screen-sized picture made for the giant screen (camera#476, S7); equal to imageUrl when that was small enough, which the set de-duplicates.
      submission.screenImageUrl,
      tryOn.sourceImageUrl,
      // The private plain photo of a vetted photo (camera#266). Since issue 509 it stays after approval until its imgbb copy is verified, so an approved photo can still have it: deleted here for good.
      review.photoUrl,
      // Every file a recorded copy names (the ones on imgbb are not in our store and are skipped by `inStore`; they go through their delete link below). A copy recorded as `deleted` (the private unframed
      // Historical deleted entry: its file is already gone and is not asked for again; the ImgBB copy of the same crop is still deleted below.
      ...copies.filter((copy) => !copy.deleted).map((copy) => copy.url),
    ]
      .map(text)
      .filter((url): url is string => url !== null)
  );
  const imgbbDeleteLinks = new Set(
    [submission.deleteUrl, tryOn.sourceDeleteUrl, ...copies.map((copy) => copy.deleteUrl)]
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

function publicImageUrlForDeleteLink(submission: Document, link: string): string | null {
  const copy = copiesOf(submission).find((entry) => entry.deleteUrl === link);
  if (copy?.url && isRenderableImgbbImageUrl(copy.url)) return copy.url;

  const tryOn = (submission.tryOnRequest ?? {}) as Document;
  if (text(tryOn.sourceDeleteUrl) === link) {
    const sourceUrl = text(tryOn.sourceImageUrl);
    return sourceUrl && isRenderableImgbbImageUrl(sourceUrl) ? sourceUrl : null;
  }
  if (text(submission.deleteUrl) === link) {
    for (const candidate of [submission.imageUrl, submission.finalImageUrl, submission.originalImageUrl, submission.previewImageUrl, submission.screenImageUrl, (submission.photoReview as Document | undefined)?.photoUrl]) {
      const url = text(candidate);
      if (url && isRenderableImgbbImageUrl(url)) return url;
    }
  }
  return null;
}

export function defaultDeps(db: Db, runtimeOidcToken?: string): SubmissionFilesDeps {
  return {
    storeHost: blobStoreHostFromToken(process.env.BLOB_READ_WRITE_TOKEN),
    del: (urls) => del(urls),
    deleteImage: (url, publicImageUrl) => deleteImage(url, publicImageUrl),
    deleteRecovery: async (pathname) => {
      const storeId = process.env.CAMERA_MTK_RECOVERY_STORE_ID?.trim();
      // Vercel Functions expose OIDC on the incoming request, not process.env.
      const oidcToken = runtimeOidcToken?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
      if (!storeId || !oidcToken) throw new Error('The private recovery store is not configured');
      await del(pathname, { storeId, oidcToken });
    },
    referencedElsewhere: async (urls, selfId) => {
      const projection = Object.fromEntries(SHARED_URL_FIELDS.map((field) => [field, 1]));
      const others = await db
        .collection(COLLECTIONS.SUBMISSIONS)
        .find(
          { $and: [PRIVACY_ERASURE_ACTIVE_FILTER, { _id: { $ne: selfId } as never, $or: SHARED_URL_FIELDS.map((field) => ({ [field]: { $in: urls } })) }] },
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
  deps: SubmissionFilesDeps = defaultDeps(db),
  runtimeOidcToken?: string,
): Promise<SubmissionFilesResult> {
  const { fileUrls, imgbbDeleteLinks } = ownedUrls(submission);
  const candidates = fileUrls.filter((url) => inStore(url, deps.storeHost));

  const recovery = (submission.adminRecovery ?? {}) as Document;
  const recoveryPath = text(recovery.pathname);
  const recoveryFileIsOwned = recovery.store === 'camera-mtk-recovery'
    && recoveryPath === `camera-admin-recovery/mtk/${String(submission._id)}.jpg`;
  if (recoveryFileIsOwned) {
    const deleteRecovery = runtimeOidcToken?.trim()
      ? defaultDeps(db, runtimeOidcToken).deleteRecovery
      : deps.deleteRecovery;
    if (!deleteRecovery) {
      throw apiError('Could not delete the restricted recovery image, so the submission was kept. Try again.', 502);
    }
    try {
      await deleteRecovery(recoveryPath!);
    } catch (error) {
      console.error(`Submission ${String(submission._id)}: deleting its restricted recovery copy failed`, error);
      throw apiError('Could not delete the restricted recovery image, so the submission was kept. Try again.', 502);
    }
  }

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

  const r2Keys = [...new Set(copiesOf(submission)
    .filter((copy) => copy.store === 'r2' && !copy.deleted)
    .map((copy) => copy.objectKey)
    .filter((key): key is string => key !== null))];
  if (copiesOf(submission).some((copy) => copy.store === 'r2' && !copy.deleted && (!copy.objectKey || !isCameraOriginalR2Key(copy.objectKey)))) {
    throw apiError('Could not verify the private backup image reference, so the submission was kept. Try again.', 502);
  }
  try {
    await Promise.all(r2Keys.map((key) => deleteCameraOriginalR2Copy(key)));
  } catch (error) {
    console.error(`Submission ${String(submission._id)}: deleting a private R2 image copy failed`, error instanceof Error ? error.name : 'unknown error');
    throw apiError('Could not delete the private backup image, so the submission was kept. Try again.', 502);
  }

  let imgbbFailed = 0;
  const imgbbNotDeleted: string[] = [];
  const recorded = new Map(copiesOf(submission).filter((copy) => copy.deleteUrl).map((copy) => [copy.deleteUrl as string, copy]));
  for (const link of imgbbDeleteLinks) {
    const publicImageUrl = publicImageUrlForDeleteLink(submission, link);
    if (await deps.deleteImage(link, publicImageUrl)) continue;
    imgbbFailed += 1;
    const copy = recorded.get(link);
    const unresolvedUrl = copy?.url ?? publicImageUrl;
    if (unresolvedUrl) imgbbNotDeleted.push(unresolvedUrl);
    logWarn('submission_files.imgbb_not_deleted', 'An imgbb file could not be deleted with its submission; it may still be online and must be removed by hand', {
      submissionId: String(submission._id),
      role: copy?.role ?? 'framed picture',
      url: unresolvedUrl ?? null,
    });
  }
  if (imgbbFailed) {
    console.warn(`Submission ${String(submission._id)}: ${imgbbFailed} imgbb delete request(s) failed; the mirror may still be online`);
    throw apiError('Could not confirm deletion of every ImgBB copy, so the submission was kept. Try again.', 502);
  }

  // The short-lived upload manifest is retained until every provider copy has
  // been removed. The submission row itself is deleted by the caller next.
  await db.collection(COLLECTIONS.ORIGINAL_ASSETS).deleteOne({ _id: submission._id });

  return {
    deleted: toDelete,
    keptShared: [...shared],
    imgbbRequested: imgbbDeleteLinks.length,
    imgbbFailed,
    imgbbNotDeleted,
  };
}
