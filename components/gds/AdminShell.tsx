'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AppShell,
  AppShellNavbar,
  AppShellHeader,
  Burger,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBrandDatabricks,
  IconBuildingStore,
  IconCamera,
  IconFrame,
  IconLayoutDashboard,
  IconPhoto,
  IconPhotoScan,
  IconUsers,
  IconWorld,
} from '@tabler/icons-react';
import { APP_VERSION } from '@/lib/app-version';
import SemanticNavLink from '@/components/gds/SemanticNavLink';

interface AdminShellProps {
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

export default function AdminShell({
  session,
  navigationAccess,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const [opened, setOpened] = useState(false);

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
  return (
    <AppShell
      data-camera-admin=""
      header={{ height: 72 }}
      navbar={{
        width: 304,
        breakpoint: 'md',
        collapsed: { mobile: !opened },
      }}
      padding="xl"
      styles={{
        root: {
          color: 'var(--mantine-color-dark-8)',
        },
      }}
    >
      <AppShellHeader bg="white" withBorder>
        <Group h="100%" px="lg" justify="space-between">
          <Group gap="md">
            <Burger opened={opened} onClick={() => setOpened((value) => !value)} hiddenFrom="md" size="sm" />
            <Group gap="sm">
              <Image
                src="https://i.ibb.co/zTG7ztxC/camera-logo.png"
                alt="Camera Logo"
                width={36}
                height={36}
                unoptimized
              />
              <Stack gap={0}>
                <Text fw={800} fz="lg" c="dark.8">
                  Camera
                </Text>
                <Text size="xs" c="dimmed">
                  Admin Panel
                </Text>
              </Stack>
            </Group>
          </Group>
          <Group gap="sm">
            <ThemeIcon variant="light" color="cameraTeal" radius="xl" size={36}>
              <IconUsers size={18} />
            </ThemeIcon>
            <Stack gap={0}>
              <Text size="sm" fw={600}>
                {session.user.name || session.user.email}
              </Text>
              <Text size="xs" c="dimmed" tt="capitalize">
                {session.appRole || 'user'}
              </Text>
            </Stack>
          </Group>
        </Group>
      </AppShellHeader>

      <AppShellNavbar p="md" bg="white">
        <Stack h="100%" gap="md">
          <ScrollArea type="hover" style={{ flex: 1 }}>
            <Stack gap="xl">
              <NavSection title="Core" items={coreItems} pathname={pathname} onNavigate={() => setOpened(false)} />
              {resourceItems.length > 0 ? (
                <NavSection
                  title="Resource Inventory"
                  items={resourceItems}
                  pathname={pathname}
                  onNavigate={() => setOpened(false)}
                />
              ) : null}
              <NavSection title="Apps" items={appItems} pathname={pathname} onNavigate={() => setOpened(false)} />
            </Stack>
          </ScrollArea>
          <Divider />
          <Stack gap="xs">
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
        </Stack>
      </AppShellNavbar>

      <AppShell.Main bg="#f3f7fb">{children}</AppShell.Main>
    </AppShell>
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
              onClick={onNavigate}
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
