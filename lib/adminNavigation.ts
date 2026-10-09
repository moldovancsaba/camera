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
      {
        href: '/admin/tryon/maintenance',
        label: 'Maintenance',
        description: 'Worker health, data integrity audit, and job reconciliation.',
        iconKey: 'tool',
        isVisible: (access) => access.isGlobalAdmin,
      },
    ],
  },
  {
    title: 'Libraries',
    description: 'Shared resources events draw on — frames, logos, images, garments, and pages.',
    items: [
      {
        href: '/admin/frames',
        label: 'Global Frames',
        description: 'Shared frame inventory available to any event.',
        iconKey: 'frame',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/frames/generated',
        label: 'Generated Frames',
        description: 'Roll the generated default frame out to events without a frame of their own.',
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
        href: '/admin/images',
        label: 'Global Images',
        description: 'Pictures for the welcome page, the CTA page, the email footer and the giant screen, for partners to take.',
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
    title: 'Settings',
    description: 'App-wide admin UI preferences, shared by every admin.',
    items: [
      {
        href: '/admin/settings/card-display',
        label: 'Vetting Card Display',
        description: 'Choose which fields and action buttons appear on the Vetting moderation card.',
        iconKey: 'adjustments',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/settings/defaults',
        label: 'Journey defaults',
        description: 'The one switch that gives existing events the journey defaults, such as the consent page.',
        iconKey: 'adjustments',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/dictionary',
        label: 'Dictionary',
        description: 'Every default text of the user journey in English and Hungarian, and the global wording of each.',
        iconKey: 'adjustments',
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

// ---------------------------------------------------------------------------
// The context menu (issue 426, docs/BUILDING_BRICKS.md section 7): inside one event or one partner the sidebar shows that item's own menu, with "Back to the main
// menu" first, instead of the main menu plus a tab bar. The context comes from the path alone, so deep links and bookmarks work unchanged.
// ---------------------------------------------------------------------------

export type AdminContextKind = 'event' | 'partner';

export interface AdminContext {
  kind: AdminContextKind;
  /** The Mongo id of the event or the partner, as it is in the path. */
  id: string;
}

/** `/admin/events/<id>` and everything under it is the event's context, `/admin/partners/<id>` the partner's; `new` and every other path are the main menu. */
export function adminContextOf(pathname: string): AdminContext | null {
  const match = /^\/admin\/(events|partners)\/([^/?#]+)(?:\/|$)/.exec(pathname);
  if (!match || match[2] === 'new') return null;
  return { kind: match[1] === 'events' ? 'event' : 'partner', id: match[2] };
}

export interface AdminContextItem {
  label: string;
  description: string;
  iconKey: string;
  /** The path after the event's or partner's own, with an optional #anchor for a section of the overview page; empty is the overview. */
  path: string;
  /** Paths (after the base) that make this item the active one, besides its own: the pages it opens, such as the editor of one slideshow. */
  also?: string[];
  tourId?: string;
  isVisible: (access: AdminNavigationAccess) => boolean;
}

const everyone = () => true;
const globalAdminOnly = (access: AdminNavigationAccess) => access.isGlobalAdmin;

/**
 * The event menu: every page of an event, so each editor is one click away. Queue and Analytics are for global admins (a partner user is sent away from
 * them). The slideshow, landing page and layout editors are reached from their lists on the overview, so those items point at the section there.
 */
export const EVENT_CONTEXT_MENU: AdminContextItem[] = [
  { label: 'Overview', description: 'The event at a glance.', iconKey: 'layoutDashboard', path: '', isVisible: everyone },
  { label: 'Edit and pages', description: 'The event settings and the pages of the user journey.', iconKey: 'adjustments', path: '/edit', isVisible: everyone },
  { label: 'Vetting', description: 'Photos waiting for approval and try-on results.', iconKey: 'userShield', path: '/vetting', isVisible: everyone },
  { label: 'Queue', description: 'The try-on queue of the event.', iconKey: 'sparkles', path: '/queue', isVisible: globalAdminOnly },
  { label: 'Analytics', description: 'Try-on analytics of the event.', iconKey: 'brandDatabricks', path: '/analytics', isVisible: globalAdminOnly },
  { label: 'Logos', description: 'The logo of the event and of each place it shows.', iconKey: 'photo', path: '/logos', isVisible: everyone },
  { label: 'Frames', description: 'The frames of the event.', iconKey: 'frame', path: '/frames', isVisible: everyone },
  { label: 'Images', description: 'The pictures the event can use.', iconKey: 'photo', path: '/images', isVisible: everyone },
  { label: 'Texts', description: 'The wording of the default texts for this event.', iconKey: 'adjustments', path: '/texts', isVisible: everyone },
  { label: 'Slideshows', description: 'The slideshows and the welcome page screen.', iconKey: 'photoScan', path: '#slideshows', also: ['/slideshows', '/layouts'], isVisible: everyone },
  { label: 'Landing pages', description: 'The landing pages of the event.', iconKey: 'world', path: '#landing-pages', also: ['/landing-pages'], isVisible: everyone },
];

/** The partner menu: its pages. Its events and its users are cards on the overview that lead to the events list and the users page, which are main-menu pages, so they are not items here. */
export const PARTNER_CONTEXT_MENU: AdminContextItem[] = [
  { label: 'Overview', description: 'The partner at a glance.', iconKey: 'buildingStore', path: '', isVisible: everyone },
  { label: 'Edit', description: 'The partner settings.', iconKey: 'adjustments', path: '/edit', isVisible: everyone },
  { label: 'Logos', description: 'The logo of the partner: the default of all its events.', iconKey: 'photo', path: '/logos', isVisible: everyone },
  { label: 'Frames', description: 'The frames of the partner.', iconKey: 'frame', path: '/frames', isVisible: everyone },
  { label: 'Images', description: 'The pictures the partner and its events can use.', iconKey: 'photo', path: '/images', isVisible: everyone },
  { label: 'Pictures', description: 'The default pictures of the welcome page, the CTA page and the e-mails of all events of the partner.', iconKey: 'photo', path: '/pictures', isVisible: everyone },
  { label: 'Texts', description: 'The wording of the default texts for all events of the partner.', iconKey: 'adjustments', path: '/texts', isVisible: everyone },
];

export interface AdminContextMenu {
  title: string;
  items: Array<{ label: string; href: string; iconKey: string; active: boolean; tourId?: string }>;
}

/** The menu of a context for a user: the items that user may see, each with its address and whether the path being shown belongs to it. */
export function adminContextMenu(context: AdminContext, pathname: string, access: AdminNavigationAccess): AdminContextMenu {
  const base = `/admin/${context.kind === 'event' ? 'events' : 'partners'}/${context.id}`;
  const defs = context.kind === 'event' ? EVENT_CONTEXT_MENU : PARTNER_CONTEXT_MENU;
  const clean = pathname.split(/[?#]/)[0].replace(/\/$/, '');
  const inside = (relative: string) => clean === base + relative || clean.startsWith(`${base}${relative}/`);
  return {
    title: context.kind === 'event' ? 'Event' : 'Partner',
    items: defs
      .filter((item) => item.isVisible(access))
      .map((item) => {
        const own = item.path.startsWith('#') ? '' : item.path;
        // The overview is active only on its own address; an item that points at a section of it is active on the pages that section opens, never on the overview itself.
        const active = item.path === '' ? clean === base : [own, ...(item.also ?? [])].filter(Boolean).some(inside);
        return { label: item.label, href: base + item.path, iconKey: item.iconKey, active, tourId: item.tourId };
      }),
  };
}
