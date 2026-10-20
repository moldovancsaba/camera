import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { Breadcrumbs, Button, Card, Stack, Text } from '@/components/gds/PublicPrimitives';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import PhotoAnalysisCompletedList from '@/components/admin/PhotoAnalysisCompletedList';
import FanmassPhotoResultsList from '@/components/admin/FanmassPhotoResultsList';
import FanmassStatusAutoRefresh from '@/components/admin/FanmassStatusAutoRefresh';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { countPhotoAnalysisQueue, loadPhotoAnalysisQueue, type PhotoAnalysisTab } from '@/lib/photo-vetting/queue';
import { loadEventVocabulary } from '@/lib/photo-vetting/vocabulary-load';
import { loadFanmassEventAnalysisPage, type FanmassEventAnalysisPage } from '@/lib/fanmass/photo-results';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;
type AnalysisPageTab = PhotoAnalysisTab;
const TABS: readonly AnalysisPageTab[] = ['needs_analysis', 'analysed'];
const isAnalysisTab = (value: string | undefined): value is AnalysisPageTab => Boolean(value && TABS.includes(value as AnalysisPageTab));

function FanmassStatusSummary({ data }: { data: FanmassEventAnalysisPage }) {
  const working = data.queueCounts.queued + data.queueCounts.leased + data.queueCounts.processing + data.queueCounts.retry;
  const failed = data.queueCounts.failed + data.queueCounts.cancelled + data.missingResults;
  const cards = [
    ['Camera submission records', data.totalCameraSubmissions],
    ['Journeys reached camera (not saved-photo count)', data.welcomeToCameraTransitions],
    ['Approved decisions', data.approvedPhotos],
    ['Approved · consent received', data.approvedWithConsent],
    ['Approved · consent pending', data.approvedAwaitingConsent],
    ['Approved · consent expired and erased', data.approvedConsentExpired],
    ['Approved · consent status missing', data.approvedConsentUnknown],
    ['Rejected decisions · not sent to AI', data.rejectedPhotos],
    ['Rejected · consent received', data.rejectedWithConsent],
    ['Rejected · consent pending', data.rejectedAwaitingConsent],
    ['Rejected · consent expired and erased', data.rejectedConsentExpired],
    ['Rejected · consent status missing', data.rejectedConsentUnknown],
    ['Decisions blocked from Fanmass by consent status', data.consentBlockedDecisions],
    ['Photos currently on consent hold', data.consentPendingPhotos],
    ['Photos erased after consent expired', data.consentExpiredPhotos],
    ['Photos with missing consent status · held', data.consentUnknownPhotos],
    ['Eligible for Fanmass', data.eligiblePhotos],
    ['Waiting for Fanmass discovery', data.awaitingDiscovery],
    ['Fanmass analysed', data.completedResults],
    ['Queued / working / retrying', working],
    ['Failed / cancelled / missing result', failed],
    ['People estimate total', data.peopleEstimates],
    ['Individual people boxes', data.peopleBoxes],
    ['Delivered to Messmass', data.deliveries.delivered ?? 0],
  ] as const;
  return (
    <Card>
      <Stack gap="sm">
        <Text fw={700}>Fanmass per-photo status</Text>
        <Text size="sm" c="dimmed">Fanmass processes one eligible photo at a time. Journey transitions count people reaching the camera step; submission records count persisted submissions and may remain after their image is erased for missing consent. A transition can happen without a photo being saved. The consent breakdown below reconciles approved and rejected decisions, and photos waiting for consent, expired consent, or missing consent proof stay outside the AI queue. This status refreshes every 10 seconds while the page is open.</Text>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}>
          {cards.map(([label, value]) => (
            <div key={label} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
              <Text size="xs" c="dimmed">{label}</Text>
              <Text fw={700}>{value}</Text>
            </div>
          ))}
        </div>
      </Stack>
    </Card>
  );
}

export default async function EventPhotoAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photos?: string; page?: string; fanmassPage?: string }>;
}) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const query = await searchParams;
  // Keep any in-development Fanmass link pointed at the existing Analysed workbench.
  const tab: AnalysisPageTab = query.photos === 'fanmass' ? 'analysed' : isAnalysisTab(query.photos) ? query.photos : 'needs_analysis';
  const requestedPage = Number.parseInt(query.page ?? '1', 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedFanmassPage = Number.parseInt(query.fanmassPage ?? (query.photos === 'fanmass' ? query.page : undefined) ?? '1', 10);
  const fanmassPageNumber = Number.isFinite(requestedFanmassPage) && requestedFanmassPage > 0 ? requestedFanmassPage : 1;

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  const eventUuid = String(event.eventId ?? '');
  const [counts, vocabulary] = await Promise.all([countPhotoAnalysisQueue(db, eventUuid), loadEventVocabulary(db, event)]);
  let fanmassPage: FanmassEventAnalysisPage | null = null;
  let fanmassUnavailable = false;
  if (tab === 'analysed') {
    try {
      fanmassPage = await loadFanmassEventAnalysisPage(db, eventUuid, event, { page: fanmassPageNumber, pageSize: PAGE_SIZE });
    } catch {
      fanmassUnavailable = true;
    }
  }
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
          const label = current === 'needs_analysis' ? `Needs analysis (${counts.needs_analysis})` : `Analysed (${counts.analysed})`;
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
              {label}
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
      ) : (
        <Stack gap="xl">
          <section aria-labelledby="fanmass-results-heading" style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <Text fw={700} id="fanmass-results-heading">Fanmass results by photo</Text>
              <Text size="sm" c="dimmed">Each card shows the source image, one-photo queue status, people detected, and whether a human reviewer confirmed the exact result.</Text>
            </div>
            {fanmassUnavailable ? (
              <Card>
                <Text fw={700}>Fanmass status is unavailable</Text>
                <Text size="sm" c="dimmed" mt="xs">Camera could not read the Fanmass queue database. No photos are marked as complete or failed based on this unavailable read.</Text>
              </Card>
            ) : fanmassPage ? (
              <Stack gap="md">
                <FanmassStatusSummary data={fanmassPage} />
                <FanmassPhotoResultsList eventId={id} items={fanmassPage.items} />
                {fanmassPage.pages > 1 ? (
                  <nav aria-label="Fanmass photos pages" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    {fanmassPage.page > 1 ? <Link href={`/admin/events/${id}/analysis?photos=analysed&fanmassPage=${fanmassPage.page - 1}`}>Previous Fanmass photos</Link> : <span />}
                    <Text size="sm" c="dimmed">Fanmass page {fanmassPage.page} of {fanmassPage.pages}</Text>
                    {fanmassPage.page < fanmassPage.pages ? <Link href={`/admin/events/${id}/analysis?photos=analysed&fanmassPage=${fanmassPage.page + 1}`}>Next Fanmass photos</Link> : <span />}
                  </nav>
                ) : null}
                <FanmassStatusAutoRefresh />
              </Stack>
            ) : null}
          </section>

          <section aria-labelledby="camera-analysis-heading" style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <Text fw={700} id="camera-analysis-heading">Human photo analysis</Text>
              <Text size="sm" c="dimmed">This existing list records the people markings made in Camera.</Text>
            </div>
            {counts.analysed === 0 ? (
              <Card>
                <Text fw={700}>No human analysis saved yet</Text>
                <Text size="sm" c="dimmed" mt="xs">Photos appear here after someone saves their people markings.</Text>
              </Card>
            ) : (
              <>
                <Card>
                  <Text size="sm" c="dimmed">
                    Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, counts.analysed)} of {counts.analysed} human-analysed photos.
                  </Text>
                </Card>
                <PhotoAnalysisCompletedList eventId={id} items={items} />
                {pages > 1 ? (
                  <nav aria-label="Human-analysed photos pages" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    {currentPage > 1 ? <Link href={`/admin/events/${id}/analysis?photos=analysed&page=${currentPage - 1}`}>Previous human-analysed photos</Link> : <span />}
                    <Text size="sm" c="dimmed">Page {currentPage} of {pages}</Text>
                    {currentPage < pages ? <Link href={`/admin/events/${id}/analysis?photos=analysed&page=${currentPage + 1}`}>Next human-analysed photos</Link> : <span />}
                  </nav>
                ) : null}
              </>
            )}
          </section>
        </Stack>
      )}
    </Stack>
  );
}
