/**
 * FunFitFan sport activities: normalization + **one-time Mongo seed list** only.
 * The live dropdown always reads `fff_settings.sportActivities` after `ensureFunFitFanSportActivitiesInDatabase`.
 */

/** Initial rows written to MongoDB when `sportActivities` is missing or empty (not used as a runtime fallback). */
export const SEED_FUNFITFAN_SPORT_ACTIVITIES: readonly string[] = [
  'Running',
  'Cycling',
  'Swimming',
  'Walking',
  'Strength training',
  'Yoga',
  'Pilates',
  'HIIT',
  'CrossFit',
  'Rowing',
  'Elliptical',
  'Stair climbing',
  'Hiking',
  'Tennis',
  'Basketball',
  'Soccer',
  'Dance',
  'Boxing',
  'Stretching',
  'Other',
];

/** Upper bound after trim + case-insensitive dedupe (keeps MongoDB document size reasonable). */
export const MAX_SPORT_ACTIVITIES = 100_000;

export function normalizeSportActivitiesList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_SPORT_ACTIVITIES) break;
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
