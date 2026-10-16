import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ObjectId } from 'mongodb';
import { Breadcrumbs, Stack, Text } from '@/components/gds/PublicPrimitives';
import PhotoReviewStage from '@/components/admin/PhotoReviewStage';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { countPhotoAnalysisQueue, loadPhotoAnalysisQueue, photoAnalysisQueueFilter, toPhotoAnalysisItem } from '@/lib/photo-vetting/queue';
import { loadEventVocabulary } from '@/lib/photo-vetting/vocabulary-load';

export const dynamic = 'force-dynamic';

export default async function EventPhotoAnalysisReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photo?: string; edit?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!ObjectId.isValid(id)) notFound();

  const session = await getSession();
  const db = await connectToDatabase();
  const access = await getPartnerScopedAccessForEvent(db, id, session!, 'manager');
  if (!access.allowed) redirect(`/admin/events/${id}`);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) notFound();

  const eventUuid = String(event.eventId ?? '');
  const [vocabulary, analysisCounts] = await Promise.all([loadEventVocabulary(db, event), countPhotoAnalysisQueue(db, eventUuid)]);
  const editing = typeof query.edit === 'string' && ObjectId.isValid(query.edit);
  const editDoc = editing
    ? await db.collection(COLLECTIONS.SUBMISSIONS).findOne({ _id: new ObjectId(query.edit), ...photoAnalysisQueueFilter(eventUuid, 'analysed') })
    : null;
  if (editing && !editDoc) notFound();

  const queue = editing ? [] : await loadPhotoAnalysisQueue(db, eventUuid, 'needs_analysis', vocabulary);
  const selected = editDoc
    ? toPhotoAnalysisItem(editDoc, vocabulary)
    : typeof query.photo === 'string'
      ? queue.find((item) => item.id === query.photo)
      : undefined;
  if (typeof query.photo === 'string' && !selected) notFound();
  const items = editing ? [selected!] : selected ? [selected, ...queue.filter((item) => item.id !== selected.id)] : queue;
  const completionHref = editing ? `/admin/events/${id}/analysis?photos=analysed` : undefined;
  const backHref = editing ? `/admin/events/${id}/analysis?photos=analysed` : `/admin/events/${id}/analysis`;

  return (
    <Stack gap="md">
      <Breadcrumbs>
        <Link href="/admin/events">Events</Link>
        <Link href={`/admin/events/${id}`}>{String(event.name ?? 'Event')}</Link>
        <Link href={`/admin/events/${id}/analysis`}>Photo analysis</Link>
        <Text>{editing ? 'Update analysis' : 'Analyse photos'}</Text>
      </Breadcrumbs>
      <PhotoReviewStage
        key={editing ? `edit-${selected!.id}` : 'analysis-queue'}
        eventId={id}
        items={items}
        vocabulary={vocabulary}
        markPeople
        analysisOnly
        analysisTotal={editing ? 1 : analysisCounts.needs_analysis}
        completionHref={completionHref}
        backHref={backHref}
        backLabel="Back to Photo analysis"
      />
    </Stack>
  );
}
