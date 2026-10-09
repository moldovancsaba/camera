/**
 * Phase timer for the playlist route (camera#476, step S1): how long each phase of one call took, as a `Server-Timing` header (visible in
 * the browser's network tab) and, when a call is slow, as one warning line with the same phases. Pure, so it is unit-tested.
 */

/** A playlist call slower than this is logged with its phases. */
export const SLOW_PLAYLIST_MS = 1000;

export function createLapTimer(now: () => number = Date.now) {
  const start = now();
  let mark = start;
  const laps: Array<[name: string, ms: number]> = [];
  return {
    /** Ends the phase that has run since the previous lap. */
    lap(name: string): void {
      const t = now();
      laps.push([name, t - mark]);
      mark = t;
    },
    laps,
    totalMs: (): number => now() - start,
    header(): string {
      return [...laps, ['total', now() - start] as [string, number]].map(([name, ms]) => `${name};dur=${ms}`).join(', ');
    },
  };
}
