'use client';

import {
  FFF_WORKOUT_ACTIVITY_COOKIE,
  FFF_WORKOUT_ACTIVITY_COOKIE_MAX_AGE,
} from '@/lib/workout/activity-cookie';

export function setWorkoutActivityCookieClient(activity: string): void {
  if (typeof document === 'undefined') return;
  const v = encodeURIComponent(activity.trim());
  if (!v) return;
  document.cookie = `${FFF_WORKOUT_ACTIVITY_COOKIE}=${v}; Path=/; Max-Age=${FFF_WORKOUT_ACTIVITY_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearWorkoutActivityCookieClient(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${FFF_WORKOUT_ACTIVITY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
