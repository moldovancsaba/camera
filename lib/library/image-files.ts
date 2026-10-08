/**
 * The files the Images library takes (camera#368, docs/LIBRARIES.md), shared by the upload on the server (uploaders/images.ts) and the pages and the
 * picture picker in the browser. No server code here, so a page can import it.
 */

export const IMAGE_FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export type ImageFileType = (typeof IMAGE_FILE_TYPES)[number];
export const IMAGE_FILE_WORDS = 'PNG, JPEG, WebP or SVG';

/**
 * What some picture fields take, as their own uploads did before the library: the email footer no SVG (email apps do not show one), the screen
 * overlay no JPEG (it must be transparent where the photos play).
 */
export const EMAIL_PICTURE_TYPES: readonly ImageFileType[] = ['image/png', 'image/jpeg', 'image/webp'];
export const EMAIL_PICTURE_WORDS = 'PNG, JPEG or WebP';
export const OVERLAY_PICTURE_TYPES: readonly ImageFileType[] = ['image/png', 'image/webp', 'image/svg+xml'];
export const OVERLAY_PICTURE_WORDS = 'PNG, WebP or SVG';
/** 4 MB, the limit of the uploads the pages had before (a request much bigger than this is stopped before it reaches the app). */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const IMAGE_MAX_WORDS = '4 MB';
