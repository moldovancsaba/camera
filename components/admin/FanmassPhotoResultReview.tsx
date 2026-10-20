'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button, Card, Stack, Text } from '@/components/gds/PublicPrimitives';
import type { FanmassEventPhoto, FanmassQueueStatus } from '@/lib/fanmass/photo-results';

const STATUS_LABEL: Record<FanmassQueueStatus, string> = {
  awaiting: 'Waiting for Fanmass',
  queued: 'Queued',
  leased: 'Starting',
  processing: 'In progress',
  retry: 'Retrying',
  completed: 'Fanmass analysed',
  result_missing: 'Completed, but the saved result is missing',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function ResultDetails({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  if (!value || Object.keys(value).length === 0) return null;
  return (
    <details style={{ borderTop: '1px solid var(--mantine-color-default-border)', paddingTop: '0.75rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{title}</summary>
      <pre style={{ fontSize: '0.8125rem', lineHeight: 1.5, maxHeight: '22rem', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function PercentBox({ x, y, w, h, label, colour }: { x: number; y: number; w: number; h: number; label: string; colour: string }) {
  return (
    <div
      aria-label={label}
      style={{
        border: `2px solid ${colour}`,
        boxSizing: 'border-box',
        left: `${x * 100}%`,
        pointerEvents: 'none',
        position: 'absolute',
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
      }}
    >
      <span style={{ background: colour, color: 'var(--mantine-color-dark-9)', fontSize: '0.75rem', fontWeight: 700, left: 0, lineHeight: 1.4, padding: '0 0.25rem', position: 'absolute', top: 0 }}>{label}</span>
    </div>
  );
}

export default function FanmassPhotoResultReview({
  eventId,
  item,
  previousId,
  nextId,
}: {
  eventId: string;
  item: FanmassEventPhoto;
  previousId: string | null;
  nextId: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = item.result;
  const people = result?.boxes.people ?? [];
  const faces = result?.boxes.faces ?? [];

  const confirmResult = async () => {
    if (saving || !result) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/analysis/fanmass/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      const payload = await response.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? 'Could not save the confirmation.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the confirmation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="lg" data-fanmass-photo-review>
      <Card>
        <Stack gap="sm">
          <Text fw={700}>Fanmass status: {STATUS_LABEL[item.queueStatus]}</Text>
          <Text size="sm" c="dimmed">Photo reference: {item.submissionId}</Text>
          <Text size="sm" c="dimmed">Queue updated: {formatDateTime(item.queueUpdatedAt)}</Text>
          {item.errorCode ? <Text c="red" size="sm">Processing issue: {item.errorCode}</Text> : null}
          {item.confirmed ? (
            <Text c="teal" fw={700} size="sm">Confirmed by {item.confirmedBy ?? 'an event reviewer'} · {formatDateTime(item.confirmedAt)}</Text>
          ) : result ? <Text c="orange" fw={700} size="sm">Human confirmation needed</Text> : null}
        </Stack>
      </Card>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', alignItems: 'start' }}>
        <section aria-label="Photo with Fanmass detections" style={{ minWidth: 0 }}>
          {item.photoUrl ? (
            <div style={{ display: 'inline-block', lineHeight: 0, maxWidth: '100%', position: 'relative', userSelect: 'none' }}>
              <Image src={item.photoUrl} alt="Original photo analysed by Fanmass" width={1600} height={1200} unoptimized priority style={{ display: 'block', height: 'auto', maxHeight: 'calc(100vh - 13rem)', maxWidth: '100%', width: 'auto' }} />
              {result ? (
                <div aria-label="Fanmass result boxes" style={{ inset: 0, position: 'absolute' }}>
                  {people.map((person, index) => <PercentBox key={`person-${person.id}`} {...person.box} label={`Person ${index + 1}`} colour="var(--mantine-color-yellow-5)" />)}
                  {faces.map((face, index) => <PercentBox key={`face-${face.id}`} {...face.box} label={`Face ${index + 1}`} colour="var(--mantine-color-blue-5)" />)}
                </div>
              ) : null}
            </div>
          ) : <Card><Text c="dimmed">The source photo is not available for display.</Text></Card>}
          {result ? <Text size="xs" c="dimmed" mt="xs">Yellow: detected people · Blue: detected faces</Text> : null}
        </section>

        <Card>
          {result ? (
            <Stack gap="md">
              <Text fw={700}>Fanmass result</Text>
              <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div><Text size="sm" c="dimmed">People estimate</Text><Text fw={700}>{result.summary.personCount}</Text></div>
                <div><Text size="sm" c="dimmed">People boxes</Text><Text fw={700}>{people.length}</Text></div>
                <div><Text size="sm" c="dimmed">Face boxes</Text><Text fw={700}>{faces.length}</Text></div>
                <div><Text size="sm" c="dimmed">Crowd estimate</Text><Text fw={700}>{result.summary.crowdEstimate}</Text></div>
              </div>
              <Text size="sm">Scene: {result.summary.sceneType}</Text>
              <Text size="sm" c="dimmed">Analysis stage: {result.analysisStage} · analysed {formatDateTime(result.analyzedAt)}</Text>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <Text fw={700} size="sm">People detected ({people.length})</Text>
                {people.length === 0 ? <Text size="sm" c="dimmed">No individual people boxes were returned.</Text> : people.map((person, index) => (
                  <div key={person.id} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', padding: '0.5rem' }}>
                    <Text fw={700} size="sm">Person {index + 1}</Text>
                    <Text size="sm">{person.gender} · {person.estimatedAge == null ? 'age unknown' : `about ${person.estimatedAge}`} · {person.emotion}</Text>
                    <Text size="xs" c="dimmed">{person.subjectType} · confidence {person.confidence == null ? 'unknown' : `${Math.round(person.confidence * 100)}%`} · {person.smiling ? 'smiling' : 'not marked smiling'} · {person.hasCap ? 'cap' : 'no cap'} · {person.hasGlasses ? 'glasses' : 'no glasses'}</Text>
                  </div>
                ))}
              </div>
              <ResultDetails title="Demographics" value={result.summary.demographics} />
              <ResultDetails title="Moderation and safety" value={result.summary.moderation} />
              <ResultDetails title="Sports merchandise and entities" value={result.summary.sportsMerchandise} />
              <ResultDetails title="Fashion brands" value={result.summary.fashionBrands} />
              <ResultDetails title="Full Fanmass analysis properties" value={result.analysis} />
              {error ? <Text c="red" role="alert" size="sm">{error}</Text> : null}
              <Button type="button" disabled={saving || item.confirmed} onClick={confirmResult}>
                {item.confirmed ? 'Confirmed' : saving ? 'Saving confirmation…' : 'Confirm Fanmass analysis'}
              </Button>
              <Text size="xs" c="dimmed">Confirmation is stored in Camera against this exact Fanmass result revision. It does not change vetting, publication, or the original AI result.</Text>
            </Stack>
          ) : (
            <Stack gap="sm">
              <Text fw={700}>{STATUS_LABEL[item.queueStatus]}</Text>
              <Text size="sm" c="dimmed">There is no completed result to review yet. This photo stays in the Fanmass queue state shown above.</Text>
            </Stack>
          )}
        </Card>
      </div>

      <nav aria-label="Fanmass photo navigation" style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
        {previousId ? <a href={`/admin/events/${eventId}/analysis/fanmass/review?photo=${encodeURIComponent(previousId)}`}>← Previous Fanmass photo</a> : <span />}
        {nextId ? <a href={`/admin/events/${eventId}/analysis/fanmass/review?photo=${encodeURIComponent(nextId)}`}>Next Fanmass photo →</a> : <span />}
      </nav>
    </Stack>
  );
}
