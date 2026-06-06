'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Divider,
  Group,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
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
import SemanticNavLink from '@/components/gds/SemanticNavLink';

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

function closeMobileNavigation() {
  if (typeof window === 'undefined' || window.matchMedia('(min-width: 48em)').matches) {
    return;
  }

  window.setTimeout(() => {
    const toggle = document.querySelector<HTMLButtonElement>('button[aria-label="Toggle navigation"]');
    toggle?.click();
  }, 0);
}

export default function AdminChrome({
  session,
  navigationAccess,
  children,
}: AdminChromeProps) {
  const pathname = usePathname();

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
    <Stack gap="xl">
      <NavSection title="Apps" items={appItems} pathname={pathname} onNavigate={closeMobileNavigation} />
      <NavSection title="Core" items={coreItems} pathname={pathname} onNavigate={closeMobileNavigation} />
      {resourceItems.length > 0 ? (
        <NavSection title="Resource Inventory" items={resourceItems} pathname={pathname} onNavigate={closeMobileNavigation} />
      ) : null}
    </Stack>
  );

  const accountPanel = (
    <Stack gap="sm">
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon variant="light" radius="xl" size={36}>
          <IconUsers size={18} />
        </ThemeIcon>
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} truncate>
            {session.user.name || session.user.email}
          </Text>
          <Text size="xs" c="dimmed" tt="capitalize">
            {session.appRole || 'user'}
          </Text>
        </Stack>
      </Group>
      <Divider />
      <UnstyledButton component={Link} href="/" style={{ borderRadius: 12 }}>
        <Group gap="sm" p="sm">
          <ThemeIcon variant="light" radius="xl">
            <IconCamera size={18} />
          </ThemeIcon>
          <div>
            <Text size="sm" fw={600}>
              Back to App
            </Text>
            <Text size="xs" c="dimmed">
              Return to Camera home
            </Text>
          </div>
        </Group>
      </UnstyledButton>
      <Text size="xs" c="dimmed" ta="center" ff="monospace">
        v{APP_VERSION}
      </Text>
    </Stack>
  );

  return (
    <div data-camera-admin>
      <GdsAppShell
        logoText="Camera"
        headerContext="Admin Panel"
        headerActions={
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" radius="xl" size={36}>
              <IconUsers size={18} />
            </ThemeIcon>
            <Stack gap={0} visibleFrom="sm">
              <Text size="sm" fw={600}>
                {session.user.name || session.user.email}
              </Text>
              <Text size="xs" c="dimmed" tt="capitalize">
                {session.appRole || 'user'}
              </Text>
            </Stack>
          </Group>
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
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <Stack gap="xs">
      <Text tt="uppercase" fw={700} fz="xs" style={{ letterSpacing: '0.12em' }}>
        {title}
      </Text>
      <Stack gap={6}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <SemanticNavLink
              key={item.href}
              href={item.href}
              active={active}
              label={item.label}
              icon={item.icon}
              onNavigate={onNavigate}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}
