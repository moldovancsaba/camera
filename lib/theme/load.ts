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
import { filterUnavailableVisualAssetUrls } from '@/lib/visual-assets/filter';

// The function lives in its own file (no imports) so that a light module can read it without the loader's imports; it is still exported from here for its tests and callers.
export { welcomeButtonColours };

async function partnerEmailFooter(partner: Document | null): Promise<string | null> {
  if (!partner) return null;
  return storedPartnerPictures(partner?.pictures).emailFooter ?? null;
}

export async function loadEventTheme(db: Db, event: Document): Promise<EventTheme> {
  const partner = typeof event.partnerId === 'string' && event.partnerId
    ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId })
    : null;
  let context = (event.frameDesign as { context?: FrameContext } | undefined)?.context ?? null;
  if (!context) {
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
  const emailFooterImageUrl = typeof event.emailFooterImageUrl === 'string' && event.emailFooterImageUrl ? event.emailFooterImageUrl : await partnerEmailFooter(partner);
  const theme = resolveEventTheme({ buttons: welcomeButtonColours(event.customPages), brandColor: typeof event.brandColor === 'string' ? event.brandColor : null, brandBorderColor: typeof event.brandBorderColor === 'string' ? event.brandBorderColor : null, context, emailFooterImageUrl });
  // This shared loader serves capture pages, e-mails, screens and slideshows;
  // resolve inherited library URLs here so every public consumer sees the same
  // parent sharing policy (rather than relying on one API response to filter it).
  const visibleTheme = await filterUnavailableVisualAssetUrls(db, theme, event, partner);
  // A logo or footer picture that its host no longer has is left out, never shown as an error (issue 514, CLAUDE.md section 9).
  const broken = await brokenAddresses(db);
  return { ...visibleTheme, logoUrl: pictureOrNull(visibleTheme.logoUrl, broken), emailFooterImageUrl: pictureOrNull(visibleTheme.emailFooterImageUrl, broken), font: { ...visibleTheme.font, url: browserFontUrl(visibleTheme.font.file) } };
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
