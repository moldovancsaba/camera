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
import { brokenAddresses, pictureOrNull } from '@/lib/media/pictures';
import { welcomeButtonColours } from '@/lib/theme/welcome-buttons';

// The function lives in its own file (no imports) so that a light module can read it without the loader's imports; it is still exported from here for its tests and callers.
export { welcomeButtonColours };

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
  // A logo or footer picture that its host no longer has is left out, never shown as an error (issue 514, CLAUDE.md section 9); the e-mails, the share page and every guest page read the theme from here.
  const broken = await brokenAddresses(db);
  return { ...theme, logoUrl: pictureOrNull(theme.logoUrl, broken), emailFooterImageUrl: pictureOrNull(theme.emailFooterImageUrl, broken), font: { ...theme.font, url: browserFontUrl(theme.font.file) } };
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
