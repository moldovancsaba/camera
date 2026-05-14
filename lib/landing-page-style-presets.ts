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

.sihf-background {
  --landing-gap: clamp(10px, 1.1vw, 18px);
  --landing-sidebar-width: clamp(220px, 22vw, 320px);
  --landing-title-height: clamp(54px, 8vh, 92px);
  --landing-button-height: clamp(52px, 6vh, 84px);
  --landing-logo-height: clamp(60px, 12vh, 120px);
  --landing-border: 2px solid rgba(255,255,255,0.92);
  --landing-panel-bg: rgba(30, 12, 12, 0.18);
  --landing-shadow: 0 18px 28px rgba(0,0,0,0.26);
  font-family: var(--landing-display-font), Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
}

.sihf-background *,
.sihf-background *::before,
.sihf-background *::after {
  box-sizing: border-box;
  text-shadow: none !important;
  -webkit-text-stroke: 0 !important;
  filter: none !important;
}

.sihf-background .landing-page-shell {
  width: 100%;
  max-width: 1400px;
  padding: clamp(12px, 1.4vw, 22px);
  gap: var(--landing-gap);
}

.sihf-background .landing-page-header {
  flex: 0 0 auto;
}

.sihf-background .landing-page-copy {
  gap: var(--landing-gap);
}

.sihf-background .landing-page-title {
  margin: 0;
  color: #ffffff;
  font-weight: 400 !important;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  line-height: 0.92;
  white-space: nowrap;
  overflow: hidden;
  text-align: left;
  font-size: clamp(2.2rem, 5.2vw, 5.2rem);
}

.sihf-background .landing-page-description {
  display: none !important;
}

.sihf-background .landing-page-main {
  gap: var(--landing-gap);
}

.sihf-background .landing-page-media-frame {
  border: var(--landing-border);
  background: transparent;
  box-shadow: var(--landing-shadow);
  border-radius: 0;
}

.sihf-background .landing-page-sidebar-qr,
.sihf-background .landing-page-sidebar-cta,
.sihf-background .landing-page-sidebar-logo {
  border: var(--landing-border);
  background: var(--landing-panel-bg);
  box-shadow: var(--landing-shadow);
}

.sihf-background .landing-page-sidebar-qr-frame,
.sihf-background .landing-page-sidebar-logo {
  padding: 0.75rem;
}

.sihf-background .landing-page-sidebar-qr-image,
.sihf-background .landing-page-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.sihf-background .landing-page-sidebar-logo .landing-page-logo {
  max-height: 120px;
}

.sihf-background .landing-page-actions {
  width: 100%;
  height: 100%;
}

.sihf-background .landing-page-cookie-consent {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.sihf-background .landing-page-cookie-row {
  border: var(--landing-border);
  padding: 0.75rem 1rem;
  background: rgba(255,255,255,0.08);
  color: #ffffff;
}

.sihf-background .landing-page-cookie-checkbox {
  width: 18px;
  height: 18px;
}

.sihf-background .landing-page-cookie-copy {
  color: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 0.95rem;
  line-height: 1.35;
  font-weight: 400 !important;
}

.sihf-background .landing-page-url-button,
.sihf-background .landing-page-cookie-button {
  width: 100%;
  min-height: 50px;
  border: 0;
  border-radius: 0;
  background: #ffffff;
  color: #e10600;
  font-weight: 400 !important;
  text-transform: uppercase;
  text-decoration: none;
  letter-spacing: 0.02em;
  line-height: 1;
  box-shadow: 10px 10px 0 #000000;
}

.sihf-background .landing-page-url-button {
  white-space: nowrap;
  font-size: clamp(1.05rem, 2.1vw, 2.15rem);
}

.sihf-background .landing-page-cookie-button {
  font-size: clamp(0.95rem, 1.4vw, 1.3rem);
}

.sihf-background .landing-page-url-button--disabled {
  opacity: 0.5;
  pointer-events: none;
}

.sihf-background .landing-page-sidebar-legal {
  display: none !important;
}

@media (min-aspect-ratio: 1 / 1) {
  .sihf-background .landing-page-shell {
    display: flex;
    flex-direction: column;
  }

  .sihf-background .landing-page-header {
    width: calc(100% - var(--landing-sidebar-width) - var(--landing-gap));
  }

  .sihf-background .landing-page-copy {
    align-items: flex-start;
    text-align: left;
  }

  .sihf-background .landing-page-title {
    height: var(--landing-title-height);
    font-size: clamp(2.2rem, 4.5vw, 5.1rem);
  }

  .sihf-background .landing-page-main--with-sidebar {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--landing-sidebar-width);
    align-items: stretch;
  }

  .sihf-background .landing-page-media-column,
  .sihf-background .landing-page-media-fit,
  .sihf-background .landing-page-media-frame {
    height: 100%;
  }

  .sihf-background .landing-page-sidebar {
    display: grid;
    grid-template-rows: minmax(0, 1fr) var(--landing-button-height) var(--landing-logo-height);
    height: 100%;
    gap: var(--landing-gap);
  }

  .sihf-background .landing-page-sidebar-qr {
    min-height: 0;
  }

  .sihf-background .landing-page-sidebar-cta {
    min-height: 0;
  }

  .sihf-background .landing-page-sidebar-cta .landing-page-actions,
  .sihf-background .landing-page-sidebar-cta .landing-page-url-button,
  .sihf-background .landing-page-sidebar-cta .landing-page-cookie-button {
    height: 100%;
    min-height: 100%;
  }

  .sihf-background .landing-page-sidebar-logo {
    align-items: center;
    justify-content: center;
  }
}

@media (max-aspect-ratio: 1 / 1) {
  .sihf-background .landing-page-shell {
    display: flex;
    flex-direction: column;
  }

  .sihf-background .landing-page-header,
  .sihf-background .landing-page-title {
    width: 100%;
  }

  .sihf-background .landing-page-copy {
    align-items: stretch;
    text-align: left;
  }

  .sihf-background .landing-page-main--with-sidebar {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: var(--landing-gap);
  }

  .sihf-background .landing-page-media-column,
  .sihf-background .landing-page-media-fit,
  .sihf-background .landing-page-media-frame {
    height: 100%;
    min-height: 0;
  }

  .sihf-background .landing-page-sidebar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      "qr logo"
      "cta cta";
    grid-template-rows: minmax(120px, 24vh) var(--landing-button-height);
    gap: var(--landing-gap);
    align-items: stretch;
  }

  .sihf-background .landing-page-sidebar-qr {
    grid-area: qr;
  }

  .sihf-background .landing-page-sidebar-logo {
    grid-area: logo;
    min-height: 0;
    align-items: center;
    justify-content: center;
  }

  .sihf-background .landing-page-sidebar-cta {
    grid-area: cta;
    min-height: 0;
  }

  .sihf-background .landing-page-sidebar-cta .landing-page-actions,
  .sihf-background .landing-page-sidebar-cta .landing-page-url-button,
  .sihf-background .landing-page-sidebar-cta .landing-page-cookie-button {
    height: 100%;
    min-height: 100%;
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
