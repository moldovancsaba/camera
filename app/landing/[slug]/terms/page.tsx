import { notFound, redirect } from 'next/navigation';
import LandingLegalDocument from '@/components/public/LandingLegalDocument';
import { getActiveLandingPageBySlug } from '@/lib/landing-pages';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { inactiveEventSelfiesPath } from '@/lib/events/inactive-event-destination';

export default async function LandingTermsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const landingPage = await getActiveLandingPageBySlug(slug);
  if (!landingPage || !landingPage.termsMarkdown) {
    notFound();
  }

  const event = await (await connectToDatabase()).collection(COLLECTIONS.EVENTS).findOne(
    { eventId: landingPage.eventId },
    { projection: { _id: 1, isActive: 1, greatestHitsSlug: 1 } },
  );
  if (event?.isActive === false) redirect(inactiveEventSelfiesPath(event));

  return (
    <LandingLegalDocument
      slug={slug}
      eventName={String(landingPage.eventName)}
      title="Terms and Conditions"
      body={String(landingPage.termsMarkdown)}
    />
  );
}
