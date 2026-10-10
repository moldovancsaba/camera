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
export function getAdminTourSteps(navigationAccess: AdminNavigationAccess, options: { inContext?: boolean } = {}): TourStepConfig[] {
  // Inside one event or partner the sidebar shows that item's own menu (issue 426), so the steps that point at main menu items have nothing to point at: the tour then is the context menu and the account panel.
  if (options.inContext) {
    return [
      {
        id: 'admin-context-menu',
        targetSelector: '[data-tour-id="admin-context-menu"]',
        title: 'This event or partner',
        description: 'Everything about it is in this menu. "Back to the main menu" is always the first item.',
      },
      {
        id: 'admin-account-panel',
        targetSelector: '[data-tour-id="admin-account-panel"]',
        title: 'Your account',
        description: 'Check your role, jump back to the public app, or log out from here.',
      },
    ];
  }
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
      id: 'admin-nav-vetting',
      targetSelector: '[data-tour-id="admin-nav-vetting"]',
      title: 'Vetting',
      description: 'Approve or reject the photos that wait for a decision.',
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
