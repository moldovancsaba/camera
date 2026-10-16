import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { Breadcrumbs, Button, Card, Stack, Text } from '@/components/gds/PublicPrimitives';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import PhotoAnalysisCompletedList from '@/components/admin/PhotoAnalysisCompletedList';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { countPhotoAnalysisQueue, loadPhotoAnalysisQueue, type PhotoAnalysisTab } from '@/lib/photo-vetting/queue';
import { loadEventVocabulary } from '@/lib/photo-vetting/vocabulary-load';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;
const TABS: readonly PhotoAnalysisTab[] = ['needs_analysis', 'analysed'];
const isAnalysisTab = (value: string | undefined): value is PhotoAnalysisTab => Boolean(value && TABS.includes(value as PhotoAnalysisTab));

export default async function EventPhotoAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photos?: string; page?: string }>;
}) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const query = await searchParams;
  const tab: PhotoAnalysisTab = isAnalysisTab(query.photos) ? query.photos : 'needs_analysis';
  const requestedPage = Number.parseInt(query.page ?? '1', 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  const eventUuid = String(event.eventId ?? '');
  const [counts, vocabulary] = await Promise.all([countPhotoAnalysisQueue(db, eventUuid), loadEventVocabulary(db, event)]);
  const pages = Math.max(1, Math.ceil(counts.analysed / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const items = tab === 'analysed' ? await loadPhotoAnalysisQueue(db, eventUuid, tab, vocabulary, PAGE_SIZE, (currentPage - 1) * PAGE_SIZE) : [];

  return (
    <Stack gap="lg" data-event-photo-analysis>
      <Breadcrumbs>
        <Link href="/admin/events">Events</Link>
        <Link href={`/admin/events/${id}`}>{String(event.name ?? 'Event')}</Link>
        <Text>Photo analysis</Text>
      </Breadcrumbs>

      <WorkspaceHeader
        eyebrow="Events"
        title={`${String(event.name ?? 'Event')} — Photo analysis`}
        description="Analyse photos after their vetting decision, or analyse every eligible photo when vetting is off. Saving analysis never changes vetting, publication, or email."
        status={event.isActive === false ? 'Inactive' : 'Active'}
      />

      <nav aria-label="Photo analysis status" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {TABS.map((current) => {
          const active = tab === current;
          const label = current === 'needs_analysis' ? 'Needs analysis' : 'Analysed';
          return (
            <Link
              key={current}
              href={`/admin/events/${id}/analysis?photos=${current}`}
              aria-current={active ? 'page' : undefined}
              style={{
                borderRadius: 8,
                padding: '0.45rem 0.75rem',
                fontSize: '0.875rem',
                fontWeight: active ? 700 : 500,
                textDecoration: 'none',
                background: active ? 'var(--mantine-color-blue-0)' : 'transparent',
                color: active ? 'var(--mantine-color-blue-7)' : 'var(--mantine-color-dimmed)',
              }}
            >
              {label} ({counts[current]})
            </Link>
          );
        })}
      </nav>

      {tab === 'needs_analysis' ? (
        counts.needs_analysis === 0 ? (
          <Card>
            <Text fw={700}>No photos need analysis</Text>
            <Text size="sm" c="dimmed" mt="xs">When photos are ready to analyse, they will appear here. Photos waiting for a vetting decision or consent stay out of this queue.</Text>
          </Card>
        ) : (
          <Card>
            <Stack gap="sm">
              <Text fw={700}>{counts.needs_analysis} photo{counts.needs_analysis === 1 ? '' : 's'} need analysis</Text>
              <Text size="sm" c="dimmed">Start with the oldest eligible photo. After each save, the next photo opens automatically; more photos load as you work through the event.</Text>
              <Text size="sm" c="dimmed">Photos waiting for a vetting decision or consent are not included. Analysis does not change whether a photo is published or send an email.</Text>
              <Link href={`/admin/events/${id}/analysis/review`} style={{ textDecoration: 'none', width: 'fit-content' }}>
                <Button>Start analysis</Button>
              </Link>
            </Stack>
          </Card>
        )
      ) : counts.analysed === 0 ? (
        <Card>
          <Text fw={700}>No analysed photos yet</Text>
          <Text size="sm" c="dimmed" mt="xs">Photos appear here after someone saves their analysis.</Text>
        </Card>
      ) : (
        <>
          <Card>
            <Text size="sm" c="dimmed">
              Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, counts.analysed)} of {counts.analysed} analysed photos.
            </Text>
          </Card>
          <PhotoAnalysisCompletedList eventId={id} items={items} />
          {pages > 1 ? (
            <nav aria-label="Analysed photos pages" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              {currentPage > 1 ? <Link href={`/admin/events/${id}/analysis?photos=analysed&page=${currentPage - 1}`}>Previous photos</Link> : <span />}
              <Text size="sm" c="dimmed">Page {currentPage} of {pages}</Text>
              {currentPage < pages ? <Link href={`/admin/events/${id}/analysis?photos=analysed&page=${currentPage + 1}`}>Next photos</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </Stack>
  );
}
