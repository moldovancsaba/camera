'use client';

import { Button, Group, TextInput } from '@/components/gds/PublicPrimitives';

const BUCKET_OPTIONS = [
  { value: '', label: 'All buckets' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Declined' },
  { value: 'service', label: 'Service' },
  { value: 'greatest', label: 'Greatest hits' },
];

export default function TryOnAnalyticsFilterForm({
  bucket,
  eventId,
  from,
  to,
}: {
  bucket: string;
  eventId: string;
  from: string;
  to: string;
}) {
  return (
    <form method="get" style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
      <Group align="flex-end" gap="sm" wrap="wrap">
        <label style={{ display: 'grid', gap: 4, fontSize: '0.875rem' }}>
          Bucket
          <select name="bucket" defaultValue={bucket} style={{ minHeight: 36, minWidth: 180, padding: '0 0.5rem' }}>
            {BUCKET_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <TextInput label="Event ID" name="eventId" defaultValue={eventId} style={{ minWidth: 220 }} />
        <TextInput label="From" name="from" type="date" defaultValue={from} style={{ minWidth: 160 }} />
        <TextInput label="To" name="to" type="date" defaultValue={to} style={{ minWidth: 160 }} />
        <Button type="submit" variant="light">
          Apply filters
        </Button>
      </Group>
    </form>
  );
}
