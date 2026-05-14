import { notFound } from 'next/navigation';
import { Bebas_Neue } from 'next/font/google';
import LandingPageCookieConsent from '@/components/landing/LandingPageCookieConsent';
import LandingPageMediaFrame from '@/components/landing/LandingPageMediaFrame';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type SlideshowLayoutArea } from '@/lib/db/schemas';
import { FUNFITFAN_PARTNER_ID } from '@/lib/funfitfan/constants';
import { getActiveLandingPageBySlug } from '@/lib/landing-pages';
import { computeCompactGridSpec } from '@/lib/slideshow/layout-geometry';
import {
  layoutGridCellUnits,
  normalizeSlideshowLayoutCellAspect,
} from '@/lib/slideshow/viewport-scale';

const landingDisplayFont = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

function resolveCommittedSlideshowStageAspect(
  slideshow: { stageAspect?: number | null },
  event: { partnerId?: string | null }
): number {
  const raw = slideshow.stageAspect;
  if (
    typeof raw === 'number' &&
    Number.isFinite(raw) &&
    raw >= 0.25 &&
    raw <= 4
  ) {
    return raw;
  }
  return String(event.partnerId) === FUNFITFAN_PARTNER_ID ? 9 / 16 : 16 / 9;
}

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
  return resolveCommittedSlideshowStageAspect(
    slideshow as { stageAspect?: number | null },
    event as { partnerId?: string | null }
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
  const hasSidebar = Boolean(landingPage.qrCodeImageUrl || landingPage.termsMarkdown || landingPage.privacyMarkdown);
  const hasCallToAction = Boolean(landingPage.url) || landingPage.cookieConsentEnabled === true;
  const shouldMoveCallToActionToSidebar = hasSidebar && hasCallToAction;
  const hasLogo = Boolean(landingPage.logoUrl);
  const shouldMoveLogoToSidebar = hasSidebar && hasLogo;
  const landingPageClassName = [
    'landing-page-root',
    typeof landingPage.customCssClassName === 'string' ? landingPage.customCssClassName.trim() : '',
  ]
    .filter(Boolean)
    .join(' ');
  const landingPageFallbackCss = `.landing-page-root { background: ${landingPage.backgroundColor || '#f8fafc'}; }`;
  const landingPageCustomCss =
    typeof landingPage.customCss === 'string' ? landingPage.customCss.trim() : '';
  const landingPageFontCss = `.landing-page-root { --landing-display-font: ${landingDisplayFont.style.fontFamily}, Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif; }`;
  const landingPageTextResetCss = `
.landing-page-root,
.landing-page-root *,
.landing-page-root *::before,
.landing-page-root *::after {
  text-shadow: none !important;
  -webkit-text-stroke: 0 !important;
}

.landing-page-shell {
  max-width: none !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.landing-page-copy {
  padding-left: 0.75rem;
  padding-right: 0.75rem;
}

.landing-page-cta-container {
  max-width: none !important;
  width: 100%;
}

.landing-page-cta-container .landing-page-url-button,
.landing-page-cta-container .landing-page-cookie-button {
  width: 100% !important;
}

.landing-page-logo-portrait {
  margin-left: auto;
  margin-right: auto;
}

.landing-page-cta-landscape {
  display: none;
}

.landing-page-logo-landscape {
  display: none;
}

.landing-page-sidebar {
  display: grid;
  min-height: 0;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

@media (min-aspect-ratio: 1 / 1) {
  .landing-page-shell {
    max-width: 80rem !important;
    padding-left: 2rem !important;
    padding-right: 2rem !important;
  }

  .landing-page-copy {
    padding-left: 0;
    padding-right: 0;
  }

  .landing-page-cta-container {
    max-width: 48rem;
    width: 100%;
  }

  .landing-page-cta-portrait {
    display: none !important;
  }

  .landing-page-cta-landscape {
    display: block !important;
  }

  .landing-page-logo-portrait {
    display: none !important;
  }

  .landing-page-logo-landscape {
    display: block !important;
  }

  .landing-page-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: 0.75rem;
  }

  .landing-page-sidebar-qr {
    flex: 1 1 auto;
    min-height: 0;
  }

  .landing-page-sidebar-cta {
    flex: 0 0 auto;
    min-height: 50px;
  }

  .landing-page-sidebar-logo {
    flex: 0 0 auto;
    min-height: 50px;
  }

  .landing-page-sidebar-legal {
    flex: 0 0 auto;
  }
}
`.trim();

  return (
    <main className={`${landingPageClassName} ${landingDisplayFont.className} relative h-[100dvh] overflow-hidden text-slate-900`}>
      <style>{landingPageFallbackCss}</style>
      <style>{landingPageFontCss}</style>
      {landingPageCustomCss ? <style>{landingPageCustomCss}</style> : null}
      <style>{landingPageTextResetCss}</style>
      <div className="landing-page-shell relative z-10 mx-auto flex h-full max-w-7xl flex-col gap-3 py-3 sm:gap-4 sm:py-5 lg:py-6">
        <section className="landing-page-copy shrink-0 space-y-3">
          {landingPage.logoUrl ? (
            <img
              src={String(landingPage.logoUrl)}
              alt={landingPage.title ? `${landingPage.title} logo` : `${landingPage.eventName} logo`}
              className={`landing-page-logo max-h-12 w-auto object-contain sm:max-h-16 ${
                shouldMoveLogoToSidebar ? 'landing-page-logo-portrait' : ''
              }`}
            />
          ) : null}

          {landingPage.title ? (
            <h1
              className="landing-page-title max-w-5xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl"
              style={{ color: landingPage.titleColor || '#0f172a' }}
            >
              {String(landingPage.title)}
            </h1>
          ) : (
            <h1
              className="landing-page-title max-w-5xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl"
              style={{ color: landingPage.titleColor || '#0f172a' }}
            >
              {String(landingPage.eventName)}
            </h1>
          )}

          {landingPage.description ? (
            <p
              className="max-w-4xl overflow-hidden text-xs leading-5 sm:text-sm sm:leading-6 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
              style={{ color: landingPage.descriptionColor || '#475569' }}
            >
              {String(landingPage.description)}
            </p>
          ) : null}

          {hasCallToAction ? (
            <div className={`landing-page-cta-container ${shouldMoveCallToActionToSidebar ? 'landing-page-cta-portrait' : ''}`}>
              <LandingPageCookieConsent
                slug={slug}
                enabled={landingPage.cookieConsentEnabled === true}
                url={typeof landingPage.url === 'string' ? landingPage.url : null}
                buttonText={typeof landingPage.urlButtonText === 'string' ? landingPage.urlButtonText : null}
                buttonColor={typeof landingPage.buttonColor === 'string' ? landingPage.buttonColor : null}
                buttonTextColor={
                  typeof landingPage.buttonTextColor === 'string' ? landingPage.buttonTextColor : null
                }
                bodyColor={typeof landingPage.cookiesBodyColor === 'string' ? landingPage.cookiesBodyColor : null}
              />
            </div>
          ) : null}
        </section>

        <section
          className={`grid min-h-0 flex-1 gap-3 ${
            hasSidebar
              ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(220px,260px)]'
              : 'grid-cols-1'
          }`}
        >
          <div className="landing-page-media-column min-h-0 overflow-hidden">
            <LandingPageMediaFrame
              aspectRatio={targetAspectRatio}
              src={targetUrl}
              title={String(landingPage.targetName || landingPage.eventName)}
            />
          </div>

          {hasSidebar ? (
            <div className="landing-page-sidebar">
              {landingPage.qrCodeImageUrl ? (
                <section className="landing-page-sidebar-qr flex min-h-0 flex-col">
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-1">
                    <img
                      src={String(landingPage.qrCodeImageUrl)}
                      alt="Landing page QR code"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </section>
              ) : null}

              {shouldMoveCallToActionToSidebar ? (
                <section className="landing-page-cta-landscape landing-page-sidebar-cta flex min-h-0 flex-col">
                  <LandingPageCookieConsent
                    slug={slug}
                    enabled={landingPage.cookieConsentEnabled === true}
                    url={typeof landingPage.url === 'string' ? landingPage.url : null}
                    buttonText={typeof landingPage.urlButtonText === 'string' ? landingPage.urlButtonText : null}
                    buttonColor={typeof landingPage.buttonColor === 'string' ? landingPage.buttonColor : null}
                    buttonTextColor={
                      typeof landingPage.buttonTextColor === 'string' ? landingPage.buttonTextColor : null
                    }
                    bodyColor={typeof landingPage.cookiesBodyColor === 'string' ? landingPage.cookiesBodyColor : null}
                  />
                </section>
              ) : null}

              {shouldMoveLogoToSidebar ? (
                <section className="landing-page-logo-landscape landing-page-sidebar-logo flex min-h-0 flex-col items-start justify-end">
                  <img
                    src={String(landingPage.logoUrl)}
                    alt={landingPage.title ? `${landingPage.title} logo` : `${landingPage.eventName} logo`}
                    className="landing-page-logo w-auto object-contain"
                  />
                </section>
              ) : null}

              {(landingPage.termsMarkdown || landingPage.privacyMarkdown) ? (
                <section className="landing-page-sidebar-legal flex min-h-0 flex-col">
                  <h2
                    className="shrink-0 text-base font-semibold"
                    style={{ color: landingPage.legalTitleColor || '#0f172a' }}
                  >
                    Legal
                  </h2>
                  <div className="mt-2 flex flex-col gap-2">
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
        </section>
      </div>
    </main>
  );
}
