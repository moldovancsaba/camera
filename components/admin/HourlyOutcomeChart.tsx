'use client';

import { useMemo, useState } from 'react';
import { Button, Group, Stack, Text, Title } from '@mantine/core';
import type { TryOnHourlyOutcomeRow } from '@/lib/tryon/analytics';

type OutcomeKey = 'approved' | 'rejected' | 'service' | 'failed';

const OUTCOMES: Array<{ key: OutcomeKey; label: string; color: string }> = [
  { key: 'approved', label: 'Approved', color: 'var(--mantine-color-green-6)' },
  { key: 'rejected', label: 'Declined', color: 'var(--mantine-color-red-6)' },
  { key: 'service', label: 'Service', color: 'var(--mantine-color-blue-6)' },
  { key: 'failed', label: 'Failed', color: 'var(--mantine-color-orange-6)' },
];

function pct(value: number, total: number): string {
  if (total <= 0 || value <= 0) return '0%';
  return `${Math.max(4, Math.round((value / total) * 1000) / 10)}%`;
}

function barHeight(value: number, maxTotal: number): string {
  if (value <= 0) return '0px';
  return `${Math.max(24, Math.round((value / maxTotal) * 220))}px`;
}

function dayLabel(hour: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(hour));
}

export default function HourlyOutcomeChart({ rows }: { rows: TryOnHourlyOutcomeRow[] }) {
  const [visible, setVisible] = useState<Record<OutcomeKey, boolean>>({
    approved: true,
    rejected: true,
    service: true,
    failed: true,
  });
  const visibleKeys = useMemo(
    () => OUTCOMES.filter((outcome) => visible[outcome.key]).map((outcome) => outcome.key),
    [visible]
  );
  const chartRows = rows.map((row) => ({
    ...row,
    visibleTotal: visibleKeys.reduce((sum, key) => sum + row[key], 0),
  }));
  const maxTotal = Math.max(1, ...chartRows.map((row) => row.visibleTotal));

  return (
    <Stack gap="sm">
      <Title order={3}>Hourly Outcomes</Title>
      <Text c="dimmed" size="sm">
        Approved, declined, service, and failed images grouped by hour.
      </Text>
      {rows.length > 0 ? (
        <Stack gap="xs">
          <Group gap="xs">
            {OUTCOMES.map((outcome) => (
              <Button
                key={outcome.key}
                type="button"
                size="xs"
                variant={visible[outcome.key] ? 'light' : 'subtle'}
                aria-pressed={visible[outcome.key]}
                onClick={() => setVisible((state) => ({ ...state, [outcome.key]: !state[outcome.key] }))}
                leftSection={
                  <span
                    aria-hidden
                    style={{
                      background: outcome.color,
                      borderRadius: 999,
                      display: 'inline-block',
                      height: 10,
                      opacity: visible[outcome.key] ? 1 : 0.35,
                      width: 10,
                    }}
                  />
                }
              >
                {outcome.label}
              </Button>
            ))}
          </Group>
          <div
            style={{
              alignItems: 'end',
              borderBottom: '1px solid var(--mantine-color-gray-3)',
              display: 'flex',
              gap: 4,
              minHeight: 280,
              overflowX: 'auto',
              padding: '16px 0 8px',
            }}
          >
            {chartRows.map((row, index) => {
              const currentDay = row.hour.slice(0, 10);
              const previousDay = chartRows[index - 1]?.hour.slice(0, 10);
              const showDay = index === 0 || currentDay !== previousDay;
              return (
                <div
                  key={row.hour}
                  style={{
                    alignItems: 'center',
                    display: 'flex',
                    flex: '0 0 26px',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <Text size="xs" fw={700}>{row.visibleTotal}</Text>
                  <div
                    aria-label={`${row.label}: approved ${row.approved}, declined ${row.rejected}, service ${row.service}, failed ${row.failed}`}
                    role="img"
                    style={{
                      alignItems: 'stretch',
                      background: 'var(--mantine-color-gray-1)',
                      borderRadius: '7px 7px 3px 3px',
                      display: 'flex',
                      flexDirection: 'column-reverse',
                      height: barHeight(row.visibleTotal, maxTotal),
                      overflow: 'hidden',
                      width: 20,
                    }}
                  >
                    {OUTCOMES.map((outcome) =>
                      visible[outcome.key] ? (
                        <div
                          key={outcome.key}
                          title={`${outcome.label}: ${row[outcome.key]}`}
                          style={{ background: outcome.color, height: pct(row[outcome.key], row.visibleTotal) }}
                        />
                      ) : null
                    )}
                  </div>
                  <Text size="xs" c="dimmed" ta="center" style={{ lineHeight: 1.1, minHeight: 24 }}>
                    {showDay ? dayLabel(row.hour) : ''}
                  </Text>
                </div>
              );
            })}
          </div>
        </Stack>
      ) : (
        <Text c="dimmed">No hourly outcome data matches this filter.</Text>
      )}
    </Stack>
  );
}
