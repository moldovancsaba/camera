/** A #RGB, #RRGGBB or #RRGGBBAA colour (messmass styles use #RRGGBBAA) as a canvas colour string; used by lib/frame/render.ts. */
export function cssColour(hex: string): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const alpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
  return `rgba(${parseInt(full.slice(0, 2), 16)}, ${parseInt(full.slice(2, 4), 16)}, ${parseInt(full.slice(4, 6), 16)}, ${alpha})`;
}
