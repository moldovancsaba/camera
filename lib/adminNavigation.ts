// WHAT: Single source of truth for the admin nav — both the sidebar
// (AdminChrome) and the dashboard's landing grid render from this array, so
// they can't drift the way they did before (the dashboard offered "Add New
// Frame" and "Users"/"Slideshows" appeared only in the sidebar).
// WHY: This is the messmass pattern (lib/adminNavigation.ts there) applied to
// camera's own role model (isGlobalAdmin / hasAnyPartnerAccess / hasEventsAccess
// instead of messmass's user.role), per the approved hybrid IA: Operations
// (renamed from "Try-On App") is a first-class section carrying the daily
// event-connected work — vetting, queue, analytics, cleanup — that was
// previously three navigation hops deep.

export interface AdminNavigationAccess {
  isGlobalAdmin: boolean;
  hasAnyPartnerAccess: boolean;
  hasEventsAccess: boolean;
}

export interface AdminNavItem {
  href: string;
  label: string;
  description: string;
  iconKey: string; // AdminIconKey, kept as string here to avoid a client-only import in a shared config
  tourId?: string;
  isVisible: (access: AdminNavigationAccess) => boolean;
}

export interface AdminNavSection {
  title: string;
  description: string;
  items: AdminNavItem[];
}

export const ADMIN_NAVIGATION: AdminNavSection[] = [
  {
    title: 'Overview',
    description: 'Start here — what needs attention across every event today.',
    items: [
      {
        href: '/admin',
        label: 'Dashboard',
        description: 'Pending vetting, queue health, and events live today, in one place.',
        iconKey: 'layoutDashboard',
        tourId: 'admin-nav-dashboard',
        isVisible: (access) => access.isGlobalAdmin || access.hasAnyPartnerAccess,
      },
    ],
  },
  {
    title: 'Events',
    description: 'Run and configure individual event instances.',
    items: [
      {
        href: '/admin/events',
        label: 'Events',
        description: 'Create events, and open each one’s own vetting, setup, and gallery.',
        iconKey: 'brandDatabricks',
        tourId: 'admin-nav-events',
        isVisible: (access) => access.hasEventsAccess,
      },
    ],
  },
  {
    title: 'Operations',
    description: 'Daily work connected to events — vet results, watch the queue, review analytics.',
    items: [
      {
        href: '/admin/tryon',
        label: 'Operations',
        description: 'Vetting, queue, analytics, and identity cleanup across every event.',
        iconKey: 'sparkles',
        tourId: 'admin-nav-tryon',
        isVisible: (access) => access.isGlobalAdmin,
      },
    ],
  },
  {
    title: 'Libraries',
    description: 'Shared resources events draw on — frames, logos, garments, and pages.',
    items: [
      {
        href: '/admin/frames',
        label: 'Global Frames',
        description: 'Shared frame inventory available to any event.',
        iconKey: 'frame',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/logos',
        label: 'Global Logos',
        description: 'Shared logo inventory available to any event.',
        iconKey: 'photo',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/tryon/suits',
        label: 'Garments',
        description: 'The try-on garment catalog shared across events.',
        iconKey: 'photo',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/tryon/setups',
        label: 'AI Setups',
        description: 'Try-on processing presets (previously editable only by hand in the database).',
        iconKey: 'sparkles',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/landing-pages',
        label: 'Landing Pages',
        description: 'Cross-event landing page inventory.',
        iconKey: 'world',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/slideshows',
        label: 'Slideshows',
        description: 'Cross-event slideshow inventory.',
        iconKey: 'photoScan',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/submissions',
        label: 'Global Galleries',
        description: 'Cross-partner submission galleries.',
        iconKey: 'photoScan',
        isVisible: (access) => access.isGlobalAdmin,
      },
    ],
  },
  {
    title: 'Access',
    description: 'Partners and the people who work in them.',
    items: [
      {
        href: '/admin/partners',
        label: 'Partners',
        description: 'Partner workspaces, defaults, and user access.',
        iconKey: 'buildingStore',
        tourId: 'admin-nav-partners',
        isVisible: (access) => access.hasAnyPartnerAccess,
      },
      {
        href: '/admin/users',
        label: 'Users',
        description: 'Every identity across the platform and their partner access.',
        iconKey: 'users',
        tourId: 'admin-nav-users',
        isVisible: (access) => access.isGlobalAdmin,
      },
    ],
  },
];

export function getVisibleAdminNavSections(access: AdminNavigationAccess): AdminNavSection[] {
  return ADMIN_NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.isVisible(access)),
  })).filter((section) => section.items.length > 0);
}
