'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell as GdsAppShell } from '@doneisbetter/gds-admin/client';
import {
  IconBrandDatabricks,
  IconBuildingStore,
  IconCamera,
  IconFrame,
  IconLayoutDashboard,
  IconPhoto,
  IconPhotoScan,
  IconSparkles,
  IconUsers,
  IconWorld,
} from '@tabler/icons-react';
import { APP_VERSION } from '@/lib/app-version';
import SemanticNavLink from '@/components/admin/SemanticNavLink';

interface AdminChromeProps {
  session: {
    user: {
      name?: string;
      email: string;
    };
    appRole?: 'none' | 'user' | 'admin' | 'superadmin';
  };
  navigationAccess: {
    isGlobalAdmin: boolean;
    hasAnyPartnerAccess: boolean;
    hasEventsAccess: boolean;
  };
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// closeMobileNavigation has been removed because GdsAppShell handles mobile menu collapse natively

export default function AdminChrome({
  session,
  navigationAccess,
  children,
}: AdminChromeProps) {
  const pathname = usePathname();

  useEffect(() => {
    const toggleButton = document.querySelector('button[aria-label="Toggle navigation"]');
    if (toggleButton && toggleButton.getAttribute('aria-expanded') === 'true') {
      (toggleButton as HTMLButtonElement).click();
    }
  }, [pathname]);

  const coreItems: NavItem[] = [];
  if (navigationAccess.isGlobalAdmin) {
    coreItems.push({
      href: '/admin',
      label: 'Dashboard',
      icon: <IconLayoutDashboard size={18} />,
    });
  }
  if (navigationAccess.hasAnyPartnerAccess) {
    coreItems.push({
      href: '/admin/partners',
      label: 'Partners',
      icon: <IconBuildingStore size={18} />,
    });
  }
  if (navigationAccess.isGlobalAdmin) {
    coreItems.push({
      href: '/admin/users',
      label: 'Users',
      icon: <IconUsers size={18} />,
    });
  }

  const resourceItems: NavItem[] = navigationAccess.isGlobalAdmin
    ? [
        { href: '/admin/frames', label: 'Global Frames', icon: <IconFrame size={18} /> },
        { href: '/admin/logos', label: 'Global Logos', icon: <IconPhoto size={18} /> },
        { href: '/admin/landing-pages', label: 'Landing Pages', icon: <IconWorld size={18} /> },
        { href: '/admin/submissions', label: 'Global Galleries', icon: <IconPhotoScan size={18} /> },
      ]
    : [];

  const appItems: NavItem[] = [];
  if (navigationAccess.hasEventsAccess) {
    appItems.push({
      href: '/admin/events',
      label: 'Events',
      icon: <IconBrandDatabricks size={18} />,
    });
  }
  if (navigationAccess.isGlobalAdmin) {
    appItems.push({
      href: '/admin/tryon',
      label: 'Try-On App',
      icon: <IconSparkles size={18} />,
    });
  }

  const primaryNavigation = (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xl)' }}>
      <NavSection title="Apps" items={appItems} pathname={pathname} />
      <NavSection title="Core" items={coreItems} pathname={pathname} />
      {resourceItems.length > 0 ? (
        <NavSection title="Resource Inventory" items={resourceItems} pathname={pathname} />
      ) : null}
    </div>
  );

  const accountPanel = (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
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
      <code style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', textAlign: 'center' }}>
        v{APP_VERSION}
      </code>
    </div>
  );

  return (
    <div data-camera-admin>
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

function NavSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
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
            />
          );
        })}
      </div>
    </div>
  );
}
