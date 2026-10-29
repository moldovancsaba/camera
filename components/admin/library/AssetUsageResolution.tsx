'use client';

import { useCallback, useEffect, useState } from 'react';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import type { LibraryKind } from '@/lib/library/kinds';
import type { AssetUsage } from '@/lib/library/usages';

interface UsagePayload {
  data?: { usages?: AssetUsage[]; total?: number; truncated?: boolean; copySourceUrl?: string | null; assetName?: string };
  error?: string;
}

const PANEL_STYLE = {
  border: '1px solid var(--mantine-color-default-border)',
  borderRadius: '1rem',
  display: 'grid',
  gap: '1rem',
  padding: '1.25rem',
} as const;

/** Keeps a blocked delete actionable while the user resolves every child reference in another tab. */
export default function AssetUsageResolution({ kind, assetId }: { kind: LibraryKind; assetId: string }) {
  const [usages, setUsages] = useState<AssetUsage[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [total, setTotal] = useState(0);
  const [copySourceUrl, setCopySourceUrl] = useState<string | null>(null);
  const [assetName, setAssetName] = useState('asset');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (offset: number, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/visual-assets/${kind}/${encodeURIComponent(assetId)}/usages?offset=${offset}`, { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as UsagePayload | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error || `Could not load asset uses (${response.status})`);
      const next = payload.data.usages ?? [];
      setUsages((current) => append && current ? [...current, ...next] : next);
      setTotal(payload.data.total ?? next.length);
      setTruncated(Boolean(payload.data.truncated));
      setCopySourceUrl(payload.data.copySourceUrl ?? null);
      setAssetName(payload.data.assetName || 'asset');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load asset uses');
    } finally {
      setLoading(false);
    }
  }, [assetId, kind]);

  const refresh = useCallback(() => load(0, false), [load]);
  const loadMore = useCallback(() => {
    if (usages?.length) void load(usages.length, true);
  }, [load, usages]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section aria-labelledby="asset-usage-resolution-title" style={PANEL_STYLE}>
      <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
        <div>
          <h2 id="asset-usage-resolution-title" style={{ fontSize: '1.2rem', margin: 0 }}>This asset is still used</h2>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>
            Open each listed location in a new tab. Remove the use, choose a replacement, or save a copy of this file and upload it at the destination. Return here and retry Delete when the uses are resolved.
          </p>
        </div>
        <SemanticButton action="library:refresh-asset-uses" variant="secondary" size="sm" disabled={loading} onClick={() => void refresh()}>
          {loading ? 'Refreshing…' : 'Refresh uses'}
        </SemanticButton>
      </div>

      {error ? <InlineAlert title="Could not refresh uses" message={error} severity="error" /> : null}
      {copySourceUrl ? <a href={copySourceUrl} target="_blank" rel="noopener noreferrer">
        Open {assetName} source file to save a copy<span className="sr-only"> (opens in a new tab)</span>
      </a> : null}
      {loading && usages === null ? <StateBlock variant="loading" title="Finding partner and event uses…" /> : null}
      {!loading && usages?.length === 0 ? <InlineAlert title="No current uses found" message="The last delete attempt found a use. Refresh the page data and retry Delete; the server will check again before removing the asset." severity="info" /> : null}
      {truncated ? <InlineAlert title="Some uses are not listed" message="There are more than 500 references. Deletion stays blocked until all remaining references are resolved." severity="warning" /> : null}

      {usages?.length ? (
        <>
          <p aria-live="polite" style={{ margin: 0 }}>{`Showing ${usages.length} of ${total} uses.`}</p>
          <ul style={{ display: 'grid', gap: '0.75rem', listStyle: 'none', margin: 0, padding: 0 }}>
          {usages.map((usage) => (
            <li key={usage.key} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.75rem', display: 'grid', gap: '0.35rem', padding: '0.9rem' }}>
              <strong>{usage.ownerName}</strong>
              <span style={{ color: 'var(--mantine-color-dimmed)' }}>{usage.uses.join(' · ')}</span>
              <a href={usage.href} target="_blank" rel="noopener noreferrer">
                Open {usage.ownerLevel === 'partner' ? 'partner' : usage.ownerLevel === 'event' ? 'event' : usage.ownerLevel.replace('-', ' ')} settings for {usage.ownerName}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
          </ul>
          {truncated ? <div><SemanticButton action="library:load-more-asset-uses" variant="secondary" size="sm" disabled={loading} onClick={loadMore}>{loading ? 'Loading…' : 'Load more uses'}</SemanticButton></div> : null}
        </>
      ) : null}
    </section>
  );
}
