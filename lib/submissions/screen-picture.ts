/**
 * The screen-sized picture of a submission (camera#476, step S7; owner answer 211 b).
 *
 * The giant screen shows one new photo every few seconds over a venue link that is not always reliable, and the picture it was given was the full-size one: a
 * composed JPEG at frame size, quality 92 (a megabyte or more). A wall that shows at most 1920 pixels cannot use the
 * extra. So when a photo becomes public its screen picture is made once: the longest edge at most 1920 px, WebP quality 80, stored in the Blob store with a one-year
 * cache header under `screen-pictures/<submission id>-<hash of the picture>.webp`, and named in `Submission.screenImageUrl`. The playlist sends it instead of `imageUrl` when it
 * exists; the original is never changed or removed. **The address changes with the picture** (owner, 2026-10-09: the slideshow showed the unframed version of a photo the gallery had
 * framed): the file is cached for a year by the CDN and by every browser that showed it, so a picture written over the same address is never seen by the screens that have it. A new picture is a new address. A photo that is already small enough names its own picture (`screenImageUrl` = `imageUrl`), so it is not looked at again.
 *
 * Nothing here may fail a photo: it runs after the response, and a failure is logged and the slideshow keeps using the original.
 */

import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';
import type { Db, ObjectId } from 'mongodb';
import sharp from 'sharp';
import { COLLECTIONS } from '@/lib/db/schemas';
import { fetchImageBuffer } from '@/lib/media/image-buffer';
import { logWarn } from '@/lib/observability/logger';

export const SCREEN_PICTURE_LONG_EDGE = 1920;
export const SCREEN_PICTURE_QUALITY = 80;
/** A picture at most this long (in pixels) and this heavy (in bytes) is already a screen picture. */
export const SCREEN_PICTURE_KEEP_BYTES = 150_000;

/** The address of a screen picture: the submission and the first 12 hex digits of the hash of the picture, so the same picture is the same address and another picture never is. */
export function screenPicturePath(submissionId: string, picture: Buffer): string {
  return `screen-pictures/${submissionId}-${createHash('sha256').update(picture).digest('hex').slice(0, 12)}.webp`;
}

export interface ScreenPicture {
  buffer: Buffer;
  width: number;
  height: number;
}

/** The screen picture of a photo: oriented as it should be seen, at most 1920 px on the longest edge (never enlarged), WebP. */
export async function makeScreenPicture(source: Buffer): Promise<ScreenPicture> {
  const { data, info } = await sharp(source, { failOn: 'none' })
    .rotate()
    .resize({ width: SCREEN_PICTURE_LONG_EDGE, height: SCREEN_PICTURE_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: SCREEN_PICTURE_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

export interface ScreenPictureDeps {
  fetchImage: (url: string) => Promise<Buffer>;
  put: (pathname: string, body: Buffer, options: { contentType: string; cacheControlMaxAge: number }) => Promise<{ url: string }>;
}

export const defaultScreenPictureDeps: ScreenPictureDeps = {
  fetchImage: fetchImageBuffer,
  put: (pathname, body, options) => put(pathname, body, { access: 'public', contentType: options.contentType, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: options.cacheControlMaxAge }),
};

export type ScreenPictureOutcome = 'made' | 'reused-original' | 'exists' | 'no-source' | 'failed';

export interface ScreenPictureSubmission {
  _id: ObjectId;
  imageUrl?: string | null;
  finalImageUrl?: string | null;
  screenImageUrl?: string | null;
}

/**
 * Makes the screen picture of one submission unless it has one, and stores its address. Never throws: the outcome says what happened (`failed` is logged).
 * `dryRun` does everything but the upload and the write, so a backfill can be measured.
 */
export async function ensureScreenPicture(
  db: Db,
  submission: ScreenPictureSubmission,
  deps: ScreenPictureDeps = defaultScreenPictureDeps,
  options: { dryRun?: boolean } = {}
): Promise<{ outcome: ScreenPictureOutcome; sourceBytes?: number; screenBytes?: number }> {
  if (typeof submission.screenImageUrl === 'string' && submission.screenImageUrl) return { outcome: 'exists' };
  const sourceUrl = submission.finalImageUrl || submission.imageUrl;
  if (!sourceUrl) return { outcome: 'no-source' };
  try {
    const source = await deps.fetchImage(sourceUrl);
    const picture = await makeScreenPicture(source);
    const small = source.length <= SCREEN_PICTURE_KEEP_BYTES || picture.buffer.length >= source.length;
    if (options.dryRun) return { outcome: small ? 'reused-original' : 'made', sourceBytes: source.length, screenBytes: small ? source.length : picture.buffer.length };
    if (small) {
      await db.collection(COLLECTIONS.SUBMISSIONS).updateOne({ _id: submission._id }, { $set: { screenImageUrl: sourceUrl } });
      return { outcome: 'reused-original', sourceBytes: source.length, screenBytes: source.length };
    }
    const stored = await deps.put(screenPicturePath(String(submission._id), picture.buffer), picture.buffer, { contentType: 'image/webp', cacheControlMaxAge: 31_536_000 });
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: submission._id },
      { $set: { screenImageUrl: stored.url, screenImageBytes: picture.buffer.length, 'metadata.screenWidth': picture.width, 'metadata.screenHeight': picture.height } }
    );
    return { outcome: 'made', sourceBytes: source.length, screenBytes: picture.buffer.length };
  } catch (error) {
    logWarn('screen_picture.failed', 'The screen picture could not be made; the slideshow keeps the original', { submissionId: String(submission._id), error: error instanceof Error ? error.message : String(error) });
    return { outcome: 'failed' };
  }
}
