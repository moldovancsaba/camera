import { notFound } from 'next/navigation';
import LandingLegalDocument from '@/components/public/LandingLegalDocument';
import { getActiveLandingPageBySlug } from '@/lib/landing-pages';

export default async function LandingPrivacyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const landingPage = await getActiveLandingPageBySlug(slug);
  if (!landingPage || !landingPage.privacyMarkdown) {
    notFound();
  }

  return (
    <LandingLegalDocument
      slug={slug}
      eventName={String(landingPage.eventName)}
      title="Privacy Policy"
      body={String(landingPage.privacyMarkdown)}
    />
  );
}
