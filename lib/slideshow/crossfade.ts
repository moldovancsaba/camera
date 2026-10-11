/**
 * Whether the crossfade is on for this page (camera#476, step S4b; owner answer 210 a: build it, go live only after the owner has seen it).
 *
 * The switch is the slideshow's own `crossfade` setting, **off by default**. To look at it first on a test screen, the address of the screen can force it for that one page:
 * `?crossfade=1` turns it on, `?crossfade=0` turns it off. Nothing is saved and no other screen is touched; without the query the setting decides, exactly as before.
 * Pure, so it is unit-tested.
 */
export function crossfadeEnabled(setting: boolean | undefined, search: string): boolean {
  const asked = new URLSearchParams(search).get('crossfade');
  if (asked === '1') return true;
  if (asked === '0') return false;
  return setting === true;
}
