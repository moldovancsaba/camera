'use client';

/**
 * The partner's default for the follow-up e-mail (epic 463, issue 559; the brick model): the events of the partner that made no choice follow it, an event that chose keeps its own choice, and nothing is
 * copied down, so changing it later reaches every event that never chose. The standard is off. The work is GET and PUT /api/partners/<mongo id>/email-defaults.
 */

import { useEffect, useState } from 'react';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import { Button, Group, Select } from '@/components/gds/PublicPrimitives';

type Choice = 'standard' | 'on' | 'off';

const toChoice = (value: boolean | null): Choice => (value === true ? 'on' : value === false ? 'off' : 'standard');
const toValue = (choice: Choice): boolean | null => (choice === 'on' ? true : choice === 'off' ? false : null);

const OPTIONS = [
  { value: 'standard', label: 'Follow the standard: off' },
  { value: 'on', label: 'On: events that made no choice send it' },
  { value: 'off', label: 'Off: events that made no choice do not send it' },
];

export default function PartnerFollowUpDefault({ partnerId }: { partnerId: string }) {
  const url = `/api/partners/${partnerId}/email-defaults`;
  const [stored, setStored] = useState<Choice | null>(null);
  const [choice, setChoice] = useState<Choice>('standard');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(url);
        const payload = (await response.json().catch(() => null)) as { data?: { followUp: boolean | null }; error?: string } | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
        if (!cancelled) {
          setStored(toChoice(payload.data.followUp));
          setChoice(toChoice(payload.data.followUp));
        }
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'The setting could not be loaded');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ followUp: toValue(choice) }) });
      const payload = (await response.json().catch(() => null)) as { data?: { followUp: boolean | null }; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
      setStored(toChoice(payload.data.followUp));
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The setting could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const dirty = stored !== null && choice !== stored;
  return (
    <section aria-labelledby="partner-follow-up-title" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', padding: '1rem' }}>
      <div>
        <h3 id="partner-follow-up-title" style={{ margin: 0 }}>
          Follow-up e-mail
        </h3>
        <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
          A week after an event, each user who has an approved photo, gave an e-mail address and agreed to the terms gets one e-mail to look back at the memory. This is the default for the events of this partner; an event can choose for itself in its Emails page. It
          is off until somebody switches it on, and an event without a date sends nothing.
        </p>
      </div>
      {error ? <InlineAlert title="That did not work" message={error} severity="error" /> : null}
      {saved && !dirty ? <InlineAlert title="Saved" message="The default is saved. Events that made no choice follow it from now on." severity="info" /> : null}
      <Select label="Follow-up e-mail for the events of this partner" data={OPTIONS} value={choice} onChange={(value) => setChoice((value as Choice | null) ?? 'standard')} allowDeselect={false} disabled={stored === null || saving} />
      <Group gap="xs" wrap="wrap">
        <Button type="button" loading={saving} disabled={saving || !dirty} onClick={() => void save()}>
          Save the default
        </Button>
      </Group>
    </section>
  );
}
