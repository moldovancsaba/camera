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
    items: [
      {
        href: '/admin/images',
        label: 'Global Images',
        description: 'Pictures for welcome pages, CTA pages, e-mail footers, and giant screens.',
        iconKey: 'photo',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/frames',
        label: 'Global Frames',
        description: 'Shared frame inventory available to any event.',
        iconKey: 'frame',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/frames/generated',
        label: 'Generated Frame Rollout',
        description: 'Dry-run and apply the generated default frame to events that do not have their own.',
        iconKey: 'frame',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/settings/frame-slots',
        label: 'Global Frame Slots',
        description: 'The slots used to compose generated frames.',
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
        href: '/admin/sample-selfies',
        label: 'Global Selfies',
        description: 'The general selfies that fill the photo window of the welcome page screen until a partner or an event chooses its own.',
        iconKey: 'photo',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/stadium-backgrounds',
        label: 'Global Stadiums',
        description: 'The general pictures the stage of an event’s default slideshow is drawn on, until a partner or an event chooses its own.',
        iconKey: 'photo',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/dictionary',
        label: 'Global Dictionary',
        description: 'Guest-facing journey texts, including the global QR text library.',
        iconKey: 'adjustments',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/settings/annotation-words',
        label: 'Global Vetting words',
        description: 'The vocabulary reviewers use across partners and events.',
        iconKey: 'adjustments',
        isVisible: (access) => access.isGlobalAdmin,
      },
      {
        href: '/admin/settings/emails',
        label: 'Global Email',
        description: 'Global legal and follow-up email settings inherited by partners and events.',
        iconKey: 'mail',
        isVisible: (access) => access.isGlobalAdmin,
      },
    ],
  },
  {
    title: 'Content',
    description: 'Global content that can be reused across events.',
    items: [
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
      {
        href: '/admin/settings/experience',
        label: 'Global User Journey',
        description: 'Choose the reusable guest journey inherited by partners and events.',
        iconKey: 'layoutDashboard',
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
        label: 'Journey defaults',
        description: 'Default user-journey settings applied to events that follow global defaults.',
        iconKey: 'adjustments',
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
  return ADMIN_NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.isVisible(access)),
  })).filter((section) => section.items.length > 0);
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
  /** The path after the event's or partner's own, with an optional #anchor for a section of the overview page; empty is the overview. */
  path: string;
  /** Paths (after the base) that make this item the active one, besides its own: the pages it opens, such as the editor of one slideshow. */
  also?: string[];
  tourId?: string;
  isVisible: (access: AdminNavigationAccess) => boolean;
}

export type AdminNavGroup = 'Overview' | 'Org' | 'Operations' | 'Blocks' | 'Content' | 'Settings';

const everyone = () => true;

/**
 * The event menu: every page of an event, so each editor is one click away. Analytics (issue 521) is for the event's managers like Vetting. The slideshow, landing page and layout editors are reached from their lists on the overview, so those items point at the section there.
 */
export const EVENT_CONTEXT_MENU: AdminContextItem[] = [
  { section: 'Overview', label: 'Overview', description: 'The event at a glance.', iconKey: 'layoutDashboard', path: '', isVisible: everyone },
  { section: 'Org', label: 'Edit', description: 'The event details and capture experience settings.', iconKey: 'adjustments', path: '/edit', isVisible: everyone },
  { section: 'Content', label: 'Event User Journey', description: 'Choose, edit and order the pages guests see for this event.', iconKey: 'layoutDashboard', path: '/pages', isVisible: everyone },
  { section: 'Operations', label: 'Vetting', description: 'Photos waiting for approval.', iconKey: 'userShield', path: '/vetting', isVisible: everyone },
  { section: 'Operations', label: 'Photo analysis', description: 'Analyse photos after vetting, or analyse all eligible photos when vetting is off.', iconKey: 'photoScan', path: '/analysis', isVisible: everyone },
  { section: 'Blocks', label: 'Event Vetting words', description: 'The words the reviewer describes a photo with at this event: gender, age, emotion, items and the reasons for a rejection.', iconKey: 'adjustments', path: '/annotation-words', isVisible: everyone },
  { section: 'Content', label: 'Event Gallery', description: 'The photos of the event: upload, select several at once, remove.', iconKey: 'photoScan', path: '/gallery', isVisible: everyone },
  { section: 'Operations', label: 'Analytics', description: 'Photos, vetting, users, screens, e-mails and consents of the event.', iconKey: 'brandDatabricks', path: '/analytics', isVisible: everyone },
  { section: 'Blocks', label: 'Event Logos', description: 'The logo of the event and of each place it shows.', iconKey: 'photo', path: '/logos', isVisible: everyone },
  { section: 'Blocks', label: 'Event Frames', description: 'The frames of the event.', iconKey: 'frame', path: '/frames', isVisible: everyone },
  { section: 'Blocks', label: 'Event Frame Slots', description: 'The slots used to compose this event’s generated frames.', iconKey: 'frame', path: '/frame-slots', isVisible: everyone },
  { section: 'Blocks', label: 'Event Images', description: 'The pictures the event can use.', iconKey: 'photo', path: '/images', isVisible: everyone },
  { section: 'Blocks', label: 'Event Selfies', description: 'The sample selfie shown on this event’s welcome screen.', iconKey: 'photo', path: '/selfies', isVisible: everyone },
  { section: 'Blocks', label: 'Event Stadiums', description: 'The stadium backgrounds available to this event’s default slideshow.', iconKey: 'photo', path: '/stadiums', isVisible: everyone },
  { section: 'Blocks', label: 'Event Dictionary', description: 'Guest-facing text overrides for this event; blank values follow the partner or global dictionary.', iconKey: 'adjustments', path: '/texts', isVisible: everyone },
  { section: 'Blocks', label: 'Event Email', description: 'The five e-mails the users get, their texts, the legal part and the sender.', iconKey: 'mail', path: '/emails', isVisible: everyone },
  { section: 'Content', label: 'Event Slideshows', description: 'The slideshows and the welcome page screen.', iconKey: 'photoScan', path: '#slideshows', also: ['/slideshows', '/layouts'], isVisible: everyone },
  { section: 'Content', label: 'Event Landing Pages', description: 'The landing pages of the event.', iconKey: 'world', path: '#landing-pages', also: ['/landing-pages'], isVisible: everyone },
];

/** The partner menu: its pages. Its events and its users are cards on the overview that lead to the events list and the users page, which are main-menu pages, so they are not items here. */
export const PARTNER_CONTEXT_MENU: AdminContextItem[] = [
  { section: 'Overview', label: 'Overview', description: 'The partner at a glance.', iconKey: 'buildingStore', path: '', isVisible: everyone },
  { section: 'Org', label: 'Edit', description: 'The partner settings.', iconKey: 'adjustments', path: '/edit', isVisible: everyone },
  { section: 'Content', label: 'Partner User Journey', description: 'Choose the reusable guest journey inherited by this partner’s events.', iconKey: 'layoutDashboard', path: '#partner-user-journey', isVisible: everyone },
  { section: 'Blocks', label: 'Partner Images', description: 'The pictures the partner and its events can use.', iconKey: 'photo', path: '/images', isVisible: everyone },
  { section: 'Blocks', label: 'Partner Frames', description: 'The frames of the partner.', iconKey: 'frame', path: '/frames', isVisible: everyone },
  { section: 'Blocks', label: 'Partner Frame Slots', description: 'The default slots used to compose generated frames for this partner’s events.', iconKey: 'frame', path: '/frame-slots', isVisible: everyone },
  { section: 'Blocks', label: 'Partner Logos', description: 'The logo of the partner: the default of all its events.', iconKey: 'photo', path: '/logos', isVisible: everyone },
  { section: 'Blocks', label: 'Partner Selfies', description: 'The sample selfie shown on this partner’s events until they choose their own.', iconKey: 'photo', path: '/selfies', isVisible: everyone },
  { section: 'Blocks', label: 'Partner Stadiums', description: 'The stadium backgrounds available to this partner’s events.', iconKey: 'photo', path: '/stadiums', isVisible: everyone },
  { section: 'Blocks', label: 'Partner Pictures', description: 'The default welcome, CTA, and e-mail pictures used by this partner’s events.', iconKey: 'photo', path: '/pictures', isVisible: everyone },
  { section: 'Blocks', label: 'Partner Dictionary', description: 'Guest-facing text overrides for this partner; blank values follow the global dictionary.', iconKey: 'adjustments', path: '/texts', isVisible: everyone },
  { section: 'Blocks', label: 'Partner Email', description: 'The legal part of the e-mails of all events of the partner.', iconKey: 'mail', path: '/emails', isVisible: everyone },
  { section: 'Blocks', label: 'Partner Vetting words', description: 'The words the reviewer describes a photo with, for all events of the partner.', iconKey: 'adjustments', path: '/annotation-words', isVisible: everyone },
  { section: 'Content', label: 'Partner Gallery', description: 'All photos captured across this partner’s events.', iconKey: 'photoScan', path: '#partner-gallery', isVisible: everyone },
];

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
  const groupOrder: AdminNavGroup[] = ['Overview', 'Org', 'Operations', 'Blocks', 'Content', 'Settings'];
  const publicItem = (item: (typeof items)[number]) => ({
    label: item.label,
    href: item.href,
    iconKey: item.iconKey,
    active: item.active,
    tourId: item.tourId,
  });
  return {
    title: context.kind === 'event' ? 'Event' : 'Partner',
    sections: groupOrder.map((title) => ({
      title,
      items: items.filter((item) => item.section === title).map(publicItem),
    })).filter((section) => section.items.length > 0),
    items: items.map(publicItem),
  };
}
