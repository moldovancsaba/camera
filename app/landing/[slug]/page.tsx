import { notFound } from 'next/navigation';
import LandingPageCookieConsent from '@/components/landing/LandingPageCookieConsent';
import { getActiveLandingPageBySlug } from '@/lib/landing-pages';

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const landingPage = await getActiveLandingPageBySlug(slug);
  if (!landingPage) {
    notFound();
  }

  const targetUrl =
    landingPage.targetType === 'layout'
      ? `/slideshow-layout/${landingPage.targetId}`
      : `/slideshow/${landingPage.targetId}`;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe,_#f8fafc_55%,_#e2e8f0)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,420px)]">
          <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/90 shadow-xl shadow-slate-300/30 backdrop-blur">
            <div className="border-b border-slate-200 px-5 py-5 sm:px-8">
              {landingPage.logoUrl ? (
                <img
                  src={String(landingPage.logoUrl)}
                  alt={landingPage.title ? `${landingPage.title} logo` : `${landingPage.eventName} logo`}
                  className="mb-5 max-h-20 w-auto object-contain"
                />
              ) : null}

              {landingPage.title ? (
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {String(landingPage.title)}
                </h1>
              ) : (
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {String(landingPage.eventName)}
                </h1>
              )}

              {landingPage.description ? (
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                  {String(landingPage.description)}
                </p>
              ) : null}
            </div>

            <div className="p-3 sm:p-4 lg:p-5">
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950">
                <iframe
                  src={targetUrl}
                  title={String(landingPage.targetName || landingPage.eventName)}
                  className="h-[42vh] w-full sm:h-[52vh] lg:h-[70vh]"
                />
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-6">
            {landingPage.qrCodeImageUrl ? (
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">QR code</h2>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <img
                    src={String(landingPage.qrCodeImageUrl)}
                    alt="Landing page QR code"
                    className="mx-auto max-h-72 w-full object-contain"
                  />
                </div>
              </section>
            ) : null}

            <LandingPageCookieConsent
              slug={slug}
              enabled={landingPage.cookieConsentEnabled === true}
              url={typeof landingPage.url === 'string' ? landingPage.url : null}
            />

            {(landingPage.termsMarkdown || landingPage.privacyMarkdown) ? (
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Legal</h2>
                <div className="mt-4 flex flex-col gap-3">
                  {landingPage.termsMarkdown ? (
                    <a
                      href={`/landing/${slug}/terms`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                    >
                      Open terms and conditions
                    </a>
                  ) : null}
                  {landingPage.privacyMarkdown ? (
                    <a
                      href={`/landing/${slug}/privacy`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                    >
                      Open privacy policy
                    </a>
                  ) : null}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
