/**
 * Pictures that are not pictures of ours: the stand-in a host serves when it no longer has the file (owner, 2026-10-09: "if an image is broken the system should skip it and hide it, not show an
 * error"). ImgBB answers a deleted picture with HTTP 404 and a 180 x 180 PNG that says "imgbb.com image not found"; a browser draws an image body whatever the status, so `<img>` fires `load`
 * and the stand-in is shown like a photo. The status is invisible to a page (the pixels of a cross-origin picture cannot be read), but the size is not, and no real photo of ours is that small.
 */

const IMGBB_HOSTS = /^(?:[a-z0-9-]+\.)*(?:ibb\.co|imgbb\.com)$/i;
const IMGBB_PLACEHOLDER_SIDE = 180;

/** True when a picture that loaded from `url` with this natural size is the host's "not found" stand-in. */
export function isMissingImagePlaceholder(url: string, naturalWidth: number, naturalHeight: number): boolean {
  try {
    return IMGBB_HOSTS.test(new URL(url).hostname) && naturalWidth === IMGBB_PLACEHOLDER_SIDE && naturalHeight === IMGBB_PLACEHOLDER_SIDE;
  } catch {
    return false;
  }
}
