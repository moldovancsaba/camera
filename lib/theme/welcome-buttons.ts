/**
 * The colours of the Start button on the event's active welcome page (fill, label, ring), if it has set any: the whole flow's buttons look like it. In a file of its own (no imports) so that
 * lib/screen/welcome-redraw.ts can compare them before and after a save without loading the theme loader and what it imports.
 */
export function welcomeButtonColours(pages: unknown): { fill?: unknown; label?: unknown; ring?: unknown } | null {
  const welcome = (Array.isArray(pages) ? pages : [])
    .filter((page): page is { pageType: string; isActive?: boolean; order?: number; config?: Record<string, unknown> } => !!page && typeof page === 'object' && (page as { pageType?: unknown }).pageType === 'welcome' && (page as { isActive?: unknown }).isActive !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  const config = welcome?.config;
  return config ? { fill: config.buttonColor, label: config.buttonTextColor, ring: config.buttonBorderColor } : null;
}
