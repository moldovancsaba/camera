'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';

const TABS: Array<{ segment: string | null; label: string; href: (id: string) => string }> = [
  { segment: null, label: 'Overview', href: (id) => `/admin/events/${id}` },
  { segment: 'vetting', label: 'Vetting', href: (id) => `/admin/events/${id}/vetting` },
  { segment: 'queue', label: 'Queue', href: (id) => `/admin/events/${id}/queue` },
  { segment: 'analytics', label: 'Analytics', href: (id) => `/admin/events/${id}/analytics` },
];

// WHAT: The event workspace's tab bar (Overview/Vetting/Queue/Analytics).
// WHY: The audit found vetting, the queue, and analytics reachable only from
// a separate global "Try-On App" section, disconnected from the event they
// operate on. These routes now nest under /admin/events/[id]/... and reuse
// the exact same scoped page components as the global (unscoped) versions.
export default function EventWorkspaceTabs({ eventId }: { eventId: string }) {
  const activeSegment = useSelectedLayoutSegment();

  return (
    <nav
      aria-label="Event workspace"
      style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '1px solid var(--mantine-color-default-border)',
        marginBottom: '1.5rem',
        paddingBottom: '0.25rem',
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.segment === activeSegment;
        return (
          <Link
            key={tab.label}
            href={tab.href(eventId)}
            aria-current={isActive ? 'page' : undefined}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              fontSize: '0.875rem',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? 'var(--mantine-color-blue-7)' : 'var(--mantine-color-dimmed)',
              background: isActive ? 'var(--mantine-color-blue-0)' : 'transparent',
              textDecoration: 'none',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
