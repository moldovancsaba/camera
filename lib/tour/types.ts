import type { ReactNode } from 'react';

/**
 * One spotlighted step in a guided tour: `targetSelector` is a CSS selector
 * (usually `[data-tour-id="..."]`) resolved against the live DOM at step
 * time, not a ref -- the target may not exist yet when the tour is
 * configured (e.g. it's inside conditionally-rendered capture-flow UI).
 */
export interface TourStepConfig {
  id: string;
  targetSelector: string;
  title: ReactNode;
  description: ReactNode;
  /** Runtime check, e.g. "does this device expose a camera switch button". Omit for steps that are always available once included. */
  isAvailable?: () => boolean;
}

export type TourSeenStatus = 'completed' | 'skipped';

export interface TourSeenRecord {
  status: TourSeenStatus;
  at: string;
}
