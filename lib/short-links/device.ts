/**
 * Which visits to a tracked short link are counted, and from what kind of phone (camera#320). Pure, so it is unit-tested (device.test.ts).
 *
 * A count is the number of times a person's browser was sent on, not the number of different people: a link preview made by a chat app, a crawler,
 * a prefetch and a HEAD request are people-free and are left out; a guest who scans twice counts twice.
 */

export type HitDevice = 'android' | 'iphone' | 'other';

/** Chat-app link previews, crawlers, monitors and command-line tools: not a person scanning or tapping. */
const NOT_A_PERSON = /bot\b|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slackbot|embedly|skypeuripreview|curl\/|wget\/|python-requests|go-http-client|headless|lighthouse|pingdom|uptime|monitor|node-fetch|axios\//i;

export function deviceFromUserAgent(userAgent: string | null | undefined): HitDevice {
  const ua = userAgent ?? '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iphone';
  return 'other';
}

/** False for a HEAD request, a prefetch, a missing or non-person user agent. */
export function isCountableVisit(method: string, headers: { get(name: string): string | null }): boolean {
  if (method.toUpperCase() !== 'GET') return false;
  for (const name of ['purpose', 'sec-purpose', 'x-moz']) {
    if (/prefetch|prerender/i.test(headers.get(name) ?? '')) return false;
  }
  const ua = headers.get('user-agent') ?? '';
  return ua.trim().length > 0 && !NOT_A_PERSON.test(ua);
}
