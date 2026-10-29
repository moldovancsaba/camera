'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell as GdsAppShell } from '@sovereignsquad/gds-admin/client';
import { IconCamera, IconLogout, IconUsers } from '@tabler/icons-react';
import { APP_VERSION } from '@/lib/app-version';
import SemanticNavLink from '@/components/admin/SemanticNavLink';
import TourOverlay from '@/components/tour/TourOverlay';
import TourReplayButton from '@/components/tour/TourReplayButton';
import { useTourController } from '@/lib/tour/useTourController';
import { getAdminTourSteps } from '@/lib/tour/config/adminTourSteps';
import { adminContextMenu, adminContextOf, getVisibleAdminNavSections, type AdminContext, type AdminNavigationAccess } from '@/lib/adminNavigation';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminShellText } from '@/lib/i18n/admin-shell';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

interface AdminChromeProps {
  session: {
    user: {
      name?: string;
      email: string;
    };
    appRole?: 'none' | 'user' | 'admin' | 'superadmin';
  };
  navigationAccess: AdminNavigationAccess;
  children: React.ReactNode;
}

// closeMobileNavigation has been removed because GdsAppShell handles mobile menu collapse natively

export default function AdminChrome(props: AdminChromeProps) {
  return <AdminChromeView {...props} pathname={usePathname()} />;
}

/** The chrome for the path it is given (the page's own address); split off so the menus can be checked for any path. */
export function AdminChromeView({
  session,
  navigationAccess,
  children,
  pathname,
}: AdminChromeProps & { pathname: string }) {
  // Inside one event or partner the sidebar shows that item's own menu (issue 426); the tour then points at that menu, and starts by itself only on the main pages.
  const context = adminContextOf(pathname);
  const language = useUiLanguage();
  const ui = (text: string) => adminShellText(text, language);
  const contextName = useContextName(context);
  const tourController = useTourController('admin:v1', getAdminTourSteps(navigationAccess, { inContext: Boolean(context) }), { autoStart: !context });

  useEffect(() => {
    const toggleButton = document.querySelector('button[aria-label="Toggle navigation"]');
    if (toggleButton && toggleButton.getAttribute('aria-expanded') === 'true') {
      (toggleButton as HTMLButtonElement).click();
    }
  }, [pathname]);

  // WHAT: One nav config (lib/adminNavigation.ts) drives both this sidebar and
  // the dashboard's landing grid — see that file's header comment for why.
  const sections = getVisibleAdminNavSections(navigationAccess);

  const contextMenu = context ? adminContextMenu(context, pathname, navigationAccess) : null;
  const direction = uiLanguageDirection(language);

  const primaryNavigation = context && contextMenu ? (
    <div lang={language} dir={direction} style={{ display: 'grid', gap: 'var(--mantine-spacing-md)' }}>
      <SemanticNavLink
        href={context.kind === 'event' ? '/admin/events' : '/admin/partners'}
        active={false}
        label={ui('Back to the main menu')}
        icon={<AdminIcon iconKey="arrowLeft" size={18} />}
      />
      <div data-tour-id="admin-context-menu" style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <strong style={{ fontSize: 'var(--mantine-font-size-xs)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{ui(contextMenu.title)}</strong>
          <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{contextName ?? ' '}</span>
        </div>
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-md)' }}>
          {contextMenu.sections.map((section) => (
            <NavSection
              key={section.title}
              title={section.title}
              language={language}
              items={section.items.map((item) => ({
                href: item.href,
                label: ui(item.label),
                icon: <AdminIcon iconKey={item.iconKey as AdminIconKey} size={18} />,
                active: item.active,
                tourId: item.tourId,
              }))}
              pathname={pathname}
            />
          ))}
        </div>
      </div>
    </div>
  ) : (
    <div lang={language} dir={direction} style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
      {sections.map((section) => (
        <div
          key={section.title}
          data-tour-id={section.title === 'Blocks' ? 'admin-resource-inventory' : undefined}
        >
          <NavSection
            title={section.title}
            language={language}
            items={section.items.map((item) => ({
              href: item.href,
              label: ui(item.label),
              icon: <AdminIcon iconKey={item.iconKey as AdminIconKey} size={18} />,
              tourId: item.tourId,
            }))}
            pathname={pathname}
          />
        </div>
      ))}
    </div>
  );

  const accountPanel = (
    <div lang={language} dir={direction} data-tour-id="admin-account-panel" style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'nowrap', gap: 'var(--mantine-spacing-sm)' }}>
        <span style={{ alignItems: 'center', background: 'var(--mantine-color-blue-light)', borderRadius: 999, display: 'inline-flex', height: 36, justifyContent: 'center', width: 36 }}>
          <IconUsers size={18} />
        </span>
        <div style={{ display: 'grid', gap: 0, minWidth: 0 }}>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.user.name || session.user.email}
          </strong>
          <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', textTransform: 'capitalize' }}>
            {ui(session.appRole === 'superadmin' ? 'Superadmin' : session.appRole === 'admin' ? 'Admin' : session.appRole === 'none' ? 'No access' : 'User')}
          </span>
        </div>
      </div>
      <hr style={{ border: 0, borderTop: '1px solid var(--mantine-color-gray-3)', margin: 0 }} />
      <Link href="/" style={{ borderRadius: 12, color: 'inherit', display: 'block', padding: 'var(--mantine-spacing-sm)', textDecoration: 'none' }}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 'var(--mantine-spacing-sm)' }}>
          <span style={{ alignItems: 'center', background: 'var(--mantine-color-blue-light)', borderRadius: 999, display: 'inline-flex', height: 34, justifyContent: 'center', width: 34 }}>
            <IconCamera size={18} />
          </span>
          <div>
            <strong>
              {ui('Back to App')}
            </strong>
            <div style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' }}>
              {ui('Return to Camera home')}
            </div>
          </div>
        </div>
      </Link>
      <a href="/api/auth/logout" style={{ borderRadius: 12, color: 'inherit', display: 'block', padding: 'var(--mantine-spacing-sm)', textDecoration: 'none' }}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 'var(--mantine-spacing-sm)' }}>
          <span style={{ alignItems: 'center', background: 'var(--mantine-color-red-light)', borderRadius: 999, display: 'inline-flex', height: 34, justifyContent: 'center', width: 34 }}>
            <IconLogout size={18} />
          </span>
          <div>
            <strong>
              {ui('Logout')}
            </strong>
            <div style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' }}>
              {ui('End your admin session')}
            </div>
          </div>
        </div>
      </a>
      <div style={{ borderRadius: 12, padding: 'var(--mantine-spacing-sm)' }}>
        <TourReplayButton tourId="admin:v1" controller={tourController} label={ui('Show admin tour')} />
      </div>
      <code style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', textAlign: 'center' }}>
        v{APP_VERSION}
      </code>
    </div>
  );

  return (
    <div data-camera-admin>
      <TourOverlay controller={tourController} />
      <GdsAppShell
        logoText="Camera"
        headerContext={<span lang={language} dir={direction}>{ui('Admin Panel')}</span>}
        headerActions={
          <div lang={language} dir={direction} style={{ alignItems: 'center', display: 'flex', flexWrap: 'nowrap', gap: 'var(--mantine-spacing-sm)' }}>
            <span style={{ alignItems: 'center', background: 'var(--mantine-color-blue-light)', borderRadius: 999, display: 'inline-flex', height: 36, justifyContent: 'center', width: 36 }}>
              <IconUsers size={18} />
            </span>
            <div style={{ display: 'grid', gap: 0 }}>
              <strong>
                {session.user.name || session.user.email}
              </strong>
              <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', textTransform: 'capitalize' }}>
                {ui(session.appRole === 'superadmin' ? 'Superadmin' : session.appRole === 'admin' ? 'Admin' : session.appRole === 'none' ? 'No access' : 'User')}
              </span>
            </div>
          </div>
        }
        primaryNavigation={primaryNavigation}
        accountPanel={accountPanel}
      >
        {children}
      </GdsAppShell>
    </div>
  );
}

/**
 * The name of the event or partner whose menu is shown, from a small access-checked call (the page the user is on loads the record too, but the sidebar sits above every page).
 * Asked once per event or partner: moving between its pages keeps the name.
 */
function useContextName(context: AdminContext | null): string | null {
  const kind = context?.kind;
  const id = context?.id;
  const key = kind && id ? `${kind}:${id}` : null;
  const [loaded, setLoaded] = useState<{ key: string; name: string } | null>(null);
  useEffect(() => {
    if (!key || !kind || !id) return;
    let cancelled = false;
    fetch(`/api/admin/nav-context?kind=${kind}&id=${id}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ data?: { name?: string } }>) : null))
      .then((body) => {
        if (!cancelled && body?.data?.name) setLoaded({ key, name: body.data.name });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key, kind, id]);
  return loaded && loaded.key === key ? loaded.name : null;
}

interface RenderedNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  tourId?: string;
}

function NavSection({
  title,
  language,
  items,
  pathname,
}: {
  title: string;
  language: import('@/lib/i18n').UiLanguage;
  items: RenderedNavItem[];
  pathname: string;
}) {
  if (items.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)' }}>
      <strong style={{ fontSize: 'var(--mantine-font-size-xs)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {adminShellText(title, language)}
      </strong>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((item) => {
          const active = item.active ?? (pathname === item.href || pathname.startsWith(item.href + '/'));
          return (
            <SemanticNavLink
              key={item.href}
              href={item.href}
              active={active}
              label={item.label}
              icon={item.icon}
              tourId={item.tourId}
            />
          );
        })}
      </div>
    </div>
  );
}
