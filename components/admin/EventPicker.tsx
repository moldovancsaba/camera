'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/gds/PublicPrimitives';

interface EventOption {
  value: string;
  label: string;
}

interface RawEvent {
  eventId?: unknown;
  name?: unknown;
}

// WHAT: Jump straight to any event's scoped view by searching its name.
// WHY: the audit's "no real event picker" gap -- vetting/queue/analytics
// only ever scoped to an event if you already arrived with ?eventId= from
// somewhere else (the events list, an event's own workspace tabs). Reuses
// the existing /api/events search endpoint, so there's no new API surface.
export default function EventPicker({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setOptions([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/events?search=${encodeURIComponent(query)}&limit=8`, { cache: 'no-store' })
        .then((response) => response.json().catch(() => ({})))
        .then((payload) => {
          if (cancelled) return;
          const events: RawEvent[] = Array.isArray(payload.data?.events) ? payload.data.events : [];
          setOptions(
            events
              .filter((event): event is { eventId: string; name?: unknown } => typeof event.eventId === 'string')
              .map((event) => ({
                value: event.eventId,
                label: typeof event.name === 'string' && event.name.trim() ? event.name : event.eventId,
              }))
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  return (
    <Select
      placeholder="Jump to an event..."
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      data={options}
      nothingFoundMessage={loading ? 'Searching...' : search.trim().length < 2 ? 'Type at least 2 characters' : 'No matching events'}
      value={null}
      onChange={(eventId) => {
        if (eventId) router.push(`${basePath}?eventId=${encodeURIComponent(eventId)}`);
      }}
      clearable={false}
      size="sm"
      style={{ maxWidth: 320 }}
    />
  );
}
