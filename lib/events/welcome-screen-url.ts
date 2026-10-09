/**
 * The picture of the giant screen on a welcome page (issue 327 step 8b, issue 520): the page's own picture when it has one, else the picture drawn from the event's default slideshow
 * (`Event.welcomeScreen`). The capture page copied every other field of the public event into its state and **never this one**, so a welcome page without a picture of its own showed no
 * giant screen at all (found 2026-10-09 when the owner's MTK welcome page lost its static picture to follow the slideshow). Pure, unit-tested in welcome-screen-url.test.ts.
 */

/** The address of the drawn welcome picture in a public event, or undefined when the event has none (a plain https string only). */
export function welcomeScreenOf(eventData: { welcomeScreen?: { url?: unknown } | null } | null | undefined): { url: string } | undefined {
  const url = eventData?.welcomeScreen?.url;
  return typeof url === 'string' && /^https:\/\//i.test(url) ? { url } : undefined;
}

/** What the welcome page shows on its giant screen: its own picture, else the drawn one, else nothing. */
export function welcomeScreenImage(pageOwn: string | null | undefined, drawn: { url: string } | null | undefined): string | undefined {
  const own = typeof pageOwn === 'string' ? pageOwn.trim() : '';
  return own || drawn?.url || undefined;
}
