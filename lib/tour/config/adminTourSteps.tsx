import type { TourStepConfig } from '../types';
import { adminAccountText } from '@/lib/i18n/admin-account';
import { adminTourText } from '@/lib/i18n/admin-tour';
import { adminPageText } from '@/lib/i18n/admin-pages';
import type { UiLanguage } from '@/lib/i18n';

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
export function getAdminTourSteps(navigationAccess: AdminNavigationAccess, options: { inContext?: boolean; contextKind?: 'event' | 'partner'; language?: UiLanguage } = {}): TourStepConfig[] {
  const language = options.language ?? 'en';
  const tour = (text: string) => adminTourText(text, language);
  const admin = (text: string) => adminPageText(text, language);
  // Inside one event or partner the sidebar shows that item's own menu (issue 426), so the steps that point at main menu items have nothing to point at: the tour then is the context menu and the account panel.
  if (options.inContext) {
    return [
      {
        id: 'admin-context-menu',
        targetSelector: '[data-tour-id="admin-context-menu"]',
        title: admin(options.contextKind === 'event' ? 'Event' : 'Partner'),
        description: tour('Everything about this workspace is in this menu. The first item returns to the main menu.'),
      },
      {
        id: 'admin-account-panel',
        targetSelector: '[data-tour-id="admin-account-panel"]',
        title: adminAccountText('Account settings', language),
        description: tour('View your role, return to Camera, or sign out here.'),
      },
    ];
  }
  const steps: TourStepConfig[] = [];

  if (navigationAccess.hasEventsAccess) {
    steps.push({
      id: 'admin-nav-events',
      targetSelector: '[data-tour-id="admin-nav-events"]',
      title: admin('Events'),
      description: tour('Manage live event journeys, frames, and galleries here.'),
    });
  }
  if (navigationAccess.isGlobalAdmin) {
    steps.push({
      id: 'admin-nav-vetting',
      targetSelector: '[data-tour-id="admin-nav-vetting"]',
      title: admin('Vetting'),
      description: tour('Approve or reject photos waiting for review.'),
    });
  }
  if (navigationAccess.isGlobalAdmin) {
    steps.push({
      id: 'admin-nav-dashboard',
      targetSelector: '[data-tour-id="admin-nav-dashboard"]',
      title: admin('Dashboard'),
      description: tour('See key totals for frames, submissions, and active users.'),
    });
  }
  if (navigationAccess.hasAnyPartnerAccess) {
    steps.push({
      id: 'admin-nav-partners',
      targetSelector: '[data-tour-id="admin-nav-partners"]',
      title: admin('Partners'),
      description: tour('Manage partner workspaces and their settings here.'),
    });
  }
  if (navigationAccess.isGlobalAdmin) {
    steps.push({
      id: 'admin-nav-users',
      targetSelector: '[data-tour-id="admin-nav-users"]',
      title: admin('Users'),
      description: tour('Manage access to partner workspaces.'),
    });
  }
  if (navigationAccess.isGlobalAdmin) {
    steps.push({
      id: 'admin-resource-inventory',
      targetSelector: '[data-tour-id="admin-resource-inventory"]',
      title: admin('Resource Inventory'),
      description: tour('Manage shared frames, logos, landing pages, slideshows, and galleries.'),
    });
  }

  steps.push({
    id: 'admin-account-panel',
    targetSelector: '[data-tour-id="admin-account-panel"]',
    title: adminAccountText('Account settings', language),
    description: tour('View your role, return to Camera, or sign out here.'),
  });

  return steps;
}
