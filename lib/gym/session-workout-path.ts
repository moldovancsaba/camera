export type GymSessionStepLogEntry = { stepOrder: number; completedAt: string; notes?: string };

/** Persisted on `stepLog[].notes` when the member skips a step (still advances the flow). */
export const GYM_STEP_SKIP_NOTE = 'gym:skip';

export type GymLessonStepLite = { order: number; title: string; detail?: string };

export function sortedLessonSteps(steps: GymLessonStepLite[]): GymLessonStepLite[] {
  return steps.slice().sort((a, b) => a.order - b.order);
}

export function visitedStepOrders(stepLog: GymSessionStepLogEntry[]): Set<number> {
  return new Set(stepLog.map((e) => e.stepOrder));
}

/**
 * Where to send the user when opening `/workout/session/:id` during an in-progress workout.
 * Returns `null` when the overview page should render (no auto-redirect).
 */
export function gymSessionLandingRedirect(opts: {
  sessionId: string;
  sortedSteps: GymLessonStepLite[];
  stepLog: GymSessionStepLogEntry[];
  hasSelfie: boolean;
  status: string;
}): string | null {
  const { sessionId, sortedSteps, stepLog, hasSelfie, status } = opts;
  if (status !== 'in_progress' || sortedSteps.length === 0) return null;
  const visited = visitedStepOrders(stepLog);
  for (let i = 0; i < sortedSteps.length; i++) {
    if (!visited.has(sortedSteps[i].order)) {
      return `/workout/session/${sessionId}/step/${i}`;
    }
  }
  if (!hasSelfie) return `/workout/session/${sessionId}/selfie`;
  return null;
}

/** Next route after SKIP or NEXT on step at `ordinal`. */
export function nextGymStepPath(opts: {
  sessionId: string;
  sortedSteps: GymLessonStepLite[];
  ordinal: number;
  hasSelfie: boolean;
  status: string;
}): string {
  const { sessionId, sortedSteps, ordinal, hasSelfie, status } = opts;
  if (status !== 'in_progress') return `/workout/session/${sessionId}`;
  const nextOrd = ordinal + 1;
  if (nextOrd < sortedSteps.length) return `/workout/session/${sessionId}/step/${nextOrd}`;
  if (!hasSelfie) return `/workout/session/${sessionId}/selfie`;
  return `/workout/session/${sessionId}`;
}
