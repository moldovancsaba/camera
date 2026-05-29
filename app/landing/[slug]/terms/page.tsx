import { notFound } from 'next/navigation';
import LandingLegalDocument from '@/components/public/LandingLegalDocument';
import { getActiveLandingPageBySlug } from '@/lib/landing-pages';

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

  return (
    <LandingLegalDocument
      slug={slug}
      eventName={String(landingPage.eventName)}
      title="Terms and Conditions"
      body={String(landingPage.termsMarkdown)}
    />
  );
}
