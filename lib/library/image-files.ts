/**
 * The files the Images library takes (camera#368, docs/LIBRARIES.md), shared by the upload on the server (uploaders/images.ts) and the pages and the
 * picture picker in the browser. No server code here, so a page can import it.
 */

export const IMAGE_FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export const IMAGE_FILE_WORDS = 'PNG, JPEG, WebP or SVG';
/** 4 MB, the limit of the uploads the pages had before (a request much bigger than this is stopped before it reaches the app). */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const IMAGE_MAX_WORDS = '4 MB';
