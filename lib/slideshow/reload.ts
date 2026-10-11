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

/**
 * Why a reload that is due is held back for now (camera#476, step S8b; the owner's rule: the live screen is never cut, and never sent to a page that cannot load).
 *
 * - `offline`: the browser says it has no network. A reload then would not bring the show back, it would show the browser's own error page, and a screen on a wall has
 *   nobody to press anything. (`navigator.onLine` is only trusted when it says offline.) Held for the scheduled reload and for the admin's.
 * - `next picture not ready` (the scheduled reload only): the next picture of the queue is not loaded yet, so after the reload the show would have to start from nothing on a
 *   link that is already slow. The admin's own request is not held for this: it is what is pressed when the screen is in trouble.
 *
 * There is no "during a fade" hold on purpose: the reload runs at the slide boundary, a whole hold after the picture appeared, so a fade shorter than the hold is over; a fade as
 * long as the hold would be "in progress" at every boundary and the reload would never come.
 *
 * A held reload is not given up: the reason stays due and the next slide boundary asks again. Pure, so it is unit-tested.
 */
export type ReloadHold = 'offline' | 'next picture not ready';

export function reloadHeldBy(reason: ReloadReason, state: { online: boolean; nextReady: boolean }): ReloadHold | null {
  if (!state.online) return 'offline';
  if (reason === 'scheduled' && !state.nextReady) return 'next picture not ready';
  return null;
}
