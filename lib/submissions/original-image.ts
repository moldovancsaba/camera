/**
 * The full-frame original of a submission (camera#210): where it may live, and how the server
 * checks a URL the browser claims to have uploaded. Pure (the Blob lookup is injected) so it is
 * unit-tested in original-image.test.ts.
 *
 * The browser uploads the original straight to Vercel Blob with a short-lived token from
 * POST /api/uploads/original, because the original plus the composite can exceed the 4.5 MB
 * request-body limit of Vercel Functions. The submission then carries only the resulting URL,
 * which must be inside `originals/<eventId>/` of this project's own Blob store.
 */

/** Largest original a token allows. A 12 MP JPEG at quality 0.92 is about 3 to 6 MB. */
export const ORIGINAL_MAX_BYTES = 15 * 1024 * 1024;

export const ORIGINAL_ALLOWED_TYPE = 'image/jpeg';

export const ORIGINAL_UPLOAD_ENDPOINT = '/api/uploads/original';

/** How long an upload token stays valid. */
export const ORIGINAL_TOKEN_TTL_MS = 10 * 60 * 1000;

const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,120}$/;
const STORE_ID_PATTERN = /^vercel_blob_rw_([A-Za-z0-9]+)_/;
const MAX_DIMENSION = 16384;

export function isValidEventIdForPath(eventId: unknown): eventId is string {
  return typeof eventId === 'string' && EVENT_ID_PATTERN.test(eventId);
}

export function originalPathPrefix(eventId: string): string {
  return `originals/${eventId}/`;
}

/** `originals/<eventId>/<one safe file name>.jpg`, nothing else. */
export function validateOriginalPathname(pathname: unknown, eventId: unknown): boolean {
  if (typeof pathname !== 'string' || !isValidEventIdForPath(eventId)) return false;
  const prefix = originalPathPrefix(eventId);
  if (!pathname.startsWith(prefix)) return false;
  const fileName = pathname.slice(prefix.length);
  return FILE_NAME_PATTERN.test(fileName) && /\.jpe?g$/i.test(fileName) && !fileName.includes('..');
}

/** The store's public host, from the read-write token (`vercel_blob_rw_<storeId>_<secret>`). */
export function blobStoreHostFromToken(token: string | undefined): string | null {
  const match = STORE_ID_PATTERN.exec(token ?? '');
  return match ? `${match[1].toLowerCase()}.public.blob.vercel-storage.com` : null;
}

/** True only for an https URL in this project's store whose path is inside the event's originals. */
export function isOriginalBlobUrl(url: unknown, options: { eventId: unknown; storeHost: string | null }): url is string {
  if (typeof url !== 'string' || !options.storeHost || !isValidEventIdForPath(options.eventId)) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:' || parsed.host.toLowerCase() !== options.storeHost.toLowerCase()) return false;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;

  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
  return validateOriginalPathname(pathname, options.eventId);
}

function dimension(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= MAX_DIMENSION ? rounded : undefined;
}

export interface VerifiedOriginal {
  url: string;
  width?: number;
  height?: number;
  fileSize: number;
  mimeType: string;
}

export type OriginalCheck =
  | { kind: 'none' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unverified' }
  | { kind: 'ok'; original: VerifiedOriginal };

/** Looks a Blob up by URL; null or a throw means "could not confirm it exists". */
export type BlobHead = (url: string) => Promise<{ size: number; contentType: string } | null>;

/**
 * Decides what to do with the original a submission claims.
 * - none: nothing was claimed (older clients, or the upload failed on the device).
 * - invalid: the claim is wrong (foreign host, other event, wrong type or size); reject the request.
 * - unverified: the file could not be confirmed (not found, transient error); keep the submission without it.
 * - ok: confirmed in our store, within the event's folder, an image of an allowed size.
 */
export async function verifyOriginalImage(input: {
  url: unknown;
  width: unknown;
  height: unknown;
  eventId: unknown;
  storeHost: string | null;
  head: BlobHead;
}): Promise<OriginalCheck> {
  if (input.url === undefined || input.url === null || input.url === '') return { kind: 'none' };

  if (!isOriginalBlobUrl(input.url, { eventId: input.eventId, storeHost: input.storeHost })) {
    return { kind: 'invalid', reason: 'The original image is not in this event\'s originals folder' };
  }

  let found: { size: number; contentType: string } | null;
  try {
    found = await input.head(input.url);
  } catch {
    return { kind: 'unverified' };
  }
  if (!found) return { kind: 'unverified' };

  if (found.contentType !== ORIGINAL_ALLOWED_TYPE) return { kind: 'invalid', reason: 'The original image must be a JPEG' };
  if (!(found.size > 0) || found.size > ORIGINAL_MAX_BYTES) return { kind: 'invalid', reason: 'The original image has an unsupported size' };

  return {
    kind: 'ok',
    original: {
      url: input.url,
      width: dimension(input.width),
      height: dimension(input.height),
      fileSize: found.size,
      mimeType: found.contentType,
    },
  };
}
