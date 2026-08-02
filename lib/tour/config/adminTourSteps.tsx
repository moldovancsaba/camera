import type { TourStepConfig } from '../types';

export interface AdminNavigationAccess {
  isGlobalAdmin: boolean;
  hasAnyPartnerAccess: boolean;
  hasEventsAccess: boolean;
}

/**
 * Step availability is decided here, at config-build time, from the same
 * navigationAccess object AdminChrome already receives -- unlike the
 * capture tour's steps, none of these need a runtime DOM check.
 */
export function getAdminTourSteps(navigationAccess: AdminNavigationAccess): TourStepConfig[] {
  const steps: TourStepConfig[] = [];

  if (navigationAccess.hasEventsAccess) {
    steps.push({
      id: 'admin-nav-events',
      targetSelector: '[data-tour-id="admin-nav-events"]',
      title: 'Events',
      description: 'Manage your live event capture flows, frames, and galleries from here.',
    });
  }
  if (navigationAccess.isGlobalAdmin) {
    steps.push({
      id: 'admin-nav-tryon',
      targetSelector: '[data-tour-id="admin-nav-tryon"]',
      title: 'Try-On App',
      description: 'Configure and monitor the AI try-on experience.',
    });
  }
  if (navigationAccess.isGlobalAdmin) {
    steps.push({
      id: 'admin-nav-dashboard',
      targetSelector: '[data-tour-id="admin-nav-dashboard"]',
      title: 'Dashboard',
      description: 'Your at-a-glance overview of frames, submissions, and active users.',
    });
  }
  if (navigationAccess.hasAnyPartnerAccess) {
    steps.push({
      id: 'admin-nav-partners',
      targetSelector: '[data-tour-id="admin-nav-partners"]',
      title: 'Partners',
      description: 'The operational home for day-to-day partner management.',
    });
  }
  if (navigationAccess.isGlobalAdmin) {
    steps.push({
      id: 'admin-nav-users',
      targetSelector: '[data-tour-id="admin-nav-users"]',
      title: 'Users',
      description: 'Manage who has access to partner workspaces.',
    });
  }
  if (navigationAccess.isGlobalAdmin) {
    steps.push({
      id: 'admin-resource-inventory',
      targetSelector: '[data-tour-id="admin-resource-inventory"]',
      title: 'Resource Inventory',
      description: 'Shared frames, logos, landing pages, slideshows, and galleries used across every partner and event.',
    });
  }

  steps.push({
    id: 'admin-account-panel',
    targetSelector: '[data-tour-id="admin-account-panel"]',
    title: 'Your account',
    description: 'Check your role, jump back to the public app, or log out from here.',
  });

  return steps;
}
