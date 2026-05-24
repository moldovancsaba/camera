/**
 * Public Share Page
 * 
 * Displays shared photo submissions with Open Graph meta tags.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import type { Db } from 'mongodb';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicSurfaceShell from '@/components/gds/PublicSurfaceShell';
import { Button, Group, Stack, Text, Title } from '@mantine/core';

interface Props {
  params: Promise<{ id: string }>;
}

interface ShareSubmission {
  imageUrl: string;
  userName?: string;
  createdAt?: string;
  metadata?: {
    finalWidth?: number;
    finalHeight?: number;
  };
  eventIds?: unknown[];
  eventId?: unknown;
}

async function resolveEventForSubmission(
  db: Db,
  submission: Record<string, unknown>
): Promise<{ mongoId: string; name: string } | null> {
  const eventLookupKey =
    (Array.isArray(submission.eventIds) && submission.eventIds[0]) ||
    submission.eventId ||
    null;
  if (!eventLookupKey || !String(eventLookupKey).trim()) return null;
  const key = String(eventLookupKey).trim();
  const orClauses: Record<string, unknown>[] = [{ eventId: key }];
  if (ObjectId.isValid(key)) {
    orClauses.push({ _id: new ObjectId(key) });
  }
  const eventDoc = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ $or: orClauses });
  if (!eventDoc?._id) return null;
  const name =
    typeof eventDoc.name === 'string' && eventDoc.name.trim()
      ? eventDoc.name.trim()
      : 'Event';
  return { mongoId: eventDoc._id.toString(), name };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    const submission = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .findOne({ _id: new ObjectId(id) });

    if (!submission) {
      return {
        title: 'Photo Not Found',
      };
    }

    const event = await resolveEventForSubmission(db, submission);
    const eventLabel = event?.name ?? 'Shared photo';
    const userName =
      typeof submission.userName === 'string' ? submission.userName : 'Guest';

    return {
      title: `Photo by ${userName} — ${eventLabel}`,
      description: `Photo from ${eventLabel}`,
      openGraph: {
        title: `Photo by ${userName}`,
        description: `From ${eventLabel}`,
        images: [
          {
            url: submission.imageUrl,
            width: 1200,
            height: 1200,
            alt: `Photo by ${userName}`,
          },
        ],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: `Photo by ${userName}`,
        description: `From ${eventLabel}`,
        images: [submission.imageUrl],
      },
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'Photo',
    };
  }
}

export default async function SharePage({ params }: Props) {
  let submission: ShareSubmission | null = null;
  
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    const doc = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .findOne({ _id: new ObjectId(id) });
    if (doc && typeof doc.imageUrl === 'string') {
      submission = {
        imageUrl: doc.imageUrl,
        userName: typeof doc.userName === 'string' ? doc.userName : undefined,
        createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : undefined,
        metadata:
          doc.metadata && typeof doc.metadata === 'object'
            ? {
                finalWidth:
                  typeof (doc.metadata as { finalWidth?: unknown }).finalWidth === 'number'
                    ? (doc.metadata as { finalWidth: number }).finalWidth
                    : undefined,
                finalHeight:
                  typeof (doc.metadata as { finalHeight?: unknown }).finalHeight === 'number'
                    ? (doc.metadata as { finalHeight: number }).finalHeight
                    : undefined,
              }
            : undefined,
        eventIds: Array.isArray(doc.eventIds) ? doc.eventIds : undefined,
        eventId: doc.eventId,
      };
    }
  } catch (error) {
    console.error('Error fetching submission:', error);
  }

  if (!submission) {
    notFound();
  }

  const db = await connectToDatabase();
  const event = await resolveEventForSubmission(db, submission as unknown as Record<string, unknown>);

  // `/capture/[eventId]` expects the event document Mongo `_id`, while submissions often store public `eventId` UUID in `eventIds` / `eventId`.
  let createYourOwnHref = '/capture';
  if (event?.mongoId) {
    createYourOwnHref = `/capture/${event.mongoId}`;
  }

  const headline = event?.name ?? 'Shared photo';

  return (
    <PublicSurfaceShell size="lg">
      <Stack gap="xl">
        <Stack align="center" gap="xs" ta="center">
          <Title order={1}>{headline}</Title>
          <Text c="dimmed">
            Photo by{' '}
            <span className="font-semibold">{submission.userName}</span>
          </Text>
        </Stack>

        <div>
          <div 
            style={{
              position: 'relative',
              background: 'var(--mantine-color-gray-1)',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 16,
              marginInline: 'auto',
              aspectRatio: submission.metadata?.finalWidth && submission.metadata?.finalHeight 
                ? `${submission.metadata.finalWidth} / ${submission.metadata.finalHeight}`
                : '1',
              maxWidth: '100%',
            }}
          >
            <Image
              src={submission.imageUrl}
              alt="Shared photo"
              fill
              className="object-contain"
              unoptimized
            />
          </div>

          <Text size="sm" c="dimmed" ta="right" mb="lg">
            {submission.createdAt ? new Date(submission.createdAt).toLocaleDateString() : ''}
          </Text>

          <Group gap="md" grow>
            <Button component="a" href={submission.imageUrl} download target="_blank" rel="noopener noreferrer" color="cameraTeal" size="lg">
              💾 Download
            </Button>
            <Button component="a" href={createYourOwnHref} variant="default" size="lg">
              📸 Create Your Own
            </Button>
          </Group>
        </div>
      </Stack>
    </PublicSurfaceShell>
  );
}
