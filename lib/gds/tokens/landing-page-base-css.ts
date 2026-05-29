import {
  LANDING_PAGE_BASE_BACKGROUND,
  LANDING_PAGE_BASE_TEXT,
} from '@/lib/gds/tokens/colors';

export const LANDING_PAGE_BASE_CSS = `
.landing-page-root {
  position: relative;
  min-height: 100dvh;
  height: 100dvh;
  overflow: hidden;
  background: ${LANDING_PAGE_BASE_BACKGROUND};
  color: ${LANDING_PAGE_BASE_TEXT};
  font-family: Arial, Helvetica, sans-serif;
}
`;
