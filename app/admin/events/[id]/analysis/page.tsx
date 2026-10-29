import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { Breadcrumbs, Card, Stack, Text } from '@/components/gds/PublicPrimitives';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import VisibilityStatusIcon from '@/components/gds/VisibilityStatusIcon';
import FanmassPhotoResultsList from '@/components/admin/FanmassPhotoResultsList';
import FanmassStatusAutoRefresh from '@/components/admin/FanmassStatusAutoRefresh';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { loadFanmassEventAnalysisPage, type FanmassEventAnalysisPage } from '@/lib/fanmass/photo-results';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;

function FanmassStatusSummary({ data }: { data: FanmassEventAnalysisPage }) {
  const groups = [
    {
      title: 'Photo processing',
      cards: [
        ['Eligible for Fanmass', data.eligiblePhotos],
        ['Waiting for Fanmass discovery', data.awaitingDiscovery],
        ['Queued', data.queueCounts.queued],
        ['Starting · leased', data.queueCounts.leased],
        ['In progress now', data.queueCounts.processing],
        ['Retrying', data.queueCounts.retry],
        ['Fanmass analysed', data.completedResults],
        ['Completed but result missing', data.missingResults],
        ['Failed', data.queueCounts.failed],
        ['Cancelled', data.queueCounts.cancelled],
      ],
    },
    {
      title: 'Delivery to Messmass',
      cards: [
        ['Queued', data.deliveries.queued ?? 0],
        ['Sending', data.deliveries.sending ?? 0],
        ['Retrying', data.deliveries.retry ?? 0],
        ['Results delivered to Messmass', data.deliveries.delivered ?? 0],
        ['Failed deliveries', data.deliveries.failed ?? 0],
      ],
    },
    {
      title: 'Vetting and consent',
      cards: [
        ['Camera submission records (includes erasure tombstones)', data.totalCameraSubmissions],
        ['Deleted manually', data.deletedManually],
        ['Deleted automatically · no login', data.deletedAutomaticallyNoLogin],
        ['Deleted automatically · no consent / other', data.deletedAutomaticallyOther],
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
        ['Decisions blocked by consent status', data.consentBlockedDecisions],
        ['Photos currently on consent hold', data.consentPendingPhotos],
        ['Photos erased after consent expired', data.consentExpiredPhotos],
        ['Photos with missing consent status · held', data.consentUnknownPhotos],
      ],
    },
    {
      title: 'Analysis signals from completed photos',
      cards: [
        ['People estimate · Fanmass model', data.peopleEstimates],
        ['Individual people boxes · returned', data.peopleBoxes],
      ],
    },
  ] as const;

  return (
    <Card>
      <Stack gap="sm">
        <Text fw={700}>Fanmass per-photo status</Text>
        <Text size="sm" c="dimmed">
          Fanmass processes one eligible photo at a time. Human review, corrections, and confirmation are attached to that photo’s Fanmass result. Queue counts are scoped to photos that pass Camera’s consent, retention, image-health, and vetting rules. Camera submission totals can include minimal deletion tombstones. This status refreshes every 10 seconds while the page is open.
        </Text>
        {groups.map((group) => (
          <section key={group.title} aria-label={group.title} style={{ display: 'grid', gap: '0.5rem' }}>
            <Text fw={600} size="sm">{group.title}</Text>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}>
              {group.cards.map(([label, value]) => (
                <div key={label} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                  <Text size="xs" c="dimmed">{label}</Text>
                  <Text fw={700}>{value}</Text>
                </div>
              ))}
            </div>
          </section>
        ))}
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
  const requestedPage = Number.parseInt(query.fanmassPage ?? query.page ?? '1', 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect('/admin/events/' + id);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  const eventUuid = String(event.eventId ?? '');
  let data: FanmassEventAnalysisPage | null = null;
  try {
    data = await loadFanmassEventAnalysisPage(db, eventUuid, event, { page, pageSize: PAGE_SIZE });
  } catch {
    // Keep the failure explicit; a missing pipeline connection must not look like zero work.
  }

  return (
    <Stack gap="lg" data-event-photo-analysis>
      <Breadcrumbs>
        <Link href="/admin/events">Events</Link>
        <Link href={'/admin/events/' + id}>{String(event.name ?? 'Event')}</Link>
        <Text>Photo analysis</Text>
      </Breadcrumbs>

      <WorkspaceHeader
        eyebrow="Events"
        title={String(event.name ?? 'Event') + ' — Photo analysis'}
        description="Review Fanmass findings and correct or confirm the same per-photo analysis. Human corrections remain linked to the exact AI result revision."
        status={<VisibilityStatusIcon isVisible={event.isActive !== false} />}
      />

      {!data ? (
        <Card>
          <Text fw={700}>Fanmass status is unavailable</Text>
          <Text size="sm" c="dimmed" mt="xs">Camera could not read Fanmass’s queue and results. No photo is being reported as complete or failed based on this unavailable read.</Text>
        </Card>
      ) : (
        <Stack gap="xl">
          <FanmassStatusSummary data={data} />
          <section aria-labelledby="photo-analysis-heading" style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <Text fw={700} id="photo-analysis-heading">Photo analysis by photo</Text>
              <Text size="sm" c="dimmed">Each card shows the source image, Fanmass’s result, queue state, and human confirmation state. Open any result to inspect and correct its structured fields and saved boxes.</Text>
            </div>
            <FanmassPhotoResultsList eventId={id} items={data.items} />
            {data.pages > 1 ? (
              <nav aria-label="Photo analysis pages" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                {data.page > 1 ? <Link href={'/admin/events/' + id + '/analysis?photos=analysed&fanmassPage=' + (data.page - 1)}>Previous photos</Link> : <span />}
                <Text size="sm" c="dimmed">Page {data.page} of {data.pages}</Text>
                {data.page < data.pages ? <Link href={'/admin/events/' + id + '/analysis?photos=analysed&fanmassPage=' + (data.page + 1)}>Next photos</Link> : <span />}
              </nav>
            ) : null}
          </section>
          <FanmassStatusAutoRefresh />
        </Stack>
      )}
    </Stack>
  );
}
