import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Card, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import DataTable from '@/components/gds/DataTable';
import StatusBadge from '@/components/gds/StatusBadge';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';

interface LandingPageInventoryItem {
  _id: { toString(): string };
  slug: string;
  title?: string | null;
  eventMongoId: string;
  eventId: string;
  eventName: string;
  targetType: 'slideshow' | 'layout';
  targetName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EventLookup {
  eventId: string;
  partnerId?: string;
  partnerName?: string;
}

export default async function LandingPagesInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; partner?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let landingPages: LandingPageInventoryItem[] = [];
  let eventLookup = new Map<string, EventLookup>();
  let dbError: unknown = null;

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const partnerFilter = typeof resolvedSearchParams?.partner === 'string' ? resolvedSearchParams.partner.trim() : '';

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = {};

    if (search) {
      query.$or = [
        { slug: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { eventName: { $regex: search, $options: 'i' } },
        { targetName: { $regex: search, $options: 'i' } },
      ];
    }

    landingPages = (await db
      .collection(COLLECTIONS.LANDING_PAGES)
      .find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(200)
      .toArray()) as unknown as LandingPageInventoryItem[];

    const eventIds = [...new Set(landingPages.map((page) => page.eventId).filter(Boolean))];
    if (eventIds.length > 0) {
      const events = (await db.collection(COLLECTIONS.EVENTS).find({ eventId: { $in: eventIds } }).toArray()) as unknown as EventLookup[];
      eventLookup = new Map(events.map((event) => [event.eventId, event]));
    }

    if (partnerFilter) {
      const lowered = partnerFilter.toLowerCase();
      landingPages = landingPages.filter((page) => (eventLookup.get(page.eventId)?.partnerName || '').toLowerCase() === lowered);
    }
  } catch (error) {
    dbError = error;
  }

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Resource Inventory"
        title="Landing Pages"
        description="Shared experience surfaces across Camera Core. Each landing page belongs to an event today, but this inventory makes ownership, embedded targets, and public URLs manageable from one place."
      />

      {!dbError ? (
        <SimpleGrid cols={{ base: 1, xl: 3 }}>
          <Card bg="cyan.0">
            <Text fw={700} c="cyan.9">
              Shared resource
            </Text>
            <Text size="sm" c="cyan.8" mt="sm">
              Landing pages are now visible as first-class Camera Core assets instead of living only inside event detail pages.
            </Text>
          </Card>
          <Card bg="blue.0">
            <Text fw={700} c="blue.9">
              Current inventory
            </Text>
            <Text size="sm" c="blue.8" mt="sm">
              {landingPages.length} landing page{landingPages.length === 1 ? '' : 's'} matched the current filters.
            </Text>
          </Card>
          <Card bg="green.0">
            <Text fw={700} c="green.9">
              Editing model
            </Text>
            <Text size="sm" c="green.8" mt="sm">
              Create and edit pages from their parent event today. Use this inventory to find ownership, public URLs, and embedded slideshow/layout relationships globally.
            </Text>
          </Card>
        </SimpleGrid>
      ) : null}

      <Card>
        <form>
          <Group align="end">
            <TextInput name="search" defaultValue={search} placeholder="Search slug, title, event, or embedded target" label="Search" style={{ flex: 1 }} />
            <TextInput name="partner" defaultValue={partnerFilter} placeholder="Exact partner name filter" label="Partner" />
            <Button type="submit">Search</Button>
            {search || partnerFilter ? (
              <Link href="/admin/landing-pages" style={{ textDecoration: 'none' }}>
                <Button variant="default">Clear</Button>
              </Link>
            ) : null}
          </Group>
        </form>
      </Card>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && landingPages.length === 0 ? (
        <Card>
          <Stack align="center" gap="sm">
            <Text fz={48}>🌐</Text>
            <Text fw={700} fz="lg">
              No landing pages found
            </Text>
            <Text c="dimmed" ta="center">
              Create a landing page from an event workspace, then manage and audit it here.
            </Text>
          </Stack>
        </Card>
      ) : null}

      {!dbError && landingPages.length > 0 ? (
        <DataTable
          columns={[
            { key: 'landingPage', title: 'Landing Page' },
            { key: 'ownership', title: 'Partner / Event' },
            { key: 'target', title: 'Embedded Target' },
            { key: 'status', title: 'Status' },
            { key: 'actions', title: 'Actions', align: 'right' },
          ]}
        >
          {landingPages.map((page) => {
            const ownerEvent = eventLookup.get(page.eventId);
            return (
              <tr key={page._id.toString()} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                  <Text fw={700}>{page.title?.trim() || page.slug}</Text>
                  <Text size="xs" c="dimmed" mt={4}>
                    /landing/{page.slug}
                  </Text>
                  <Text size="xs" c="dimmed" mt="sm">
                    Updated {new Date(page.updatedAt || page.createdAt).toLocaleDateString()}
                  </Text>
                </td>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                  <Text size="sm" fw={600}>
                    {ownerEvent?.partnerName || 'Unknown partner'}
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {page.eventName}
                  </Text>
                </td>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                  <Text size="sm">{page.targetType === 'layout' ? 'Layout' : 'Slideshow'}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {page.targetName}
                  </Text>
                </td>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                  <StatusBadge tone={page.isActive ? 'active' : 'inactive'} />
                </td>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top', textAlign: 'right' }}>
                  <Group gap="sm" justify="flex-end">
                    <Link href={`/admin/events/${page.eventMongoId}`}>Open Event</Link>
                    <Link href={`/admin/events/${page.eventMongoId}/landing-pages/${page._id}`}>Edit</Link>
                    <Link href={`/landing/${page.slug}`} target="_blank">
                      Open
                    </Link>
                  </Group>
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : null}
    </Stack>
  );
}
