import Link from 'next/link';
import { notFound } from 'next/navigation';
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
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Terms and Conditions</h1>
            <p className="mt-1 text-sm text-slate-500">{String(landingPage.eventName)}</p>
          </div>
          <Link
            href={`/landing/${slug}`}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
          >
            Back to landing page
          </Link>
        </div>

        <article className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-800">
          {String(landingPage.termsMarkdown)}
        </article>
      </div>
    </main>
  );
}
