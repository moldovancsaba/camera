'use client';

import { useMemo, useState } from 'react';
import { ReportingSection } from '@sovereignsquad/gds-core/client';
import type { TryOnHourlyOutcomeRow } from '@/lib/tryon/analytics';

type OutcomeKey = 'approved' | 'rejected' | 'service' | 'failed';

const OUTCOMES: Array<{ key: OutcomeKey; label: string; color: string }> = [
  { key: 'approved', label: 'Approved', color: 'var(--mantine-color-green-6)' },
  { key: 'rejected', label: 'Declined', color: 'var(--mantine-color-red-6)' },
  { key: 'service', label: 'Service', color: 'var(--mantine-color-blue-6)' },
  { key: 'failed', label: 'Failed', color: 'var(--mantine-color-orange-6)' },
];

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
  const visibleKeyCount = visibleKeys.length;
  const chartRows = rows.map((row) => ({
    ...row,
    visibleTotal: visibleKeys.reduce((sum, key) => sum + row[key], 0),
  }));
  const maxTotal = Math.max(1, ...chartRows.map((row) => row.visibleTotal));
  const selectedTotal = chartRows.reduce((sum, row) => sum + row.visibleTotal, 0);

  return (
    <ReportingSection
      title="Hourly Outcomes"
      description="Approved, declined, service, and failed images grouped by hour."
      state={rows.length > 0 ? 'ready' : 'empty'}
      stateMessage={rows.length === 0 ? 'No hourly outcome data matches this filter.' : undefined}
      chart={rows.length > 0 ? (
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-xs)' }}>
            {OUTCOMES.map((outcome) => (
              <button
                key={outcome.key}
                type="button"
                disabled={visible[outcome.key] && visibleKeyCount === 1}
                aria-pressed={visible[outcome.key]}
                aria-label={`${visible[outcome.key] ? 'Hide' : 'Show'} ${outcome.label} values`}
                onClick={() => setVisible((state) => ({ ...state, [outcome.key]: !state[outcome.key] }))}
                style={{
                  alignItems: 'center',
                  border: '1px solid var(--mantine-color-gray-3)',
                  borderRadius: 999,
                  display: 'inline-flex',
                  gap: 8,
                  opacity: visible[outcome.key] ? 1 : 0.55,
                  padding: '6px 10px',
                }}
              >
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
                {outcome.label}
              </button>
            ))}
          </div>
          <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', margin: 0 }}>
            Selected total: {selectedTotal} image{selectedTotal === 1 ? '' : 's'}
          </p>
          <div
            style={{
              alignItems: 'end',
              borderBottom: '1px solid var(--mantine-color-gray-3)',
              display: 'flex',
              gap: 1,
              minHeight: 270,
              overscrollBehaviorX: 'contain',
              overflowX: 'auto',
              padding: '16px 0 8px',
              scrollSnapType: 'x proximity',
              WebkitOverflowScrolling: 'touch',
            }}
            >
            {chartRows.map((row, index) => {
              const currentDay = row.hour.slice(0, 10);
              const previousDay = chartRows[index - 1]?.hour.slice(0, 10);
              const showDay = index === 0 || currentDay !== previousDay;
              const visibleBars = OUTCOMES.filter((outcome) => visible[outcome.key]);
              const barColumnWidth = Math.max(1, visibleBars.length) * 16;
              const rowMaxValue = Math.max(...visibleBars.map((outcome) => row[outcome.key]), 0);
              return (
                <div
                  key={row.hour}
                  style={{
                    alignItems: 'center',
                    borderLeft: showDay && index > 0 ? '1px solid var(--mantine-color-gray-3)' : undefined,
                    display: 'flex',
                    flex: `0 0 ${barColumnWidth}px`,
                    flexDirection: 'column',
                    gap: 6,
                    paddingLeft: showDay && index > 0 ? 4 : 0,
                    scrollSnapAlign: 'start',
                  }}
                >
                  <strong style={{ fontSize: 'var(--mantine-font-size-xs)' }}>{row.visibleTotal}</strong>
                  <div
                    aria-label={`${row.label}: approved ${row.approved}, declined ${row.rejected}, service ${row.service}, failed ${row.failed}`}
                    role="img"
                    style={{
                    alignItems: 'stretch',
                    background: 'var(--mantine-color-gray-1)',
                    display: 'flex',
                    flexDirection: 'row',
                    height: barHeight(rowMaxValue, maxTotal),
                    overflow: 'hidden',
                    width: Math.max(1, visibleBars.length) * 14,
                    gap: 2,
                    }}
                  >
                    {visibleBars.map((outcome) => (
                      <div
                        key={outcome.key}
                        title={`${outcome.label}: ${row[outcome.key]}`}
                        style={{
                          alignSelf: 'flex-end',
                          background: outcome.color,
                          borderRadius: '3px',
                          height: barHeight(row[outcome.key], maxTotal),
                          width: 12,
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', lineHeight: 1.1, minHeight: 24, textAlign: 'center' }}>
                    {showDay ? dayLabel(row.hour) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : undefined}
    />
  );
}
