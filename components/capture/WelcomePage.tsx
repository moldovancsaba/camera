'use client';

/**
 * Step 0 of the guest journey (camera#308). New compositions use the shared welcome element renderer, which positions image, text and the required
 * Start button on a responsive 3×3 stage. Pages not yet saved in the visual editor keep the original background/layers/3D screen renderer below, so
 * opening the editor alone never changes a live page. The page title is for assistive technology; visible copy is authored as text elements.
 */

import Image from 'next/image';
import FullScreenPage from '@/components/capture/FullScreenPage';
import LedScreen3D from '@/components/capture/LedScreen3D';
import PillButton, { safeColour } from '@/components/capture/PillButton';
import WelcomeCompositionCanvas from '@/components/capture/WelcomeCompositionCanvas';
import type { WelcomeElement } from '@/lib/events/welcome-composition';

export interface WelcomePageConfig {
  /** Read by screen readers, not shown. */
  title: string;
  buttonText: string;
  backgroundImageUrl?: string;
  bottomImageUrl?: string;
  cornerImageUrl?: string;
  /** The picture shown on the giant screen (a CSS 3D LED wall above the Start button); left out, no screen is drawn. */
  screenImageUrl?: string;
  screenImageAlt?: string;
  /** Present for the visual editor's flexible layout; absent keeps old pages on their exact legacy renderer. */
  welcomeElements?: WelcomeElement[];
  /** The event-generated welcome screen remains dynamic when referenced by an element. */
  eventWelcomeScreenUrl?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonBorderColor?: string;
}

export interface WelcomePageProps {
  config: WelcomePageConfig;
  onNext: () => void;
}

export { safeColour };

/**
 * The two layers sit on the bottom edge. Portrait: each as wide as the screen. Landscape (the page box is a size container, so its own shape decides,
 * not the window's): each half the width, the first at the left edge and the second at the right edge, so both keep one scale.
 */
export const WELCOME_LAYER_CSS = `
.welcome-layer { position: absolute; left: 0; bottom: 0; width: 100%; height: auto; pointer-events: none; }
@container (orientation: landscape) {
  .welcome-layer { width: 50%; }
  .welcome-layer-corner { left: auto; right: 0; }
}
`;

export default function WelcomePage({ config, onNext }: WelcomePageProps) {
  return (
    <FullScreenPage marker={{ 'data-welcome-step': '' }}>
      <h1 className="sr-only">{config.title}</h1>
      <style>{WELCOME_LAYER_CSS}</style>

      {config.welcomeElements !== undefined ? (
        <WelcomeCompositionCanvas
          elements={config.welcomeElements}
          buttonText={config.buttonText}
          backgroundImageUrl={config.backgroundImageUrl}
          eventWelcomeScreenUrl={config.eventWelcomeScreenUrl}
          buttonColors={{ fill: config.buttonColor, label: config.buttonTextColor, ring: config.buttonBorderColor }}
          onStart={onNext}
          style={{ inset: 0, position: 'absolute' }}
        />
      ) : null}

      {config.welcomeElements === undefined && config.backgroundImageUrl ? (
        <Image src={config.backgroundImageUrl} alt="" fill unoptimized priority sizes="100vw" style={{ objectFit: 'cover', objectPosition: 'center' }} />
      ) : null}
      {config.welcomeElements === undefined && config.bottomImageUrl ? <Image src={config.bottomImageUrl} alt="" width={600} height={400} unoptimized priority data-welcome-layer="bottom" className="welcome-layer" /> : null}
      {config.welcomeElements === undefined && config.cornerImageUrl ? <Image src={config.cornerImageUrl} alt="" width={600} height={400} unoptimized priority data-welcome-layer="corner" className="welcome-layer welcome-layer-corner" /> : null}

      {/* Legacy page layout: keep its screen and Start button grouped until the visual composition has been saved. */}
      {config.welcomeElements === undefined ? <div
        data-welcome-group
        style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 'var(--gds-safe-area-inset-top, 0px)', pointerEvents: 'none' }}
      >
        {config.screenImageUrl ? <LedScreen3D imageUrl={config.screenImageUrl} alt={config.screenImageAlt || ''} /> : null}
        <PillButton
          onClick={onNext}
          fill={config.buttonColor}
          label={config.buttonTextColor}
          ring={config.buttonBorderColor}
          style={{ flex: 'none', pointerEvents: 'auto' }}
        >
          {config.buttonText}
        </PillButton>
      </div> : null}
    </FullScreenPage>
  );
}
