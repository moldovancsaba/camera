/**
 * Map admin lesson `sport` to the canonical string from FunFitFan `sportActivities` (case-insensitive).
 */
export function resolveLessonSportFromAllowlist(
  raw: string,
  allowed: readonly string[]
): string | null {
  const t = raw.trim();
  if (!t) return null;
  return allowed.find((a) => a.toLowerCase() === t.toLowerCase()) ?? null;
}
