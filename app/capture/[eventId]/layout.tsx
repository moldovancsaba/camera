import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ObjectId } from 'mongodb';
import { loadCaptureEvent } from '@/lib/events/capture-event';
import { pwaPageColor, pwaShortName } from '@/lib/pwa/event-manifest';
import { connectToDatabase } from '@/lib/db/mongodb';
import { loadEventTheme } from '@/lib/theme/load';
import EventThemeScope from '@/components/theme/EventThemeScope';
import UiLanguageProvider from '@/components/i18n/UiLanguageProvider';
import { normalizeUiLanguage, translate, type UiLanguage } from '@/lib/i18n';
import { loadEventTexts } from '@/lib/i18n/overrides';

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function metaDescription(event: {
  name: string;
  description?: string;
  location?: string;
  eventDate?: string;
}, language: UiLanguage): string {
  const raw =
    typeof event.description === 'string' ? event.description.trim() : '';
  if (raw) {
    const plain = stripHtml(raw);
    if (plain) return plain.length > 320 ? `${plain.slice(0, 317)}…` : plain;
  }
  const parts: string[] = [];
  if (typeof event.location === 'string' && event.location.trim()) {
    parts.push(event.location.trim());
  }
  if (typeof event.eventDate === 'string' && event.eventDate.trim()) {
    parts.push(event.eventDate.trim());
  }
  if (parts.length) {
    const line = `${event.name} — ${parts.join(' · ')}`;
    return line.length > 320 ? `${line.slice(0, 317)}…` : line;
  }
  return translate(language, 'meta.capture.description', { name: event.name });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  if (!ObjectId.isValid(eventId)) {
    return { title: translate('en', 'meta.capture.invalid') };
  }

  const event = await loadCaptureEvent(eventId);

  if (!event) {
    return { title: translate('en', 'meta.capture.notFound') };
  }

  const language = normalizeUiLanguage(event.uiLanguage);
  const name =
    typeof event.name === 'string' && event.name.trim()
      ? event.name.trim()
      : translate(language, 'meta.event');
  const description = metaDescription({
    name,
    description: event.description as string | undefined,
    location: event.location as string | undefined,
    eventDate: event.eventDate as string | undefined,
  }, language);

  const logoRaw =
    typeof event.logoUrl === 'string' ? event.logoUrl.trim() : '';
  const ogImages =
    logoRaw && /^https?:\/\//i.test(logoRaw)
      ? [{ url: logoRaw, alt: name }]
      : undefined;

  return {
    title: { absolute: name },
    description,
    // Installable per event (camera#222): the manifest starts and stays inside this event.
    manifest: `/capture/${eventId}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: pwaShortName(name), statusBarStyle: 'default' },
    // Next emits only the standard `mobile-web-app-capable` for `capable`; iOS Safari opens a Home Screen app without the browser bars
    // when it finds Apple's own tag, so both are sent.
    other: { 'apple-mobile-web-app-capable': 'yes' },
    openGraph: {
      title: name,
      description,
      type: 'website',
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: ogImages ? 'summary_large_image' : 'summary',
      title: name,
      description,
      ...(ogImages ? { images: [logoRaw] } : {}),
    },
  };
}

// viewport-fit=cover lets the installed app use the whole screen; the capture shells pad themselves
// with the safe-area insets (`.app-safe-area` in app/globals.css). The zoom policy stays the browser
// default here: only the camera steps lock zoom (components/capture/AppShellLock.tsx).
export async function generateViewport({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Viewport> {
  const { eventId } = await params;
  const event = await loadCaptureEvent(eventId);
  // The browser's toolbar takes the page colour of the event's theme, as the page itself does (camera#285).
  const theme = event ? await loadEventTheme(await connectToDatabase(), event).catch(() => null) : null;
  return { viewportFit: 'cover', themeColor: pwaPageColor(theme, event?.brandColor) };
}

export default async function CaptureEventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await loadCaptureEvent(eventId);
  if (!event) return children;
  // Every page of the guest journey is drawn with the theme of the event (camera#285).
  const db = await connectToDatabase();
  const theme = await loadEventTheme(db, event);
  // ... and in the language of the event (camera#352), with the wordings an admin wrote for the partner or the event (issue 353; none written: the code dictionary).
  const { overrides } = await loadEventTexts(db, event).catch(() => ({ overrides: {} }));
  return (
    <EventThemeScope theme={theme}>
      <UiLanguageProvider language={normalizeUiLanguage(event.uiLanguage)} texts={overrides}>{children}</UiLanguageProvider>
    </EventThemeScope>
  );
}
