'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Box,
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
      label: 'Events App',
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
      <NavSection title="Core" items={coreItems} pathname={pathname} />
      {resourceItems.length > 0 ? (
        <NavSection title="Resource Inventory" items={resourceItems} pathname={pathname} />
      ) : null}
      <NavSection title="Apps" items={appItems} pathname={pathname} />
    </Stack>
  );

  const accountPanel = (
    <Stack gap="sm">
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon variant="light" color="cameraTeal" radius="xl" size={36}>
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
          <ThemeIcon variant="light" color="gray" radius="xl">
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
    <div data-camera-admin data-mantine-color-scheme="light">
      <GdsAppShell
        logoText="Camera"
        headerContext="Admin Panel"
        headerActions={
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" color="cameraTeal" radius="xl" size={36}>
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
        showThemeToggle={false}
      >
        <Box bg="cameraSlate.0" style={{ minHeight: '100%' }}>
          {children}
        </Box>
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
    <Stack gap="xs">
      <Text tt="uppercase" fw={700} fz="xs" c="gray.7" style={{ letterSpacing: '0.12em' }}>
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
            />
          );
        })}
      </Stack>
    </Stack>
  );
}
