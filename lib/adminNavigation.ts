// WHAT: Single source of truth for the admin nav — both the sidebar
// (AdminChrome) and the dashboard's landing grid render from this array, so
// they can't drift the way they did before (the dashboard offered "Add New
// Frame" and "Users"/"Slideshows" appeared only in the sidebar).
// WHY: This is the messmass pattern (lib/adminNavigation.ts there) applied to
// camera's own role model (isGlobalAdmin / hasAnyPartnerAccess / hasEventsAccess
// instead of messmass's user.role), per the approved hybrid IA: Operations
// is a first-class section carrying the daily event-connected work (vetting,
// analytics), which was previously three navigation hops deep. (It was the
// "Try-On App" until the try-on integration was removed, issue 557.)

export interface AdminNavigationAccess {
  isGlobalAdmin: boolean;
  hasAnyPartnerAccess: boolean;
  hasEventsAccess: boolean;
}

/** One ordering source for the global sidebar and every scoped workspace menu. */
export const ADMIN_NAV_GROUP_ORDER = ['Overview', 'Org', 'Operations', 'Blocks', 'Content', 'Settings'] as const;
export type AdminNavGroup = (typeof ADMIN_NAV_GROUP_ORDER)[number];

/** Shared ordering for the reusable blocks exposed at global, partner, and event scope. */
export const ADMIN_BLOCK_ITEM_ORDER = [
  'images',
  'frames',
  'frame-slots',
  'logos',
  'selfies',
  'stadiums',
  'dictionary',
  'vetting-words',
  'email',
] as const;
export type AdminBlockItemKey = (typeof ADMIN_BLOCK_ITEM_ORDER)[number];

function orderBlockItems<T extends { blockKey?: AdminBlockItemKey }>(items: T[]): T[] {
  const rank = new Map(ADMIN_BLOCK_ITEM_ORDER.map((key, index) => [key, index]));
  return [...items].sort((a, b) => (rank.get(a.blockKey ?? 'images') ?? 0) - (rank.get(b.blockKey ?? 'images') ?? 0));
}

export interface AdminNavItem {
  href: string;
  label: string;
  description: string;
  iconKey: string; // AdminIconKey, kept as string here to avoid a client-only import in a shared config
  blockKey?: AdminBlockItemKey;
  tourId?: string;
  isVisible: (access: AdminNavigationAccess) => boolean;
}

export interface AdminNavSection {
  title: AdminNavGroup;
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
        description: 'Photos waiting for approval and events live today, in one place.',
        iconKey: 'layoutDashboard',
        tourId: 'admin-nav-dashboard',
        isVisible: (access) => access.isGlobalAdmin || access.hasAnyPartnerAccess,
      },
      {
        href: '/admin/settings/activity-log',
        label: 'Activity log',
        description: 'Who changed what and when, and every refused or failed request.',
        iconKey: 'adjustments',
        isVisible: (access) => access.isGlobalAdmin,
      },
    ],
  },
  {
    title: 'Org',
    description: 'Manage partners and their events.',
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
    description: 'Daily work connected to events — vet the photos waiting for approval, read the numbers.',
    items: [
      {
        href: '/admin/vetting',
        label: 'Vetting',
        description: 'Photos waiting for approval, by event.',
        iconKey: 'userShield',
        tourId: 'admin-nav-vetting',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/analytics',
        label: 'Analytics',
        description: 'Photos, vetting, users, screens, e-mails and consents of every event.',
        iconKey: 'brandDatabricks',
        isVisible: (access) => access.isGlobalAdmin,
      },
    ],
  },
  {
    title: 'Blocks',
    description: 'Global building blocks inherited by partners and events.',
    items: orderBlockItems([
      {
        href: '/admin/images',
        label: 'Global Images',
        description: 'Pictures for welcome pages, CTA pages, e-mail footers, and giant screens.',
        iconKey: 'photo',
        blockKey: 'images',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/frames',
        label: 'Global Frames',
        description: 'Shared frame inventory available to any event.',
        iconKey: 'frame',
        blockKey: 'frames',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/settings/frame-slots',
        label: 'Global Frame Slots',
        description: 'The slots used to compose generated frames.',
        iconKey: 'frame',
        blockKey: 'frame-slots',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/logos',
        label: 'Global Logos',
        description: 'Shared logo inventory available to any event.',
        iconKey: 'photo',
        blockKey: 'logos',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/sample-selfies',
        label: 'Global Selfies',
        description: 'The general selfies that fill the photo window of the welcome page screen until a partner or an event chooses its own.',
        iconKey: 'photo',
        blockKey: 'selfies',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/stadium-backgrounds',
        label: 'Global Stadiums',
        description: 'The general pictures the stage of an event’s default slideshow is drawn on, until a partner or an event chooses its own.',
        iconKey: 'photo',
        blockKey: 'stadiums',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/dictionary',
        label: 'Global Dictionary',
        description: 'Guest-facing journey texts, including the global QR text library.',
        iconKey: 'adjustments',
        blockKey: 'dictionary',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/settings/annotation-words',
        label: 'Global Vetting words',
        description: 'The vocabulary reviewers use across partners and events.',
        iconKey: 'adjustments',
        blockKey: 'vetting-words',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/settings/emails',
        label: 'Global Email',
        description: 'Global legal and follow-up email settings inherited by partners and events.',
        iconKey: 'mail',
        blockKey: 'email',
        isVisible: (access) => access.isGlobalAdmin,
      },
    ]),
  },
  {
    title: 'Content',
    description: 'Journey composition and reusable content that can be shared with partners and events.',
    items: [
      {
        href: '/admin/settings/experience',
        label: 'Global User Journey',
        description: 'Choose the reusable guest journey inherited by partners and events.',
        iconKey: 'layoutDashboard',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/landing-pages',
        label: 'Global Landing Pages',
        description: 'Cross-event landing page inventory.',
        iconKey: 'world',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/slideshows',
        label: 'Global Slideshows',
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
    description: 'Shared application defaults and account access.',
    items: [
      {
        href: '/admin/settings/defaults',
        label: 'Experience defaults',
        description: 'Default user-journey settings applied to events that follow global defaults.',
        iconKey: 'adjustments',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/settings/service',
        label: 'Service',
        description: 'Maintenance, backfills, and system health tools for global administrators.',
        iconKey: 'tool',
        isVisible: (access) => access.isGlobalAdmin,
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
  const byTitle = new Map(ADMIN_NAVIGATION.map((section) => [section.title, section]));
  return ADMIN_NAV_GROUP_ORDER.flatMap((title) => {
    const section = byTitle.get(title);
    if (!section) return [];
    const items = section.items.filter((item) => item.isVisible(access));
    return items.length ? [{ ...section, items }] : [];
  });
}

// ---------------------------------------------------------------------------
// Context menus use the same six groups as the global sidebar; only groups with
// pages at the current level render. The context comes from the path alone, so
// deep links and bookmarks continue to open the matching event or partner menu.
// ---------------------------------------------------------------------------

export type AdminContextKind = 'event' | 'partner';

export interface AdminContext {
  kind: AdminContextKind;
  /** The Mongo id of the event or the partner, as it is in the path. */
  id: string;
}

/** `/admin/events/<id>` and everything under it is the event's context, `/admin/partners/<id>` the partner's; `new` and every other path are the main menu. */
export function adminContextOf(pathname: string): AdminContext | null {
  const route = pathname.split(/[?#]/)[0];
  const match = /^\/admin\/(events|partners)\/([^/?#]+)(?:\/|$)/.exec(route);
  if (!match || match[2] === 'new') return null;
  return { kind: match[1] === 'events' ? 'event' : 'partner', id: match[2] };
}

export interface AdminContextItem {
  section: AdminNavGroup;
  label: string;
  description: string;
  iconKey: string;
  blockKey?: AdminBlockItemKey;
  /** The path after the event's or partner's own, with an optional #anchor for a section of the overview page; empty is the overview. */
  path: string;
  /** Paths (after the base) that make this item the active one, besides its own: the pages it opens, such as the editor of one slideshow. */
  also?: string[];
  tourId?: string;
  isVisible: (access: AdminNavigationAccess) => boolean;
}

const everyone = () => true;

/**
 * The event menu: every page of an event, so each editor is one click away. Analytics (issue 521) is for the event's managers like Vetting. The slideshow, landing page and layout editors are reached from their lists on the overview, so those items point at the section there.
 */
const scopedItems = (kind: AdminContextKind): AdminContextItem[] => {
  const scope = kind === 'event' ? 'Event' : 'Partner';
  const userJourney: AdminContextItem = kind === 'event'
    ? { section: 'Content', label: 'Event User Journey', description: 'Choose, edit and order the pages guests see for this event.', iconKey: 'layoutDashboard', path: '/pages', isVisible: everyone }
    : { section: 'Content', label: 'Partner User Journey', description: 'Choose the reusable guest journey inherited by this partner’s events.', iconKey: 'layoutDashboard', path: '#partner-user-journey', isVisible: everyone };
  const sharedBlocks: AdminContextItem[] = orderBlockItems([
    { section: 'Blocks', label: `${scope} Images`, description: `The pictures available to ${scope.toLowerCase()} content.`, iconKey: 'photo', blockKey: 'images', path: '/images', ...(kind === 'partner' ? { also: ['/pictures'] } : {}), isVisible: everyone },
    { section: 'Blocks', label: `${scope} Frames`, description: `The frames available to ${scope.toLowerCase()} content.`, iconKey: 'frame', blockKey: 'frames', path: '/frames', isVisible: everyone },
    { section: 'Blocks', label: `${scope} Frame Slots`, description: `The default slots used to compose generated frames for ${scope.toLowerCase()} events.`, iconKey: 'frame', blockKey: 'frame-slots', path: '/frame-slots', isVisible: everyone },
    { section: 'Blocks', label: `${scope} Logos`, description: `The logos available to ${scope.toLowerCase()} content.`, iconKey: 'photo', blockKey: 'logos', path: '/logos', isVisible: everyone },
    { section: 'Blocks', label: `${scope} Selfies`, description: `The sample selfie shown on ${scope.toLowerCase()} welcome screens.`, iconKey: 'photo', blockKey: 'selfies', path: '/selfies', isVisible: everyone },
    { section: 'Blocks', label: `${scope} Stadiums`, description: `The stadium backgrounds available to ${scope.toLowerCase()} slideshow stages.`, iconKey: 'photo', blockKey: 'stadiums', path: '/stadiums', isVisible: everyone },
    { section: 'Blocks', label: `${scope} Dictionary`, description: `Guest-facing text overrides for ${scope.toLowerCase()}; blank values follow the parent level.`, iconKey: 'adjustments', blockKey: 'dictionary', path: '/texts', isVisible: everyone },
    { section: 'Blocks', label: `${scope} Vetting words`, description: `The vocabulary reviewers use for ${scope.toLowerCase()} photos.`, iconKey: 'adjustments', blockKey: 'vetting-words', path: '/annotation-words', isVisible: everyone },
    { section: 'Blocks', label: `${scope} Email`, description: `The e-mail content and legal text used at ${scope.toLowerCase()} level.`, iconKey: 'mail', blockKey: 'email', path: '/emails', isVisible: everyone },
  ]);
  const contentItems: AdminContextItem[] = kind === 'event'
    ? [
        userJourney,
        { section: 'Content', label: 'Event Landing Pages', description: 'The landing pages of the event.', iconKey: 'world', path: '#landing-pages', also: ['/landing-pages'], isVisible: everyone },
        { section: 'Content', label: 'Event Slideshows', description: 'The slideshows and the welcome page screen.', iconKey: 'photoScan', path: '#slideshows', also: ['/slideshows', '/layouts'], isVisible: everyone },
        { section: 'Content', label: 'Event Gallery', description: 'The event photos: upload, select, and manage visibility.', iconKey: 'photoScan', path: '/gallery', isVisible: everyone },
      ]
    : [
        userJourney,
        { section: 'Content', label: 'Partner Landing Pages', description: 'Set the landing page template inherited by this partner’s events.', iconKey: 'world', path: '/landing-pages', isVisible: everyone },
        { section: 'Content', label: 'Partner Slideshows', description: 'Set the slideshow defaults inherited by this partner’s events.', iconKey: 'photoScan', path: '/slideshows', isVisible: everyone },
        { section: 'Content', label: 'Partner Gallery', description: 'Photos captured across this partner’s events.', iconKey: 'photoScan', path: '#partner-gallery', isVisible: everyone },
      ];
  const operations: AdminContextItem[] = kind === 'event'
    ? [
        { section: 'Operations', label: 'Vetting', description: 'Photos waiting for approval.', iconKey: 'userShield', path: '/vetting', isVisible: everyone },
        { section: 'Operations', label: 'Photo analysis', description: 'Analyse eligible photos and review Fanmass results.', iconKey: 'photoScan', path: '/analysis', isVisible: everyone },
        { section: 'Operations', label: 'Analytics', description: 'Photos, vetting, users, screens, e-mails and consents of the event.', iconKey: 'brandDatabricks', path: '/analytics', isVisible: everyone },
      ]
    : [];
  const intro: AdminContextItem[] = kind === 'event'
    ? [
        { section: 'Overview', label: 'Overview', description: 'The event at a glance.', iconKey: 'layoutDashboard', path: '', isVisible: everyone },
        { section: 'Org', label: 'Edit', description: 'The event details and capture experience settings.', iconKey: 'adjustments', path: '/edit', isVisible: everyone },
      ]
    : [
        { section: 'Overview', label: 'Overview', description: 'The partner at a glance.', iconKey: 'buildingStore', path: '', isVisible: everyone },
        { section: 'Org', label: 'Edit', description: 'The partner settings.', iconKey: 'adjustments', path: '/edit', isVisible: everyone },
      ];
  return [...intro, ...operations, ...sharedBlocks, ...contentItems];
};

/** Both workspaces are derived from the same ordered block/content definitions. */
export const EVENT_CONTEXT_MENU = scopedItems('event');
export const PARTNER_CONTEXT_MENU = scopedItems('partner');

export interface AdminContextMenu {
  title: string;
  sections: Array<{ title: AdminNavGroup; items: Array<{ label: string; href: string; iconKey: string; active: boolean; tourId?: string }> }>;
  items: Array<{ label: string; href: string; iconKey: string; active: boolean; tourId?: string }>;
}

/** The menu of a context for a user: the items that user may see, each with its address and whether the path being shown belongs to it. */
export function adminContextMenu(context: AdminContext, pathname: string, access: AdminNavigationAccess): AdminContextMenu {
  const base = `/admin/${context.kind === 'event' ? 'events' : 'partners'}/${context.id}`;
  const defs = context.kind === 'event' ? EVENT_CONTEXT_MENU : PARTNER_CONTEXT_MENU;
  const [pathAndQuery, hashPart] = pathname.split('#', 2);
  const clean = pathAndQuery.split('?')[0].replace(/\/$/, '');
  const currentHash = hashPart ? `#${hashPart}` : '';
  const inside = (relative: string) => clean === base + relative || clean.startsWith(`${base}${relative}/`);
  const items = defs
      .filter((item) => item.isVisible(access))
      .map((item) => {
        const [ownPath, itemHash] = item.path.split('#', 2);
        const own = ownPath || '';
        // The overview is active only on its own address; an item that points at a section of it is active on the pages that section opens, never on the overview itself.
        const active = item.path === ''
          ? clean === base && !currentHash
          : itemHash
            ? (clean === base + own && currentHash === `#${itemHash}`) || (item.also ?? []).some(inside)
            : [own, ...(item.also ?? [])].filter(Boolean).some(inside);
        return { section: item.section, label: item.label, href: base + item.path, iconKey: item.iconKey, active, tourId: item.tourId };
      });
  const publicItem = (item: (typeof items)[number]) => ({
    label: item.label,
    href: item.href,
    iconKey: item.iconKey,
    active: item.active,
    tourId: item.tourId,
  });
  return {
    title: context.kind === 'event' ? 'Event' : 'Partner',
    sections: ADMIN_NAV_GROUP_ORDER.map((title) => ({
      title,
      items: items.filter((item) => item.section === title).map(publicItem),
    })).filter((section) => section.items.length > 0),
    items: items.map(publicItem),
  };
}
