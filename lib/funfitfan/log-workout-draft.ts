/**
 * Persists activity + feel-so tags between /fff/log (Continue) and gym workout selfie (same tab).
 */

const STORAGE_KEY = 'fff_log_workout_draft_v1';

export type FffLogWorkoutDraft = {
  activity: string;
  feelSoTags: string[];
};

export function readFffLogWorkoutDraft(): FffLogWorkoutDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return null;
    const activity = typeof (o as FffLogWorkoutDraft).activity === 'string' ? (o as FffLogWorkoutDraft).activity : '';
    const tags = (o as FffLogWorkoutDraft).feelSoTags;
    const feelSoTags = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
    if (!activity.trim()) return null;
    return { activity: activity.trim(), feelSoTags };
  } catch {
    return null;
  }
}

export function writeFffLogWorkoutDraft(draft: FffLogWorkoutDraft): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function clearFffLogWorkoutDraft(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}
