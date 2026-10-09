/**
 * When the giant-screen player reloads itself (camera#476, step S8b; owner answer 212): every 3 hours, and when an admin presses "Reload the screen". Both
 * happen at a slide boundary, so a picture is never cut in the middle, and only on a full-screen page: a layout cell would reload the whole layout. Pure, so it is
 * unit-tested.
 *
 * The admin's request is a token on the slideshow (`reloadRequestedAt`) that every playlist answer carries. The page remembers the token it opened with and reloads when it
 * sees a different, non-empty one; after the reload it opens with the new token, so one press reloads each open copy once.
 */

export const RELOAD_EVERY_MS = 3 * 60 * 60 * 1000;

export type ReloadReason = 'scheduled' | 'admin';

export function reloadReason(input: {
  variant: 'fullscreen' | 'embedded';
  openedAt: number;
  now: number;
  /** The token of the latest playlist answer, null when there is none. */
  token: string | null;
  /** The token the page opened with. */
  openedToken: string | null;
}): ReloadReason | null {
  if (input.variant !== 'fullscreen') return null;
  if (input.token !== null && input.token !== input.openedToken) return 'admin';
  if (input.now - input.openedAt >= RELOAD_EVERY_MS) return 'scheduled';
  return null;
}
