/**
 * Logo Utilities
 * 
 * Helper functions for logo selection and display
 */

import { LogoScenario } from '@/lib/db/schemas';

export interface LogoAssignment {
  logoId: string;
  scenario: string;
  order: number;
  isActive: boolean;
  imageUrl?: string;
  name?: string;
}

/**
 * Select a random logo from active logos in a scenario
 * 
 * @param logos - Array of logo assignments for an event
 * @param scenario - The scenario to filter by
 * @returns Selected logo or null if no active logos
 */
export function selectRandomLogo(
  logos: LogoAssignment[],
  scenario: LogoScenario | string
): LogoAssignment | null {
  // Filter active logos for this scenario
  const activeLogos = logos.filter(
    (l) => l.scenario === scenario && l.isActive
  );

  if (activeLogos.length === 0) return null;
  if (activeLogos.length === 1) return activeLogos[0];

  // Random selection
  const randomIndex = Math.floor(Math.random() * activeLogos.length);
  return activeLogos[randomIndex];
}

/**
 * Get all active logos for a scenario
 * 
 * @param logos - Array of logo assignments for an event
 * @param scenario - The scenario to filter by
 * @returns Array of active logos
 */
export function getActiveLogos(
  logos: LogoAssignment[],
  scenario: LogoScenario | string
): LogoAssignment[] {
  return logos.filter((l) => l.scenario === scenario && l.isActive);
}
