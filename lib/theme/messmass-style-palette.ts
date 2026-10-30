import type { PageStyle } from '@/lib/frame/context';

export interface MessmassStylePalette {
  name: string;
  resolvedFrom: string;
  heroBackground: string;
  headingColor: string;
  page?: PageStyle;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const color = (value: unknown): string | null =>
  typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim()) ? value.trim().toLowerCase() : null;

/** Narrow the internal Messmass style snapshot before showing its values in Camera admin. */
export function parseMessmassStylePalette(value: unknown): MessmassStylePalette | null {
  const style = record(value);
  const name = typeof style?.name === 'string' ? style.name.trim() : '';
  const resolvedFrom = typeof style?.resolvedFrom === 'string' ? style.resolvedFrom.trim() : '';
  const heroBackground = color(style?.heroBackground);
  const headingColor = color(style?.headingColor);
  if (!style || !name || !resolvedFrom || !heroBackground || !headingColor) return null;

  const rawPage = record(style.page);
  let page: PageStyle | undefined;
  if (rawPage) {
    const pageBackground = color(rawPage.pageBackground);
    const textColor = color(rawPage.textColor);
    const cardBackground = color(rawPage.cardBackground);
    const cardBorder = color(rawPage.cardBorder);
    const buttonBackground = color(rawPage.buttonBackground);
    const buttonText = color(rawPage.buttonText);
    const accentColor = color(rawPage.accentColor);
    const linkColor = color(rawPage.linkColor);
    const cardRadius = typeof rawPage.cardRadius === 'string' && /^\d{1,2}(?:\.\d{1,2})?(?:px|rem|em)$/.test(rawPage.cardRadius)
      ? rawPage.cardRadius
      : null;
    if (pageBackground && textColor && cardBackground && cardBorder && buttonBackground && buttonText && accentColor && linkColor && cardRadius) {
      page = { pageBackground, textColor, cardBackground, cardBorder, buttonBackground, buttonText, accentColor, linkColor, cardRadius };
    }
  }

  return { name, resolvedFrom, heroBackground, headingColor, ...(page ? { page } : {}) };
}
