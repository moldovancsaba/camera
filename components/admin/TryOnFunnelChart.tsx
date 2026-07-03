'use client';

import { ReportingSection } from '@sovereignsquad/gds-core/client';
import type { TryOnFunnelMetrics } from '@/lib/tryon/analytics';

function pct(value: number, base: number): string {
  if (base <= 0) return '0%';
  return `${Math.round((value / base) * 1000) / 10}%`;
}

export default function TryOnFunnelChart({ funnel }: { funnel: TryOnFunnelMetrics }) {
  const base = funnel.submitted > 0 ? funnel.submitted : funnel.generated;
  const steps = [
    { key: 'submitted', label: 'Submitted', value: funnel.submitted },
    { key: 'queued', label: 'Queued', value: funnel.queued },
    { key: 'processing', label: 'Processing', value: funnel.processing },
    { key: 'generated', label: 'Generated', value: funnel.generated },
    { key: 'approved', label: 'Approved', value: funnel.approved },
    { key: 'declined', label: 'Declined', value: funnel.declined },
    { key: 'service', label: 'Service', value: funnel.service },
    { key: 'supersededRerun', label: 'Superseded rerun', value: funnel.supersededRerun },
    { key: 'failed', label: 'Failed jobs', value: funnel.failed },
  ];

  return (
    <ReportingSection
      title="Pipeline funnel"
      description="Lifecycle counts from jobs and archived moderation outcomes."
      state={base > 0 ? 'ready' : 'empty'}
      stateMessage={base > 0 ? undefined : 'No funnel data matches this filter.'}
      chart={
        <div
          role="list"
          aria-label="Try-on pipeline funnel"
          style={{ display: 'grid', gap: '0.75rem' }}
        >
          {steps.map((step) => (
            <div
              key={step.key}
              role="listitem"
              style={{
                alignItems: 'center',
                display: 'grid',
                gap: '0.75rem',
                gridTemplateColumns: 'minmax(140px, 1fr) minmax(0, 3fr) auto',
              }}
            >
              <strong style={{ fontSize: '0.875rem' }}>{step.label}</strong>
              <div
                style={{
                  background: 'var(--gds-color-surface-muted)',
                  borderRadius: 999,
                  height: 10,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    background: 'var(--gds-color-accent)',
                    height: '100%',
                    width: `${base > 0 ? Math.min(100, (step.value / base) * 100) : 0}%`,
                  }}
                />
              </div>
              <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                {step.value} ({pct(step.value, base)})
              </span>
            </div>
          ))}
        </div>
      }
    />
  );
}
