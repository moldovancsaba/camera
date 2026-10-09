/**
 * What the giant-screen player does when it notices it is standing still (camera#476, step S8). The stall is detected by the diagnostics hook
 * (no slide became current for two holds and five seconds while the page is visible and the show should be moving). Pure, so it is unit-tested.
 *
 * First the player goes to the next slide, which also re-arms the hold timer. If the picture still has not moved a minute after the stall began
 * the page is reloaded (the show restarts from the server's queue, nothing is lost) - but at most MAX_RELOADS times in RELOAD_WINDOW_MS: a
 * reload loop is worse than a still picture, so after that it only keeps skipping.
 */

export const RELOAD_AFTER_MS = 60_000;
export const MAX_RELOADS = 3;
export const RELOAD_WINDOW_MS = 10 * 60_000;

export type WatchdogAction = 'skip' | 'reload';

export function watchdogAction(stalledMs: number, reloadTimes: number[], now: number): WatchdogAction {
  if (stalledMs < RELOAD_AFTER_MS) return 'skip';
  return reloadTimes.filter((t) => now - t < RELOAD_WINDOW_MS).length < MAX_RELOADS ? 'reload' : 'skip';
}

/** The reload times kept in the session, from its stored text, without the ones that are out of the window (a bad text is no history). */
export function recentReloads(stored: string | null, now: number): number[] {
  try {
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((t): t is number => typeof t === 'number' && now - t < RELOAD_WINDOW_MS) : [];
  } catch {
    return [];
  }
}
