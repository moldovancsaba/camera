/**
 * Event Detail Page
 *
 * Display event details with partner info, assigned frames, and slideshows.
 * Inactive users are filtered from gallery and slideshow-related views.
 * Event styles inherit from partner defaults unless overridden at the event level.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { StatsStrip } from '@/components/gds/ClientWrappers';
import { Breadcrumbs, Button, Card, Code, Group, SimpleGrid, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import StyleSections, { type ThemeColours } from '@/components/admin/StyleSections';
import { loadEventTheme } from '@/lib/theme/load';
import SlideshowManager from '@/components/admin/SlideshowManager';
import SlideshowLayoutManager from '@/components/admin/SlideshowLayoutManager';
import LandingPageManager from '@/components/admin/LandingPageManager';
import ShortLinksPanel from '@/components/admin/ShortLinksPanel';
import EventExportControls from '@/components/admin/EventExportControls';
import DeleteEventButton from '@/components/admin/DeleteEventButton';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { loadGallerySubmissions } from '@/lib/gallery/submissions';
import { defaultCameraOrigin, defaultGoShortOrigin } from '@/lib/site-hosts';
import { getPartnerScopedAccessForEvent, isGlobalAdminSession } from '@/lib/partners/authorization';
import { collectEventSpecificStats, type EventSpecificStats } from '@/lib/events/stats';

interface EventFrameDetails {
  frameId: string;
  name?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  hashtags?: string[];
}

interface EventFrameAssignment {
  frameId: string;
  isActive?: boolean;
  frameDetails?: EventFrameDetails | null;
}

interface EventLogoAssignment {
  scenario?: string;
  isActive?: boolean;
}

interface EventDoc {
  _id: ObjectId;
  eventId: string;
  partnerId: string;
  partnerName: string;
  name: string;
  // Cross-ref to the messmass project this event belongs to (lib/db/schemas.ts
  // Event.messmassEventId) — read by fanmass, stored on this document already,
  // just never linked to before.
  messmassEventId?: string;
  /** The picture of the welcome page screen drawn from the default slideshow (lib/screen/welcome-screen-store.ts). */
  welcomeScreen?: { url: string; generatedAt: string };
  description?: string;
  eventDate?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
  isActive?: boolean;
  shortUrlSlug?: string;
  brandColor?: string | null;
  brandBorderColor?: string | null;
  brandColorsOverridden?: boolean;
  framesOverridden?: boolean;
  logosOverridden?: boolean;
  frames?: EventFrameAssignment[];
  logos?: EventLogoAssignment[];
}

interface PartnerDoc {
  _id: ObjectId;
}

interface SlideshowDoc {
  _id: ObjectId;
  [key: string]: unknown;
}

interface SlideshowLayoutDoc {
  _id: ObjectId;
  layoutId: string;
  name: string;
  isActive?: boolean;
  createdAt: string;
}

interface LandingPageDoc {
  _id: ObjectId;
  slug: string;
  title?: string | null;
  targetType?: 'slideshow' | 'layout';
  targetName?: string;
  isActive?: boolean;
  createdAt: string;
}

function EventInfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
      <Text size="sm" fw={700} miw={120}>
        {label}
      </Text>
      <Text size="sm" ta="right">
        {value}
      </Text>
    </Group>
  );
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    notFound();
  }

  let event: EventDoc | null = null;
  let partner: PartnerDoc | null = null;
  let photoCount = 0;
  let slideshows: SlideshowDoc[] = [];
  let slideshowLayouts: SlideshowLayoutDoc[] = [];
  let landingPages: LandingPageDoc[] = [];
  let eventStats: EventSpecificStats | null = null;
  let themeColours: ThemeColours | null = null;
  let dbError: string | null = null;
  const session = await getSession();
  let canManageEvent = isGlobalAdminSession(session);

  try {
    const db = await connectToDatabase();
    const eventAccess = await getPartnerScopedAccessForEvent(db, id, session!, 'viewer');
    if (!eventAccess.allowed) {
      redirect('/admin/events');
    }
    canManageEvent =
      isGlobalAdminSession(session) ||
      eventAccess.role === 'manager' ||
      eventAccess.role === 'admin';

    event = (await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) })) as EventDoc | null;
    if (!event) {
      notFound();
    }

    partner = (await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId })) as PartnerDoc | null;
    eventStats = await collectEventSpecificStats(db, event.eventId);
    // The colours the guests really get, from the same function the guest pages use, and where they come from (camera#380).
    try {
      const theme = await loadEventTheme(db, event as unknown as Record<string, unknown>);
      const style = (event as unknown as { frameDesign?: { context?: { style?: { name?: unknown } } } }).frameDesign?.context?.style;
      themeColours = { fill: theme.buttonBackground, label: theme.buttonText, ring: theme.buttonRing, source: theme.buttonSource, styleName: typeof style?.name === 'string' ? style.name : null };
    } catch (error) {
      console.error('Error resolving the event theme for the colours panel:', error);
    }

    // The gallery has its own page; the overview only says how many photos it holds (camera#488).
    photoCount = (await loadGallerySubmissions(db, event.eventId, 1)).total;

    slideshows = (await db
      .collection(COLLECTIONS.SLIDESHOWS)
      .find({ $or: [{ eventId: event.eventId }, { eventId: id }] })
      .sort({ createdAt: -1 })
      .toArray()) as SlideshowDoc[];

    slideshowLayouts = (await db
      .collection(COLLECTIONS.SLIDESHOW_LAYOUTS)
      .find({ eventId: event.eventId })
      .sort({ createdAt: -1 })
      .toArray()) as SlideshowLayoutDoc[];

    landingPages = (await db
      .collection(COLLECTIONS.LANDING_PAGES)
      .find({ eventMongoId: id })
      .sort({ createdAt: -1 })
      .toArray()) as LandingPageDoc[];

    if (event.frames && event.frames.length > 0) {
      const frameIds = event.frames.map((frame) => frame.frameId);
      const frames = (await db
        .collection(COLLECTIONS.FRAMES)
        .find({ frameId: { $in: frameIds } })
        .toArray()) as unknown as EventFrameDetails[];

      event.frames = event.frames.map((assignment) => {
        const frameDetails = frames.find((frame) => frame.frameId === assignment.frameId);
        return {
          ...assignment,
          frameDetails: frameDetails
            ? {
                frameId: frameDetails.frameId,
                name: frameDetails.name,
                thumbnailUrl: frameDetails.thumbnailUrl,
                imageUrl: frameDetails.imageUrl,
                width: frameDetails.width,
                height: frameDetails.height,
                hashtags: frameDetails.hashtags,
              }
            : null,
        };
      });
    }
  } catch (error) {
    console.error('Error fetching event details:', error);
    dbError = error instanceof Error ? error.message : 'Unknown error';
  }

  if (!event) {
    notFound();
  }

  return (
    <Stack gap="xl">
      <Breadcrumbs>
        <Link href="/admin/events">Events</Link>
        <Text>{event.name}</Text>
      </Breadcrumbs>

      <WorkspaceHeader
        eyebrow="Events"
        title={event.name}
        description={event.description}
        status={event.isActive ? 'Active' : 'Inactive'}
        actions={
          <>
            {event.messmassEventId ? (
              // WHAT: messmass has stored this event's camera identity since
              // provisioning (lib/db/schemas.ts Event.messmassEventId) but never
              // linked back. The reverse of the "Open in Camera" link added to
              // messmass's events list.
              <a
                href="https://messmass.com/admin/events"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
                title={`${event.name} was provisioned from messmass — open its events list`}
              >
                <Button variant="light">Open in messmass</Button>
              </a>
            ) : null}
            {canManageEvent ? (
              <Link href={`/admin/events/${id}/edit`} style={{ textDecoration: 'none' }}>
                <Button>Edit Event</Button>
              </Link>
            ) : null}
            {canManageEvent ? <DeleteEventButton eventId={id} eventName={event.name} /> : null}
          </>
        }
      />

      {dbError ? (
        <Card>
          <Text fw={700}>Error loading data</Text>
          <Text size="sm">{dbError}</Text>
        </Card>
      ) : null}

      <StatsStrip
        stats={[
          { label: 'Frames', value: event.frames?.length || 0 },
          { label: 'Total Images', value: eventStats?.totalSubmissions || 0 },
          { label: 'Customer Emails', value: eventStats?.cleanCustomerEmailsCount || 0 },
        ]}
      />

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Stack gap="lg">
          <Card>
            <Title order={3}>Partner</Title>
            <Text size="sm" fw={600} mt="md">
              {event.partnerName}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {partner ? <Link href={`/admin/partners/${partner._id}`}>View Partner →</Link> : 'Partner details unavailable'}
            </Text>
          </Card>

          <Card>
            <Title order={3}>📊 Event Engagement & Statistics</Title>
            {eventStats ? (
              <Stack gap="sm" mt="md">
                <EventInfoRow label="Total Images" value={eventStats.totalSubmissions} />
                <EventInfoRow label="Unique Emails" value={eventStats.uniqueEmailsCount} />
                <EventInfoRow label="Customer Emails" value={eventStats.cleanCustomerEmailsCount} />
              </Stack>
            ) : (
              <Text size="sm" c="dimmed" mt="md">Statistics unavailable</Text>
            )}
          </Card>

          <Card>
            <Title order={3}>Event Information</Title>
            <Stack gap="sm" mt="md">
              <EventInfoRow label="Event ID" value={<Code>{event.eventId}</Code>} />
              {event.eventDate ? (
                <EventInfoRow
                  label="Event Date"
                  value={new Date(event.eventDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                />
              ) : null}
              {event.location ? (
                <EventInfoRow label="Location" value={event.location} />
              ) : null}
              <EventInfoRow
                label="Created"
                value={new Date(event.createdAt).toLocaleString()}
              />
              <EventInfoRow
                label="Last Updated"
                value={new Date(event.updatedAt).toLocaleString()}
              />
            </Stack>
          </Card>

          <Card>
            <Title order={3}>📸 Event Capture URL</Title>
            <Text size="sm" c="dimmed" mt="xs" mb="md">
              Share this URL to let users take photos for this event
            </Text>
            <Card withBorder radius="md" p="md" bg="white">
              <Code block>{defaultCameraOrigin()}/capture/{id}</Code>
            </Card>
            <Link href={`/capture/${id}`} style={{ textDecoration: 'none' }}>
              <Button fullWidth mt="md">
                Open Capture Page →
              </Button>
            </Link>
            {typeof event.shortUrlSlug === 'string' && event.shortUrlSlug.trim() ? (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--mantine-color-default-border)' }}>
                <Text size="sm" fw={600} mb="xs">
                  Short link
                </Text>
                <Text size="xs" c="dimmed" mb="sm">
                  Redirects to the capture URL above (configure host on <Code>GO_SHORT_HOSTNAMES</Code>).
                </Text>
                <Card withBorder radius="md" p="md" bg="white">
                  <Code block>{defaultGoShortOrigin()}/{event.shortUrlSlug.trim()}</Code>
                </Card>
                <a href={`${defaultGoShortOrigin()}/${event.shortUrlSlug.trim()}`} target="_blank" rel="noopener noreferrer">
                  <Button fullWidth mt="sm">
                    Open short link →
                  </Button>
                </a>
              </div>
            ) : (
              <Text size="xs" c="dimmed" mt="md">
                Optional: set a short link slug under <strong>Edit Event</strong> for <Code>{defaultGoShortOrigin()}/…</Code>.
              </Text>
            )}
          </Card>

          <div style={{ gridColumn: '1 / -1' }}>
            <ShortLinksPanel eventId={id} />
          </div>

          <Card>
            <Title order={3}>Vetting</Title>
            <Text size="sm" c="dimmed" mt="xs" mb="md">
              Approve or reject the photos of this event.
            </Text>
            <Group grow>
              <Button component="a" href={`/admin/events/${id}/vetting`} variant="light">
                Open Vetting
              </Button>
            </Group>
          </Card>
        </Stack>

        <StyleSections
          type="event"
          id={id}
          brandColor={event.brandColor}
          brandBorderColor={event.brandBorderColor}
          brandColorsOverridden={event.brandColorsOverridden}
          themeColours={themeColours ?? undefined}
          frames={event.frames?.map((frame) => ({
            frameId: frame.frameId,
            isActive: frame.isActive !== false,
            frameDetails: frame.frameDetails ?? null,
          }))}
          framesOverridden={event.framesOverridden}
          logos={(event.logos || []).map((logo, index) => ({
            logoId: `${logo.scenario || index}`,
            scenario: logo.scenario,
            isActive: logo.isActive !== false,
          }))}
          logosOverridden={event.logosOverridden}
          partnerName={event.partnerName}
        />
      </SimpleGrid>

      <SlideshowManager eventId={id} initialSlideshows={JSON.parse(JSON.stringify(slideshows))} welcomeScreen={event.welcomeScreen ? { url: event.welcomeScreen.url, generatedAt: event.welcomeScreen.generatedAt } : null} />

      <SlideshowLayoutManager
        eventMongoId={id}
        initialLayouts={slideshowLayouts.map((layout) => ({
          _id: layout._id!.toString(),
          layoutId: layout.layoutId,
          name: layout.name,
          isActive: layout.isActive !== false,
          createdAt: layout.createdAt,
        }))}
      />

      <LandingPageManager
        eventMongoId={id}
        initialLandingPages={landingPages.map((page) => ({
          _id: page._id!.toString(),
          slug: page.slug,
          title: page.title ?? null,
          targetType: page.targetType === 'layout' ? 'layout' : 'slideshow',
          targetName: page.targetName ?? page.slug,
          isActive: page.isActive !== false,
          createdAt: page.createdAt,
        }))}
      />

      <Card>
        <Group justify="space-between" align="center" wrap="wrap">
          <div>
            <Title order={2}>Event Gallery</Title>
            <Text c="dimmed" mt="xs">
              {photoCount} photo{photoCount === 1 ? '' : 's'} visible in the event&apos;s slideshows
            </Text>
          </div>
          <Link href={`/admin/events/${id}/gallery`} style={{ textDecoration: 'none' }}>
            <Button>Open the gallery</Button>
          </Link>
        </Group>
      </Card>

      {canManageEvent ? <EventExportControls eventId={id} /> : null}
    </Stack>
  );
}
