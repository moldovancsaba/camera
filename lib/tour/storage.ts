'use client';

import type { TourSeenRecord, TourSeenStatus } from './types';

// WHAT: plain per-key localStorage flag, no framework.
// WHY: mirrors the only existing localStorage precedent in this app
//     (components/landing/LandingPageCookieConsent.tsx) rather than
//     introducing new state-management infrastructure for a single flag.
function storageKey(tourId: string): string {
  return `camera-tour:${tourId}`;
}

export function hasTourBeenSeen(tourId: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(storageKey(tourId)) !== null;
}

export function markTourSeen(tourId: string, status: TourSeenStatus): void {
  if (typeof window === 'undefined') return;
  const record: TourSeenRecord = { status, at: new Date().toISOString() };
  window.localStorage.setItem(storageKey(tourId), JSON.stringify(record));
}

export function clearTourSeen(tourId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey(tourId));
}
