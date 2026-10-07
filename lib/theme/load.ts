/**
 * Loads the theme of an event for a server render (camera#285): its messmass style snapshot, or for an event without one camera's own
 * name and partner logo with the system default look. Shared by the event API, the capture layout and the share page.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { nativeFrameContext, type FrameContext } from '@/lib/frame/context';
import { messmassFontUrl } from '@/lib/messmassClient';
import { resolveEventTheme, type EventTheme } from '@/lib/theme/event-theme';

export async function loadEventTheme(db: Db, event: Document): Promise<EventTheme> {
  let context = (event.frameDesign as { context?: FrameContext } | undefined)?.context ?? null;
  if (!context) {
    const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId }, { projection: { name: 1, logoUrl: 1 } });
    context = nativeFrameContext(
      {
        eventName: String(event.name ?? ''),
        partnerName: typeof partner?.name === 'string' ? partner.name : typeof event.partnerName === 'string' ? event.partnerName : null,
        partnerLogoUrl: typeof partner?.logoUrl === 'string' ? partner.logoUrl : null,
      },
      new Date().toISOString()
    );
  }
  const theme = resolveEventTheme({ brandColor: typeof event.brandColor === 'string' ? event.brandColor : null, context, emailFooterImageUrl: typeof event.emailFooterImageUrl === 'string' ? event.emailFooterImageUrl : null });
  return { ...theme, font: { ...theme.font, url: browserFontUrl(theme.font.file) } };
}

/** The custom font file on the messmass origin, as the browser must ask for it: messmass.com redirects to www, and a redirect carries no CORS header. */
export function browserFontUrl(file: string | null): string | null {
  const url = file ? messmassFontUrl(file) : null;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'messmass.com') parsed.hostname = 'www.messmass.com';
    return parsed.toString();
  } catch {
    return null;
  }
}
