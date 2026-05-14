export interface LandingPageStylePreset {
  id: string;
  name: string;
  className: string;
  css: string;
}

export const LANDING_PAGE_STYLE_PRESETS: LandingPageStylePreset[] = [
  {
    id: 'sihf-red-ice',
    name: 'SIHF Red Ice',
    className: 'sihf-background',
    css: `.sihf-background {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    linear-gradient(
      115deg,
      #e10600 0%,
      #b30000 32%,
      #6f0000 68%,
      #1a0000 100%
    );
}

.sihf-background::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(
      30deg,
      rgba(255,255,255,0.035) 12%,
      transparent 12.5%,
      transparent 87%,
      rgba(255,255,255,0.035) 87.5%
    ),
    linear-gradient(
      150deg,
      rgba(255,255,255,0.025) 12%,
      transparent 12.5%,
      transparent 87%,
      rgba(255,255,255,0.025) 87.5%
    ),
    linear-gradient(
      90deg,
      rgba(255,255,255,0.02) 2%,
      transparent 2.5%
    );
  background-size:
    140px 140px,
    140px 140px,
    70px 70px;
  opacity: 0.55;
  mask-image:
    linear-gradient(
      to right,
      rgba(0,0,0,0.85),
      rgba(0,0,0,0.45),
      rgba(0,0,0,0.9)
    );
}

.sihf-background::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(
      circle at top left,
      rgba(255,255,255,0.08),
      transparent 26%
    ),
    radial-gradient(
      circle at bottom right,
      rgba(0,0,0,0.35),
      transparent 40%
    ),
    linear-gradient(
      to bottom,
      rgba(255,255,255,0.02),
      rgba(0,0,0,0.18)
    );
}

.sihf-background .landing-page-title,
.sihf-background .landing-page-url-button,
.sihf-background .landing-page-cookie-button {
  font-family: var(--landing-display-font);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.sihf-background .landing-page-title {
  font-size: clamp(2.75rem, 5vw, 5rem);
  line-height: 0.95;
  color: #ffffff !important;
  text-shadow: 0 3px 0 rgba(0, 0, 0, 0.18);
  text-align: left;
}

.sihf-background .landing-page-url-button {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: auto !important;
  max-width: 100%;
  min-width: 0;
  border-radius: 0 !important;
  font-size: clamp(1.6rem, 2.35vw, 2.8rem);
  line-height: 1;
  padding: 1.15rem 1.5rem;
  box-shadow: 10px 10px 0 #000000 !important;
}

.sihf-background .landing-page-cookie-button {
  border-radius: 0 !important;
  font-size: 1.1rem;
}

.sihf-background .landing-page-cookie-consent {
  max-width: 42rem;
  text-align: left;
}`,
  },
];

export function getLandingPageStylePreset(
  id: string | null | undefined
): LandingPageStylePreset | null {
  if (!id) return null;
  return LANDING_PAGE_STYLE_PRESETS.find((preset) => preset.id === id) ?? null;
}
