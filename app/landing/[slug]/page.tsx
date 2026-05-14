import { notFound } from 'next/navigation';
import LandingPageCookieConsent from '@/components/landing/LandingPageCookieConsent';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type Event, type SlideshowLayoutArea } from '@/lib/db/schemas';
import { getActiveLandingPageBySlug } from '@/lib/landing-pages';
import { computeCompactGridSpec } from '@/lib/slideshow/layout-geometry';
import { resolveSlideshowStageAspect } from '@/lib/slideshow/stage-aspect';
import {
  layoutGridCellUnits,
  normalizeSlideshowLayoutCellAspect,
} from '@/lib/slideshow/viewport-scale';

async function resolveTargetAspectRatio(
  landingPage: Awaited<ReturnType<typeof getActiveLandingPageBySlug>>
): Promise<number> {
  if (!landingPage) return 16 / 9;

  const db = await connectToDatabase();

  if (landingPage.targetType === 'layout') {
    const layout = await db.collection(COLLECTIONS.SLIDESHOW_LAYOUTS).findOne({
      layoutId: landingPage.targetId,
      isActive: { $ne: false },
    });
    if (!layout) return 16 / 9;

    const compactGrid = computeCompactGridSpec(
      Array.isArray(layout.areas) ? (layout.areas as SlideshowLayoutArea[]) : [],
      typeof layout.rows === 'number' && layout.rows >= 1 ? layout.rows : 1,
      typeof layout.cols === 'number' && layout.cols >= 1 ? layout.cols : 1
    );
    const { uw, uh } = layoutGridCellUnits(
      normalizeSlideshowLayoutCellAspect(layout.cellAspect)
    );
    return (compactGrid.effectiveCols * uw) / (compactGrid.effectiveRows * uh);
  }

  const [slideshow, event] = await Promise.all([
    db.collection(COLLECTIONS.SLIDESHOWS).findOne({
      slideshowId: landingPage.targetId,
      isActive: { $ne: false },
    }),
    db.collection(COLLECTIONS.EVENTS).findOne({
      eventId: landingPage.eventId,
    }),
  ]);

  if (!slideshow || !event) return 16 / 9;
  return resolveSlideshowStageAspect(
    slideshow as { stageAspect?: number | null },
    event as Event
  );
}

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
  const targetAspectRatio = await resolveTargetAspectRatio(landingPage);
  const landingPageClassName = [
    'landing-page-root',
    typeof landingPage.customCssClassName === 'string' ? landingPage.customCssClassName.trim() : '',
  ]
    .filter(Boolean)
    .join(' ');
  const landingPageFallbackCss = `.landing-page-root { background: ${landingPage.backgroundColor || '#f8fafc'}; }`;
  const landingPageCustomCss =
    typeof landingPage.customCss === 'string' ? landingPage.customCss.trim() : '';

  return (
    <main className={`${landingPageClassName} min-h-screen text-slate-900`}>
      <style>{landingPageFallbackCss}</style>
      {landingPageCustomCss ? <style>{landingPageCustomCss}</style> : null}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="space-y-6">
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
                <h1
                  className="text-3xl font-bold tracking-tight sm:text-4xl"
                  style={{ color: landingPage.titleColor || '#0f172a' }}
                >
                  {String(landingPage.title)}
                </h1>
              ) : (
                <h1
                  className="text-3xl font-bold tracking-tight sm:text-4xl"
                  style={{ color: landingPage.titleColor || '#0f172a' }}
                >
                  {String(landingPage.eventName)}
                </h1>
              )}

              {landingPage.description ? (
                <p
                  className="mt-4 max-w-3xl text-sm leading-7 sm:text-base"
                  style={{ color: landingPage.descriptionColor || '#475569' }}
                >
                  {String(landingPage.description)}
                </p>
              ) : null}
            </div>

            <div className="border-b border-slate-200">
              <div
                className="relative w-full overflow-hidden bg-black"
                style={{ aspectRatio: String(targetAspectRatio) }}
              >
                <iframe
                  src={targetUrl}
                  title={String(landingPage.targetName || landingPage.eventName)}
                  className="absolute inset-0 h-full w-full"
                />
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <LandingPageCookieConsent
                slug={slug}
                enabled={landingPage.cookieConsentEnabled === true}
                url={typeof landingPage.url === 'string' ? landingPage.url : null}
                buttonText={typeof landingPage.urlButtonText === 'string' ? landingPage.urlButtonText : null}
                buttonColor={typeof landingPage.buttonColor === 'string' ? landingPage.buttonColor : null}
                buttonTextColor={
                  typeof landingPage.buttonTextColor === 'string' ? landingPage.buttonTextColor : null
                }
                titleColor={
                  typeof landingPage.cookiesTitleColor === 'string' ? landingPage.cookiesTitleColor : null
                }
                bodyColor={typeof landingPage.cookiesBodyColor === 'string' ? landingPage.cookiesBodyColor : null}
              />
            </div>
          </section>

          {(landingPage.qrCodeImageUrl || landingPage.termsMarkdown || landingPage.privacyMarkdown) ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {landingPage.qrCodeImageUrl ? (
                <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: landingPage.qrTitleColor || '#0f172a' }}
                  >
                    QR code
                  </h2>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <img
                      src={String(landingPage.qrCodeImageUrl)}
                      alt="Landing page QR code"
                      className="mx-auto max-h-72 w-full object-contain"
                    />
                  </div>
                </section>
              ) : null}

              {(landingPage.termsMarkdown || landingPage.privacyMarkdown) ? (
                <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: landingPage.legalTitleColor || '#0f172a' }}
                  >
                    Legal
                  </h2>
                  <div className="mt-4 flex flex-col gap-3">
                    {landingPage.termsMarkdown ? (
                      <a
                        href={`/landing/${slug}/terms`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold transition-colors hover:bg-slate-50"
                        style={{ color: landingPage.legalLinkTextColor || '#1e293b' }}
                      >
                        Open terms and conditions
                      </a>
                    ) : null}
                    {landingPage.privacyMarkdown ? (
                      <a
                        href={`/landing/${slug}/privacy`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold transition-colors hover:bg-slate-50"
                        style={{ color: landingPage.legalLinkTextColor || '#1e293b' }}
                      >
                        Open privacy policy
                      </a>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
