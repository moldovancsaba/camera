/**
 * Loads the theme of an event for a server render (camera#285): its messmass style snapshot, or for an event without one camera's own
 * name and partner logo with the system default look. Shared by the event API, the capture layout and the share page.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { nativeFrameContext, type FrameContext } from '@/lib/frame/context';
import { messmassFontUrl } from '@/lib/messmassClient';
import { resolveEventTheme, type EventTheme } from '@/lib/theme/event-theme';
import { storedPartnerPictures } from '@/lib/events/partner-pictures';

/** The colours of the Start button on the event's active welcome page (fill, label, ring), if it has set any: the whole flow's buttons look like it. */
export function welcomeButtonColours(pages: unknown): { fill?: unknown; label?: unknown; ring?: unknown } | null {
  const welcome = (Array.isArray(pages) ? pages : [])
    .filter((page): page is { pageType: string; isActive?: boolean; order?: number; config?: Record<string, unknown> } => !!page && typeof page === 'object' && (page as { pageType?: unknown }).pageType === 'welcome' && (page as { isActive?: unknown }).isActive !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  const config = welcome?.config;
  return config ? { fill: config.buttonColor, label: config.buttonTextColor, ring: config.buttonBorderColor } : null;
}

async function partnerEmailFooter(db: Db, event: Document): Promise<string | null> {
  if (typeof event.partnerId !== 'string' || !event.partnerId) return null;
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId }, { projection: { pictures: 1 } });
  return storedPartnerPictures(partner?.pictures).emailFooter ?? null;
}

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
  // The e-mail footer picture is the event's own, else its partner's default (lib/events/partner-pictures.ts, issue 368): one small read, only for an event with none.
  const emailFooterImageUrl = typeof event.emailFooterImageUrl === 'string' && event.emailFooterImageUrl ? event.emailFooterImageUrl : await partnerEmailFooter(db, event);
  const theme = resolveEventTheme({ buttons: welcomeButtonColours(event.customPages), brandColor: typeof event.brandColor === 'string' ? event.brandColor : null, brandBorderColor: typeof event.brandBorderColor === 'string' ? event.brandBorderColor : null, context, emailFooterImageUrl });
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
