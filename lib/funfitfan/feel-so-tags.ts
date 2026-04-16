const MAX_TAGS = 20;
const MAX_TAG_LEN = 48;

/** Strip surrounding whitespace and leading #; cap length. */
export function normalizeFeelSoTag(raw: string): string {
  let s = raw.trim().replace(/^#+/, '');
  if (s.length > MAX_TAG_LEN) s = s.slice(0, MAX_TAG_LEN).trim();
  return s;
}

export function normalizeFeelSoTagsList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_TAGS) break;
    if (typeof item !== 'string') continue;
    const n = normalizeFeelSoTag(item);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/** Second line on the card: "Feel so #a, #b" */
export function formatFeelSoLine(tags: string[]): string {
  const parts = normalizeFeelSoTagsList(tags);
  if (!parts.length) return '';
  return `Feel so ${parts.map((t) => `#${t}`).join(', ')}`;
}
