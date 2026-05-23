import { notFound } from 'next/navigation';
import { Bebas_Neue } from 'next/font/google';
import Image from 'next/image';
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
  const hasCallToAction = Boolean(landingPage.url) || landingPage.cookieConsentEnabled === true;
  const hasLogo = Boolean(landingPage.logoUrl);
  const hasDescription = Boolean(landingPage.description);
  const hasQr = Boolean(landingPage.qrCodeImageUrl);
  const hasLegal = Boolean(landingPage.termsMarkdown || landingPage.privacyMarkdown);
  const hasUtility = hasQr || hasLegal || hasLogo || hasCallToAction;
  const landingPageClassName = [
    'landing-page-root',
    hasUtility ? 'landing-page--has-sidebar' : 'landing-page--no-sidebar',
    hasCallToAction ? 'landing-page--has-cta' : 'landing-page--no-cta',
    hasLogo ? 'landing-page--has-logo' : 'landing-page--no-logo',
    hasDescription ? 'landing-page--has-description' : 'landing-page--no-description',
    hasQr ? 'landing-page--has-qr' : 'landing-page--no-qr',
    hasLegal ? 'landing-page--has-legal' : 'landing-page--no-legal',
    landingPage.targetType === 'layout'
      ? 'landing-page--target-layout'
      : 'landing-page--target-slideshow',
    typeof landingPage.customCssClassName === 'string' ? landingPage.customCssClassName.trim() : '',
  ]
    .filter(Boolean)
    .join(' ');
  const landingPageBaseCss = `
.landing-page-root {
  position: relative;
  min-height: 100dvh;
  height: 100dvh;
  overflow: hidden;
  background: #f8fafc;
  color: #0f172a;
  font-family: Arial, Helvetica, sans-serif;
}

.landing-page-shell {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: min(100%, 112rem);
  height: 100%;
  margin: 0 auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.landing-page-header {
  flex: 0 0 auto;
}

.landing-page-copy {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
  text-align: center;
}

.landing-page-logo {
  display: block;
  max-width: 100%;
  width: auto;
  object-fit: contain;
}

.landing-page-logo--portrait-placement {
  display: block;
  margin-left: auto;
  margin-right: auto;
}

.landing-page-logo--sidebar-placement {
  display: none;
}

.landing-page-title {
  width: 100%;
  margin: 0;
}

.landing-page-description {
  width: 100%;
  max-width: 64rem;
  margin: 0;
}

.landing-page-cta-container {
  width: 100%;
}

.landing-page-cta-container--portrait-placement {
  display: block;
}

.landing-page-cta-container--sidebar-placement {
  display: none;
}

.landing-page-actions {
  width: 100%;
}

.landing-page-cookie-consent {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.landing-page-cookie-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.landing-page-cookie-checkbox {
  flex: 0 0 auto;
  margin-top: 0.2rem;
}

.landing-page-cookie-copy {
  margin: 0;
}

.landing-page-cookie-button,
.landing-page-url-button {
  display: inline-flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  text-align: center;
  text-decoration: none;
}

.landing-page-url-button--disabled {
  pointer-events: none;
}

.landing-page-main {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

.landing-page-main--with-sidebar {
  grid-template-columns: 1fr;
}

.landing-page-media-column {
  min-height: 0;
  overflow: hidden;
}

.landing-page-media-fit {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  align-items: flex-start;
  justify-content: flex-start;
  overflow: hidden;
}

.landing-page-media-frame {
  position: relative;
  overflow: hidden;
}

.landing-page-media-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}

.landing-page-sidebar {
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
}

.landing-page-sidebar-qr,
.landing-page-sidebar-cta,
.landing-page-sidebar-logo,
.landing-page-sidebar-legal {
  min-width: 0;
}

.landing-page-sidebar-qr {
  min-height: 0;
}

.landing-page-sidebar-qr-frame {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.landing-page-sidebar-qr-image {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.landing-page-sidebar-cta {
  min-height: 50px;
}

.landing-page-sidebar-logo {
  min-height: 50px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
}

.landing-page-sidebar-logo .landing-page-logo {
  max-height: 120px;
}

.landing-page-sidebar-legal {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.landing-page-legal-title {
  margin: 0;
}

.landing-page-legal-links {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.landing-page-legal-link {
  display: block;
  text-decoration: none;
}

@media (min-aspect-ratio: 1 / 1) {
  .landing-page-shell {
    padding: 0.75rem;
  }

  .landing-page-copy {
    align-items: flex-start;
    text-align: left;
  }

  .landing-page-title {
    text-align: left;
  }

  .landing-page-main--with-sidebar {
    grid-template-columns: minmax(0, 1fr) minmax(220px, 260px);
  }

  .landing-page-cta-container--portrait-placement {
    display: none;
  }

  .landing-page-cta-container--sidebar-placement {
    display: block;
  }

  .landing-page-logo--portrait-placement {
    display: none;
  }

  .landing-page-logo--sidebar-placement {
    display: block;
    width: 100%;
  }

  .landing-page-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.5rem;
  }

  .landing-page-sidebar-qr {
    flex: 1 1 auto;
  }

  .landing-page-sidebar-cta {
    flex: 0 0 auto;
  }

  .landing-page-sidebar-logo {
    flex: 0 0 auto;
  }

  .landing-page-sidebar-legal {
    flex: 0 0 auto;
  }
}
  `.trim();
  const landingPageCustomCss =
    typeof landingPage.customCss === 'string' ? landingPage.customCss.trim() : '';
  const landingPageFontCss = `.landing-page-root { --landing-display-font: ${landingDisplayFont.style.fontFamily}, Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif; --landing-target-aspect-ratio: ${targetAspectRatio}; }`;

  return (
    <main className={`${landingPageClassName} ${landingDisplayFont.className}`}>
      <style>{landingPageFontCss}</style>
      <style>{landingPageBaseCss}</style>
      {landingPageCustomCss ? <style>{landingPageCustomCss}</style> : null}
      <div className="landing-page-shell">
        <header className="landing-page-header">
          <section className="landing-page-copy">
          {landingPage.title ? (
            <h1 className="landing-page-title">
              {String(landingPage.title)}
            </h1>
          ) : (
            <h1 className="landing-page-title">
              {String(landingPage.eventName)}
            </h1>
          )}

          {landingPage.description ? (
            <p className="landing-page-description">
              {String(landingPage.description)}
            </p>
          ) : null}
          </section>
        </header>

        <section
          className={`landing-page-main ${
            hasUtility
              ? 'landing-page-main--with-sidebar'
              : 'landing-page-main--without-sidebar'
          }`}
        >
          <div className="landing-page-media-column">
            <LandingPageMediaFrame
              aspectRatio={targetAspectRatio}
              src={targetUrl}
              title={String(landingPage.targetName || landingPage.eventName)}
            />
          </div>

          {hasUtility ? (
            <aside className="landing-page-sidebar">
              {hasQr ? (
                <section className="landing-page-sidebar-qr">
                  <div className="landing-page-sidebar-qr-frame">
                    <Image
                      src={String(landingPage.qrCodeImageUrl)}
                      alt="Landing page QR code"
                      width={240}
                      height={240}
                      unoptimized
                      className="landing-page-sidebar-qr-image"
                    />
                  </div>
                </section>
              ) : null}

              {hasCallToAction ? (
                <section className="landing-page-sidebar-cta">
                  <LandingPageCookieConsent
                    slug={slug}
                    enabled={landingPage.cookieConsentEnabled === true}
                    url={typeof landingPage.url === 'string' ? landingPage.url : null}
                    buttonText={typeof landingPage.urlButtonText === 'string' ? landingPage.urlButtonText : null}
                  />
                </section>
              ) : null}

              {hasLogo ? (
                <section className="landing-page-sidebar-logo">
                  <Image
                    src={String(landingPage.logoUrl)}
                    alt={landingPage.title ? `${landingPage.title} logo` : `${landingPage.eventName} logo`}
                    width={320}
                    height={160}
                    unoptimized
                    className="landing-page-logo"
                  />
                </section>
              ) : null}

              {hasLegal ? (
                <section className="landing-page-sidebar-legal">
                  <h2 className="landing-page-legal-title">
                    Legal
                  </h2>
                  <div className="landing-page-legal-links">
                    {landingPage.termsMarkdown ? (
                      <a
                        href={`/landing/${slug}/terms`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="landing-page-legal-link landing-page-legal-link--terms"
                      >
                        Open terms and conditions
                      </a>
                    ) : null}
                    {landingPage.privacyMarkdown ? (
                      <a
                        href={`/landing/${slug}/privacy`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="landing-page-legal-link landing-page-legal-link--privacy"
                      >
                        Open privacy policy
                      </a>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </aside>
          ) : null}
        </section>
      </div>
    </main>
  );
}
