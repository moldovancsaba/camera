import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { Card, SimpleGrid, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import PublicShell from '@/components/public/PublicPageShell';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type Event, type Submission } from '@/lib/db/schemas';
import { normalizeImgbbDirectUrl } from '@/lib/imgbb/url';

interface Props {
  params: Promise<{ slug: string }>;
}

interface GreatestHitCard {
  id: string;
  imageUrl: string;
  userName: string;
  eventName: string;
  createdAt: string | null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function displayName(value: unknown): string {
  const normalized = readString(value);
  if (!normalized || normalized.toLowerCase() === 'event guest' || normalized.includes('@')) {
    return 'Guest';
  }
  return normalized;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadGreatestHits(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const db = await connectToDatabase();
  const event = await db.collection<Event>(COLLECTIONS.EVENTS).findOne({
    greatestHitsSlug: normalizedSlug,
    isActive: { $ne: false },
  });

  if (!event?._id) return null;

  const eventObjectId = event._id instanceof ObjectId ? event._id : new ObjectId(event._id);
  const eventKeys = [eventObjectId.toString(), event.eventId].filter((value): value is string => Boolean(value));
  const eventQuery = [
    { eventId: { $in: eventKeys } },
    { eventIds: { $in: eventKeys } },
  ];

  const submissions = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .find({
      submissionKind: 'tryon_result',
      reviewStatus: 'approved',
      isShareVisible: true,
      'tryOnModerationArchive.archived': true,
      'tryOnModerationArchive.bucket': 'approved',
      'metadata.tryOnGreat': true,
      $or: eventQuery,
    })
    .sort({ approvedAt: -1, createdAt: -1 })
    .limit(200)
    .toArray();

  const hits: GreatestHitCard[] = submissions
    .map((submission) => {
      const imageUrl =
        normalizeImgbbDirectUrl(submission.finalImageUrl ?? null) ??
        normalizeImgbbDirectUrl(submission.imageUrl ?? null);
      if (!imageUrl || !submission._id) return null;
      return {
        id: submission._id.toString(),
        imageUrl,
        userName: displayName(submission.userName),
        eventName: readString(submission.eventName) ?? event.name,
        createdAt: readString(submission.approvedAt) ?? readString(submission.createdAt),
      };
    })
    .filter((value): value is GreatestHitCard => Boolean(value));

  return { event, hits };
}

export default async function GreatestHitsPage({ params }: Props) {
  const { slug } = await params;
  const result = await loadGreatestHits(slug);
  if (!result) {
    notFound();
  }

  const { event, hits } = result;

  return (
    <PublicShell size="xl">
      <Stack gap="xl">
        <Stack align="center" gap="xs" ta="center">
          <Text size="sm" fw={800} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.14em' }}>
            Greatest Hits
          </Text>
          <Title order={1}>{event.name}</Title>
        </Stack>

        {hits.length > 0 ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
            {hits.map((hit) => {
              const dateLabel = formatDate(hit.createdAt);
              return (
                <a
                  key={hit.id}
                  href={`/share/${hit.id}`}
                  style={{
                    background:
                      'linear-gradient(135deg, var(--mantine-color-violet-2), var(--mantine-color-cyan-1))',
                    borderRadius: 22,
                    boxShadow:
                      '0 14px 32px color-mix(in srgb, var(--mantine-color-violet-7) 16%, transparent), 0 0 0 1px color-mix(in srgb, var(--mantine-color-violet-7) 16%, transparent)',
                    color: 'inherit',
                    display: 'block',
                    padding: 2,
                    textDecoration: 'none',
                  }}
                >
                  <Card radius="lg" p="md" style={{ height: '100%' }}>
                    <Stack gap="sm">
                      <div
                        style={{
                          position: 'relative',
                          width: 'min(100%, 400px)',
                          height: 600,
                          maxHeight: 600,
                          marginInline: 'auto',
                          borderRadius: 18,
                          overflow: 'hidden',
                          background: 'var(--mantine-color-gray-0)',
                        }}
                      >
                        <Image
                          src={hit.imageUrl}
                          alt={`${hit.userName} greatest hit`}
                          fill
                          unoptimized
                          style={{ objectFit: 'contain' }}
                        />
                      </div>
                      <Stack gap={2}>
                        <Text fw={800}>{hit.userName}</Text>
                        <Text size="sm" c="dimmed">
                          {hit.eventName}
                        </Text>
                        {dateLabel ? (
                          <Text size="xs" c="dimmed">
                            {dateLabel}
                          </Text>
                        ) : null}
                      </Stack>
                    </Stack>
                  </Card>
                </a>
              );
            })}
          </SimpleGrid>
        ) : (
          <Card radius="lg" p="xl" ta="center">
            <Title order={2}>No Greatest Hits yet</Title>
            <Text c="dimmed" mt="sm">
              Selected images will appear here after the event team marks approved results as Great.
            </Text>
          </Card>
        )}
      </Stack>
    </PublicShell>
  );
}
