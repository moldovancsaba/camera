'use client';

/**
 * Step 0 of the guest journey (camera#308): a picture that fills the screen, two transparent design layers at the bottom, and one clear
 * Start button in the middle. The picture is scaled to cover the screen and centred, so it fills it in portrait and in landscape alike
 * (a square photo is cropped, never stretched). Both layers are as wide as the screen and sit on its bottom edge, so they always have the
 * same scale; the second layer is drawn over the first and carries its design in the bottom right corner. What the page says is the
 * button label only: the design carries no text.
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

export default function WelcomePage({ config, onNext }: WelcomePageProps) {
  const layer = { position: 'absolute', left: 0, bottom: 0, width: '100%', height: 'auto', pointerEvents: 'none' } as const;

  return (
    <FullScreenPage marker={{ 'data-welcome-step': '' }}>
      <h1 className="sr-only">{config.title}</h1>

      {config.backgroundImageUrl ? (
        <Image src={config.backgroundImageUrl} alt="" fill unoptimized priority sizes="100vw" style={{ objectFit: 'cover', objectPosition: 'center' }} />
      ) : null}
      {config.bottomImageUrl ? <Image src={config.bottomImageUrl} alt="" width={600} height={400} unoptimized priority data-welcome-layer="bottom" style={layer} /> : null}
      {config.cornerImageUrl ? <Image src={config.cornerImageUrl} alt="" width={600} height={400} unoptimized priority data-welcome-layer="corner" style={layer} /> : null}

      {config.screenImageUrl ? <LedScreen3D imageUrl={config.screenImageUrl} alt={config.screenImageAlt || ''} /> : null}

      <PillButton
        onClick={onNext}
        fill={config.buttonColor}
        label={config.buttonTextColor}
        ring={config.buttonBorderColor}
        style={{ position: 'absolute', left: '50%', top: '50svh', transform: 'translate(-50%, -50%)' }}
      >
        {config.buttonText}
      </PillButton>
    </FullScreenPage>
  );
}
