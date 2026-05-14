export interface LandingPageStylePreset {
  id: string;
  name: string;
  className: string;
  css: string;
}

export const DEFAULT_LANDING_PAGE_STYLE_PRESETS: LandingPageStylePreset[] = [
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
  font-weight: 400 !important;
  text-shadow: none !important;
  -webkit-text-stroke: 0 !important;
  filter: none !important;
}

.sihf-background .landing-page-title {
  font-size: clamp(2.75rem, 5vw, 5rem);
  line-height: 0.95;
  color: #ffffff !important;
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
  font-size: clamp(1.25rem, 1.95vw, 2.35rem);
  line-height: 1;
  padding: 1.2rem 1.7rem;
  box-shadow: 10px 10px 0 #000000 !important;
  white-space: nowrap;
  min-height: 50px;
}

.sihf-background .landing-page-cookie-button {
  border-radius: 0 !important;
  font-size: 1.1rem;
}

.sihf-background .landing-page-cookie-consent {
  max-width: 42rem;
  text-align: left;
  font-weight: 400 !important;
  text-shadow: none !important;
  -webkit-text-stroke: 0 !important;
}

.sihf-background h2,
.sihf-background p,
.sihf-background a,
.sihf-background label,
.sihf-background span {
  font-weight: 400 !important;
  text-shadow: none !important;
  -webkit-text-stroke: 0 !important;
  filter: none !important;
}

.sihf-background .landing-page-logo {
  display: block;
  max-height: clamp(4.5rem, 11vh, 8.5rem);
  width: auto;
  object-fit: contain;
}

@media (min-aspect-ratio: 1 / 1) {
  .sihf-background .landing-page-sidebar-qr img {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .sihf-background .landing-page-sidebar-cta .landing-page-url-button,
  .sihf-background .landing-page-sidebar-cta .landing-page-cookie-button {
    min-height: 50px;
    height: 50px;
    padding: 0.65rem 0.9rem;
    font-size: clamp(0.95rem, 1.2vw, 1.55rem);
    line-height: 1;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }

  .sihf-background .landing-page-sidebar-logo {
    min-height: 50px;
    display: flex;
    align-items: flex-end;
  }

  .sihf-background .landing-page-logo-landscape {
    align-self: flex-start;
    margin-top: auto;
    width: 100%;
  }

  .sihf-background .landing-page-logo-landscape .landing-page-logo {
    max-height: 120px;
    width: auto;
  }
}`,
  },
];

export function getLandingPageStylePreset(
  id: string | null | undefined
): LandingPageStylePreset | null {
  if (!id) return null;
  return DEFAULT_LANDING_PAGE_STYLE_PRESETS.find((preset) => preset.id === id) ?? null;
}
