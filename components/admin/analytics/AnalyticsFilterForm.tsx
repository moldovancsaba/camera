'use client';

import { Button, Group, TextInput } from '@/components/gds/PublicPrimitives';
import { REPORT_TIME_ZONES } from '@/lib/analytics/time';
import type { AnalyticsQuery } from '@/lib/analytics/query';

/**
 * The days and the clock of the Analytics view (issue 521): a plain GET form, so the filtered report is an address. Both days are included; leave one empty for an open end. The tab and the picked
 * event travel as hidden fields, so applying the filter keeps the page the user is on.
 */
export default function AnalyticsFilterForm({ query, clearHref }: { query: AnalyticsQuery; clearHref: string }) {
  return (
    <form method="get" aria-label="Filter the analytics" style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
      {query.view !== 'overview' ? <input type="hidden" name="view" value={query.view} /> : null}
      {query.eventId ? <input type="hidden" name="eventId" value={query.eventId} /> : null}
      <Group align="flex-end" gap="sm" wrap="wrap">
        <TextInput label="From day" name="from" type="date" defaultValue={query.from} style={{ minWidth: 150 }} />
        <TextInput label="To day (included)" name="to" type="date" defaultValue={query.to} style={{ minWidth: 150 }} />
        <label style={{ display: 'grid', gap: 4, fontSize: '0.875rem' }}>
          Clock
          <select name="tz" defaultValue={query.timeZone} style={{ minHeight: 36, minWidth: 140, padding: '0 0.5rem' }}>
            {REPORT_TIME_ZONES.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="light">
          Apply
        </Button>
        {query.from || query.to ? (
          <a href={clearHref} style={{ alignSelf: 'center', fontSize: '0.875rem' }}>
            Clear the days
          </a>
        ) : null}
      </Group>
    </form>
  );
}
