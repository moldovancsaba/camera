'use client';

/**
 * Step 0 of the guest journey (camera#308): a picture that fills the screen, two transparent design layers at the bottom, and one clear
 * Start button in the middle. The picture is scaled to cover the screen and centred, so it fills it in portrait and in landscape alike
 * (a square photo is cropped, never stretched). Both layers are as wide as the screen and sit on its bottom edge, so they always have the
 * same scale; the second layer is drawn over the first and carries its design in the bottom right corner. What the page says is the
 * button label only: the design carries no text.
 */

import Image from 'next/image';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';

export interface WelcomePageConfig {
  /** Read by screen readers, not shown. */
  title: string;
  buttonText: string;
  backgroundImageUrl?: string;
  bottomImageUrl?: string;
  cornerImageUrl?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonBorderColor?: string;
}

export interface WelcomePageProps {
  config: WelcomePageConfig;
  onNext: () => void;
}

/** A colour from the page's settings is used only when it is a hex colour; anything else could reach the stylesheet as it is. */
export function safeColour(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : fallback;
}

export default function WelcomePage({ config, onNext }: WelcomePageProps) {
  const fill = safeColour(config.buttonColor, CAMERA_DEFAULT_BRAND_COLOR);
  const label = safeColour(config.buttonTextColor, CAMERA_STAGE_WHITE);
  const ring = safeColour(config.buttonBorderColor, CAMERA_STAGE_WHITE);
  const layer = { position: 'absolute', left: 0, bottom: 0, width: '100%', height: 'auto', pointerEvents: 'none' } as const;

  return (
    <main data-welcome-step style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <h1 className="sr-only">{config.title}</h1>

      {config.backgroundImageUrl ? (
        <Image src={config.backgroundImageUrl} alt="" fill unoptimized priority sizes="100vw" style={{ objectFit: 'cover', objectPosition: 'center' }} />
      ) : null}
      {config.bottomImageUrl ? <Image src={config.bottomImageUrl} alt="" width={600} height={400} unoptimized priority data-welcome-layer="bottom" style={layer} /> : null}
      {config.cornerImageUrl ? <Image src={config.cornerImageUrl} alt="" width={600} height={400} unoptimized priority data-welcome-layer="corner" style={layer} /> : null}

      <button
        type="button"
        onClick={onNext}
        className="focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          minWidth: 'min(80vw, 18rem)',
          minHeight: '4.25rem',
          padding: '0 2.5rem',
          border: `4px solid ${ring}`,
          borderRadius: '999px',
          background: fill,
          color: label,
          fontSize: '1.5rem',
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: `0 0.75rem 2rem color-mix(in srgb, ${fill} 55%, transparent)`,
        }}
      >
        {config.buttonText}
      </button>
    </main>
  );
}
