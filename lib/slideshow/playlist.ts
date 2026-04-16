/**
 * Slideshow playlist: one submission per slide (`type: 'single'`), aspect ratio from dimensions.
 * Fairness / ordering is decided by the playlist route before calling `generatePlaylist`.
 */

/** Fisher–Yates shuffle (mutates array). */
export function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** FNV-1a 32-bit — stable hash for layout instance keys (server playlist route). */
export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function mulberryNext() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates with a deterministic PRNG (mutates array).
 * Used with `seed = hash(instanceKey) ^ perRequestSalt` so layout cells get independent streams.
 */
export function shuffleInPlaceSeeded<T>(arr: T[], seed: number): void {
  const rng = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Cyclic left-rotate in place so layout regions with the same fairness-sorted list
 * do not all start on the same first submission (fixed orderMode + instanceKey).
 */
export function rotateLeftBy<T>(arr: T[], k: number): void {
  const n = arr.length;
  if (n <= 1) return;
  let offset = k % n;
  if (offset < 0) offset += n;
  if (offset === 0) return;
  const head = arr.splice(0, offset);
  arr.push(...head);
}

function cloneSlide(s: Slide): Slide {
  return {
    type: s.type,
    aspectRatio: s.aspectRatio,
    submissions: s.submissions.map((sub) => ({ ...sub })),
  };
}

/**
 * Repeat a base playlist cyclically until it has exactly targetLen slides (deep-cloned entries).
 * Used to keep a full prefetch queue when the event has very few distinct slides.
 */
export function expandPlaylistToLength(base: Slide[], targetLen: number): Slide[] {
  if (base.length === 0 || targetLen <= 0) return [];
  const out: Slide[] = [];
  for (let i = 0; i < targetLen; i++) {
    out.push(cloneSlide(base[i % base.length]));
  }
  return out;
}

/**
 * Aspect Ratio Categories
 */
export enum AspectRatio {
  LANDSCAPE = '16:9',  // Horizontal images (full screen)
  SQUARE = '1:1',      // Square images (2x1 mosaic)
  PORTRAIT = '9:16',   // Vertical images (3x1 mosaic)
  UNKNOWN = 'unknown', // Cannot determine or unsupported
}

/**
 * Slide Type - represents what will be displayed
 */
export interface Slide {
  type: 'single' | 'mosaic';
  aspectRatio: AspectRatio;
  submissions: Array<{
    _id: string;
    imageUrl: string;
    width: number;
    height: number;
  }>;
}

/**
 * Detect aspect ratio from image dimensions
 * Uses WIDE tolerance to accept more images as valid
 * 
 * CRITICAL: Many images have slightly non-standard aspect ratios (e.g. 2160x1440 = 1.5)
 * We must accept these as landscape to ensure ALL images can be displayed
 * Otherwise, images get skipped and the same few images play repeatedly
 */
export function detectAspectRatio(width: number, height: number): AspectRatio {
  const ratio = width / height;
  
  // Portrait: ratio < 0.7 (anything narrower than portrait-ish)
  // 9:16 = 0.5625, so accept 0.4 to 0.7 as portrait
  if (ratio >= 0.4 && ratio <= 0.7) {
    return AspectRatio.PORTRAIT;
  }
  
  // Square: ratio between 0.8 and 1.2 (roughly square-ish)
  // 1:1 = 1.0, so accept 0.8 to 1.2 as square
  if (ratio >= 0.8 && ratio <= 1.2) {
    return AspectRatio.SQUARE;
  }
  
  // Landscape: ratio > 1.2 (anything wider than square)
  // 16:9 = 1.777, 3:2 = 1.5, 4:3 = 1.333 - ALL should be landscape
  // This includes 2160x1440 (1.5), 2048x1365 (1.5), 1920x1080 (1.777)
  if (ratio > 1.2) {
    return AspectRatio.LANDSCAPE;
  }
  
  // Fallback: If somehow outside all ranges, treat as landscape
  // This ensures NO images are skipped
  return AspectRatio.LANDSCAPE;
}

/**
 * Generate playlist of next N slides from submissions — one image per slide (no mosaics).
 *
 * @param submissions - Caller-defined order (playlist route: fairness sort, then optional shuffle / rotate per `instanceKey`). Re-sorting here would break independent layout cells.
 * @param limit - Maximum number of slides to generate (default: 10)
 * @returns Array of Slide objects ready for display
 */
export function generatePlaylist(submissions: any[], limit: number = 10): Slide[] {
  const playlist: Slide[] = [];
  let n = 0;
  for (const sub of submissions) {
    if (n >= limit) break;
    const width = Number(sub.metadata?.finalWidth || sub.metadata?.originalWidth || 1920);
    const height = Number(sub.metadata?.finalHeight || sub.metadata?.originalHeight || 1080);
    const aspectRatio = detectAspectRatio(width, height);
    playlist.push({
      type: 'single',
      aspectRatio: aspectRatio === AspectRatio.UNKNOWN ? AspectRatio.LANDSCAPE : aspectRatio,
      submissions: [
        {
          _id: sub._id.toString(),
          imageUrl: sub.imageUrl || sub.finalImageUrl,
          width,
          height,
        },
      ],
    });
    n++;
    console.log(`[Playlist] Single-image slide ${n}/${limit} (${sub._id})`);
  }
  return playlist;
}

/**
 * Extract all submission IDs from a playlist
 * Used to update play counts after display
 */
export function extractSubmissionIds(playlist: Slide[]): string[] {
  const ids: string[] = [];
  for (const slide of playlist) {
    for (const submission of slide.submissions) {
      ids.push(submission._id);
    }
  }
  return ids;
}
