export const CAMERA_DEFAULT_BRAND_COLOR = '#3B82F6';
export const CAMERA_DEFAULT_BRAND_BORDER_COLOR = '#3B82F6';
export const CAMERA_DEFAULT_CTA_BRAND_COLOR = '#9333EA';

export const CAMERA_STAGE_WHITE = '#FFFFFF';
export const CAMERA_STAGE_BLACK = '#000000';

// The system default report style of messmass (heading colour and hero background, #RRGGBBAA), used for a generated
// event frame when no theme is known (camera#231). Same values as DEFAULT_REPORT_STYLE_COLORS in messmass.
export const FRAME_SYSTEM_HEADING_COLOR = '#1f2937ff';
export const FRAME_SYSTEM_BAR_COLOR = '#f8fafcff';

// The 50% black "territory" shown where a layer of the generated event frame will be, before the real composition
// (camera#236, owner decision 2026-10-06).
export const FRAME_TERRITORY_FILL = 'rgba(0, 0, 0, 0.5)';

// Stand-in for a photo behind the generated frame in the event editor, so a mostly transparent frame can be judged
// (camera#237).
export const FRAME_PREVIEW_BACKDROP = 'linear-gradient(135deg, #b8bec7, #5d6571)';

// Splash and canvas colour of the installed app (the light theme's `--mantine-color-gray-0`), camera#222.
export const CAMERA_PWA_BACKGROUND_COLOR = '#f8f9fa';

export const LANDING_PAGE_BASE_BACKGROUND = '#f8fafc';
export const LANDING_PAGE_BASE_TEXT = '#0f172a';

export const SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY = '#312e81';
export const SLIDESHOW_DEFAULT_BACKGROUND_ACCENT = '#0f172a';
export const SLIDESHOW_LAYOUT_PRESET_COLORS = [
  '#0ea5e9',
  '#22c55e',
  '#eab308',
  '#a855f7',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
] as const;

// The system default report style of messmass for the pages of the guest journey (camera#285): used when an event has no theme
// snapshot yet. Same values as DEFAULT_REPORT_STYLE_COLORS in messmass (#RRGGBBAA).
export const EVENT_THEME_DEFAULT = {
  heroBackground: '#f8fafcff',
  headingColor: '#1f2937ff',
  textColor: '#111827ff',
  cardBackground: '#ffffffff',
  cardBorder: '#f3f4f6ff',
  buttonBackground: '#ffffffff',
  buttonText: '#3b82f6ff',
  accentColor: '#3b82f6ff',
  linkColor: '#2563ebff',
  cardRadius: '0.75rem',
} as const;
