'use client';

/**
 * Step 0 of the guest journey (camera#308): a picture that fills the screen, two transparent design layers at the bottom, and one clear
 * Start button in the middle. The picture is scaled to cover the screen and centred, so it fills it in portrait and in landscape alike
 * (a square photo is cropped, never stretched). In portrait both layers are as wide as the screen and sit on its bottom edge, so they always have
 * the same scale; the second layer is drawn over the first and carries its design in the bottom right corner. In landscape both are half the width
 * of the screen, the first at the left edge and the second at the right edge, still the same scale (owner, 2026-10-07: full width made them huge
 * on a phone held sideways). The giant screen (when the page has a picture for it) and the Start button are one group in the middle of the screen.
 * What the page says is the button label only: the design carries no text.
 */

import Image from 'next/image';
import FullScreenPage from '@/components/capture/FullScreenPage';
import LedScreen3D from '@/components/capture/LedScreen3D';
import PillButton, { safeColour } from '@/components/capture/PillButton';

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

      {config.backgroundImageUrl ? (
        <Image src={config.backgroundImageUrl} alt="" fill unoptimized priority sizes="100vw" style={{ objectFit: 'cover', objectPosition: 'center' }} />
      ) : null}
      {config.bottomImageUrl ? <Image src={config.bottomImageUrl} alt="" width={600} height={400} unoptimized priority data-welcome-layer="bottom" className="welcome-layer" /> : null}
      {config.cornerImageUrl ? <Image src={config.cornerImageUrl} alt="" width={600} height={400} unoptimized priority data-welcome-layer="corner" className="welcome-layer welcome-layer-corner" /> : null}

      {/* The giant screen and the Start button are one group, centred in the visible screen (below the notch area). */}
      <div
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
      </div>
    </FullScreenPage>
  );
}
