import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function metaDescription(event: {
  name: string;
  description?: string;
  location?: string;
  eventDate?: string;
}): string {
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
  return `Photos and sharing for ${event.name}.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  if (!ObjectId.isValid(eventId)) {
    return { title: 'Capture' };
  }

  const db = await connectToDatabase();
  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ _id: new ObjectId(eventId) });

  if (!event) {
    return { title: 'Event not found' };
  }

  const name =
    typeof event.name === 'string' && event.name.trim()
      ? event.name.trim()
      : 'Event';
  const description = metaDescription({
    name,
    description: event.description as string | undefined,
    location: event.location as string | undefined,
    eventDate: event.eventDate as string | undefined,
  });

  const logoRaw =
    typeof event.logoUrl === 'string' ? event.logoUrl.trim() : '';
  const ogImages =
    logoRaw && /^https?:\/\//i.test(logoRaw)
      ? [{ url: logoRaw, alt: name }]
      : undefined;

  return {
    title: { absolute: name },
    description,
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

export default function CaptureEventLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
