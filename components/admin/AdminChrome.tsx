'use client';

import { useEffect } from 'react';
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
import { getVisibleAdminNavSections, type AdminNavigationAccess } from '@/lib/adminNavigation';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';

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

export default function AdminChrome({
  session,
  navigationAccess,
  children,
}: AdminChromeProps) {
  const pathname = usePathname();
  const tourController = useTourController('admin:v1', getAdminTourSteps(navigationAccess), { autoStart: true });

  useEffect(() => {
    const toggleButton = document.querySelector('button[aria-label="Toggle navigation"]');
    if (toggleButton && toggleButton.getAttribute('aria-expanded') === 'true') {
      (toggleButton as HTMLButtonElement).click();
    }
  }, [pathname]);

  // WHAT: One nav config (lib/adminNavigation.ts) drives both this sidebar and
  // the dashboard's landing grid — see that file's header comment for why.
  const sections = getVisibleAdminNavSections(navigationAccess);

  const primaryNavigation = (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
      {sections.map((section) => (
        <div
          key={section.title}
          data-tour-id={section.title === 'Libraries' ? 'admin-resource-inventory' : undefined}
        >
          <NavSection
            title={section.title}
            items={section.items.map((item) => ({
              href: item.href,
              label: item.label,
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
    <div data-tour-id="admin-account-panel" style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'nowrap', gap: 'var(--mantine-spacing-sm)' }}>
        <span style={{ alignItems: 'center', background: 'var(--mantine-color-blue-light)', borderRadius: 999, display: 'inline-flex', height: 36, justifyContent: 'center', width: 36 }}>
          <IconUsers size={18} />
        </span>
        <div style={{ display: 'grid', gap: 0, minWidth: 0 }}>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.user.name || session.user.email}
          </strong>
          <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', textTransform: 'capitalize' }}>
            {session.appRole || 'user'}
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
              Back to App
            </strong>
            <div style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' }}>
              Return to Camera home
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
              Logout
            </strong>
            <div style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' }}>
              End your admin session
            </div>
          </div>
        </div>
      </a>
      <div style={{ borderRadius: 12, padding: 'var(--mantine-spacing-sm)' }}>
        <TourReplayButton tourId="admin:v1" controller={tourController} label="Show admin tour" />
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
        headerContext="Admin Panel"
        headerActions={
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'nowrap', gap: 'var(--mantine-spacing-sm)' }}>
            <span style={{ alignItems: 'center', background: 'var(--mantine-color-blue-light)', borderRadius: 999, display: 'inline-flex', height: 36, justifyContent: 'center', width: 36 }}>
              <IconUsers size={18} />
            </span>
            <div style={{ display: 'grid', gap: 0 }}>
              <strong>
                {session.user.name || session.user.email}
              </strong>
              <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', textTransform: 'capitalize' }}>
                {session.appRole || 'user'}
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

interface RenderedNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  tourId?: string;
}

function NavSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: RenderedNavItem[];
  pathname: string;
}) {
  if (items.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)' }}>
      <strong style={{ fontSize: 'var(--mantine-font-size-xs)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {title}
      </strong>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
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
