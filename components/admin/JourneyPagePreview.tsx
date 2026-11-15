'use client';

import { AdminSelect } from '@sovereignsquad/gds-admin/client';
import CaptureStageShell from '@/components/capture/CaptureStageShell';
import AcceptPage from '@/components/capture/AcceptPage';
import CTAPage from '@/components/capture/CTAPage';
import RestartPage from '@/components/capture/RestartPage';
import WelcomePage from '@/components/capture/WelcomePage';
import WhoAreYouPage from '@/components/capture/WhoAreYouPage';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import type { CustomPage } from '@/lib/db/schemas';
import { CustomPageType } from '@/lib/db/schemas';
import { welcomeScreenImage } from '@/lib/events/welcome-screen-url';
import { adminExperienceTemplateText } from '@/lib/i18n/admin-experience-templates';
import { EVENT_THEME_DEFAULT } from '@/lib/gds/tokens/colors';
import type { EventThemePreview } from '@/lib/theme/event-theme';
import { EVENT_THEME_CSS, safeFontFamily, SYSTEM_FONT_STACK } from '@/lib/theme/css';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import styles from './CustomPagesManager.module.css';

type PreviewSize = 'mobile' | 'tablet' | 'desktop';

const PREVIEW_SIZES: Array<{ value: PreviewSize; label: string }> = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'desktop', label: 'Desktop' },
];

function translated(source: string, language: ReturnType<typeof useUiLanguage>) {
  return adminExperienceTemplateText(source, language) ?? source;
}

/**
 * The guest renderers are reused here so the preview follows the live page layout.
 * It is deliberately inert: an editor can inspect appearance, but cannot submit,
 * navigate, open external links, or trigger a camera flow from this panel.
 */
export default function JourneyPagePreview({
  page,
  eventId,
  eventWelcomeScreenUrl,
  eventTheme,
}: {
  page: CustomPage;
  eventId?: string;
  eventWelcomeScreenUrl?: string;
  eventTheme?: EventThemePreview;
}) {
  const language = useUiLanguage();
  const [size, setSize] = useState<PreviewSize>('mobile');
  const safeFamily = eventTheme?.font?.family ? safeFontFamily(eventTheme.font.family) : null;
  const font = safeFamily ? `'${safeFamily}', ${SYSTEM_FONT_STACK}` : SYSTEM_FONT_STACK;
  const stageStyle = {
    '--event-bg': eventTheme?.background || EVENT_THEME_DEFAULT.heroBackground,
    '--event-heading': eventTheme?.heading || EVENT_THEME_DEFAULT.headingColor,
    '--event-muted': eventTheme?.headingMuted || EVENT_THEME_DEFAULT.textColor,
    '--event-card-bg': eventTheme?.cardBackground || EVENT_THEME_DEFAULT.cardBackground,
    '--event-card-text': eventTheme?.cardText || EVENT_THEME_DEFAULT.textColor,
    '--event-card-muted': eventTheme?.cardMuted || EVENT_THEME_DEFAULT.textColor,
    '--event-input-border': eventTheme?.inputBorder || EVENT_THEME_DEFAULT.cardBorder,
    '--event-card-border': eventTheme?.cardBorder || EVENT_THEME_DEFAULT.cardBorder,
    '--event-button-bg': eventTheme?.buttonBackground || EVENT_THEME_DEFAULT.buttonBackground,
    '--event-button-text': eventTheme?.buttonText || EVENT_THEME_DEFAULT.buttonText,
    '--event-button-ring': eventTheme?.buttonRing || EVENT_THEME_DEFAULT.buttonText,
    '--event-control-accent': eventTheme?.controlAccent || EVENT_THEME_DEFAULT.accentColor,
    '--event-control-accent-text': eventTheme?.controlAccentText || EVENT_THEME_DEFAULT.buttonText,
    '--event-link': eventTheme?.link || EVENT_THEME_DEFAULT.linkColor,
    '--event-radius': eventTheme?.radius || EVENT_THEME_DEFAULT.cardRadius,
    '--event-font': font,
    fontFamily: font,
  } as CSSProperties;

  return (
    <aside className={styles.previewPanel} aria-labelledby="journey-live-preview-title" data-journey-live-preview>
      <div className={styles.previewHeader}>
        <h3 id="journey-live-preview-title">{translated('Live preview', language)}</h3>
        <AdminSelect
          name="journey-page-preview-size"
          label={translated('Preview size', language)}
          value={size}
          onChange={(value) => {
            if (value === 'mobile' || value === 'tablet' || value === 'desktop') setSize(value);
          }}
          data={PREVIEW_SIZES.map((item) => ({ ...item, label: translated(item.label, language) }))}
          allowDeselect={false}
          aria-label={translated('Preview size', language)}
        />
      </div>
      <p className={styles.previewHint}>{translated('Read-only preview. Changes appear here as you edit.', language)}</p>
      <div className={styles.previewStageFrame} data-preview-size={size} style={stageStyle}>
        <div className={`event-theme ${styles.previewStage}`} style={stageStyle} inert>
          <style>{EVENT_THEME_CSS}</style>
          <PreviewPage
            page={page}
            eventId={eventId}
            eventWelcomeScreenUrl={eventWelcomeScreenUrl}
            logoUrl={eventTheme?.logoUrl}
          />
        </div>
      </div>
    </aside>
  );
}

function PreviewPage({
  page,
  eventId,
  eventWelcomeScreenUrl,
  logoUrl,
}: {
  page: CustomPage;
  eventId?: string;
  eventWelcomeScreenUrl?: string;
  logoUrl?: string | null;
}) {
  const language = useUiLanguage();
  const config = page.config;

  switch (page.pageType) {
    case CustomPageType.WELCOME:
      return (
        <WelcomePage
          config={{
            ...config,
            screenImageUrl: welcomeScreenImage(config.screenImageUrl, eventWelcomeScreenUrl ? { url: eventWelcomeScreenUrl } : undefined),
            eventWelcomeScreenUrl,
            welcomeElements: config.welcomeElements,
          }}
          onNext={() => undefined}
          preview
        />
      );
    case CustomPageType.WHO_ARE_YOU:
      return (
        <WhoAreYouPage
          config={{
            ...config,
            nameLabel: config.nameLabel || 'Your name',
            emailLabel: config.emailLabel || 'Your email',
          }}
          eventId={eventId || 'journey-preview'}
          pageIndex={0}
          pageId={page.pageId}
          logoUrl={logoUrl}
          onNext={() => undefined}
          preview
        />
      );
    case CustomPageType.ACCEPT:
      return <AcceptPage config={{ ...config, checkboxText: config.checkboxText ?? '' }} pageId={page.pageId} logoUrl={logoUrl} onNext={() => undefined} preview />;
    case CustomPageType.CTA:
      return <CTAPage config={{ ...config, checkboxText: config.checkboxText ?? '' }} pageId={page.pageId} logoUrl={logoUrl} onNext={() => undefined} preview />;
    case CustomPageType.RESTART:
      return <RestartPage config={config} logoUrl={logoUrl} onRestart={() => undefined} preview />;
    case CustomPageType.TAKE_PHOTO:
    case CustomPageType.SUBMIT:
    case CustomPageType.FRAME_MESSAGE_SELECTION:
      return (
        <CaptureStageShell title={config.title} description={config.description} logoUrl={logoUrl} preview>
          <div className={styles.runtimeStep}>
            <span aria-hidden="true" className={styles.runtimeIcon}>
              {page.pageType === CustomPageType.TAKE_PHOTO ? '📷' : page.pageType === CustomPageType.SUBMIT ? '↥' : '▦'}
            </span>
            <p>{translated('This camera step is shown as a placeholder. The preview does not open the camera, submit a photo, or change selections.', language)}</p>
          </div>
        </CaptureStageShell>
      );
    default:
      return <CaptureStageShell title={config.title} description={config.description} logoUrl={logoUrl} preview>{null}</CaptureStageShell>;
  }
}
