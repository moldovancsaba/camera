'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import { InlineAlert } from '@sovereignsquad/gds-core/client';

const EXPECTED_COUNT = 40;

interface Status {
  restored: number;
  remaining: number;
  total: number;
  complete: boolean;
}

interface Step extends Status {
  status: 'restored' | 'busy' | 'complete';
}

const apiPath = (eventMongoId: string) => `/api/admin/events/${eventMongoId}/restore-mtk-photos`;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const result = await response.json().catch(() => null) as { data?: T; error?: string } | null;
  if (!response.ok || !result?.data) throw new Error(typeof result?.error === 'string' ? result.error : `The restore request failed (HTTP ${response.status}).`);
  return result.data;
}

export default function MtkApprovedPhotoRestore({ eventMongoId }: { eventMongoId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const url = apiPath(eventMongoId);

  const refresh = useCallback(async () => {
    const next = await request<Status>(url);
    setStatus(next);
    return next;
  }, [url]);

  useEffect(() => {
    let active = true;
    void request<Status>(url).then((next) => { if (active) setStatus(next); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not read MTK photo restoration status.');
    });
    return () => { active = false; stop.current = true; };
  }, [url]);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setError(null);
    try {
      // One server request restores one image. A bounded loop keeps each provider copy and DB update independently retryable.
      for (let attempt = 0; attempt < EXPECTED_COUNT + 120 && !stop.current; attempt += 1) {
        const step = await request<Step>(url, { method: 'POST' });
        setStatus({ restored: step.restored, remaining: step.remaining, total: step.total, complete: step.complete });
        if (step.complete) break;
        if (step.status === 'busy') await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      const current = await refresh();
      if (!current.complete && !stop.current) setError('Restoration paused before all 40 photos were completed. Retry to continue safely.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'MTK photo restoration stopped. Retry to continue safely.');
      await refresh().catch(() => undefined);
    } finally {
      setRunning(false);
    }
  };

  if (status?.complete) return null;
  if (!status && !error) return null;

  return (
    <Card component="section" aria-labelledby="mtk-photo-restore-title" p="lg" radius="md" withBorder>
      <Stack gap="sm">
        <div>
          <Title id="mtk-photo-restore-title" order={3}>Restore MTK photos to Approved and Gallery</Title>
          <Text size="sm" c="dimmed">
            Restore the 40 owner-authorized archive matches as ordinary event photos. Camera verifies each image in Vercel Blob, Cloudflare R2, and ImgBB before it appears. No original selfies or participant e-mail addresses are recreated, and no e-mails are sent.
          </Text>
          <Text size="sm" c="dimmed">
            The archive has 39 historical approvals and one earlier rejection; the owner’s explicit instruction authorizes all 40 for the approved gallery.
          </Text>
        </div>
        {error ? <InlineAlert title="Restoration paused" message={error} severity="error" /> : null}
        {status ? (
          <>
            <Text aria-live="polite" role="status">{status.restored} of {status.total} restored; {status.remaining} remaining.</Text>
            <progress aria-label="MTK photo restoration progress" max={status.total} value={status.restored} style={{ width: '100%' }} />
          </>
        ) : null}
        <Button type="button" onClick={run} disabled={running || status?.complete} loading={running}>
          {running ? 'Restoring one photo at a time…' : status?.restored ? 'Continue restoration' : 'Restore all 40 photos'}
        </Button>
      </Stack>
    </Card>
  );
}
