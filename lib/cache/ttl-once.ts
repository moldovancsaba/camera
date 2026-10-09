/**
 * A tiny cache for one value that is expensive to load and may be a little old: the loaded promise is kept for `ttlMs`, so callers that
 * arrive in that time (even at the same moment) share one load. A load that fails is not kept. Per server instance, so another instance
 * may show an older value for up to `ttlMs`; `clear()` makes the next call load again (use it after the code itself changes the value).
 */
export function ttlOnce<T>(load: () => Promise<T>, ttlMs: number, now: () => number = Date.now) {
  let entry: { at: number; value: Promise<T> } | null = null;
  const get = (): Promise<T> => {
    const t = now();
    if (entry && t - entry.at < ttlMs) return entry.value;
    const value = load();
    const mine = { at: t, value };
    entry = mine;
    value.catch(() => {
      if (entry === mine) entry = null;
    });
    return value;
  };
  get.clear = (): void => {
    entry = null;
  };
  return get;
}
