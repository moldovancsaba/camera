'use client';

/**
 * The one global switch of the journey defaults (planning item 26, camera#330): events created from now on get the defaults automatically (the
 * default consent page, the default order of the pages); existing events get them only when this is on. Nothing an event has set is deleted.
 */

import { useEffect, useState } from 'react';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { AdminCheckbox, FormSection } from '@sovereignsquad/gds-admin/client';
import { InlineAlert, StateBlock, useGdsToasts } from '@sovereignsquad/gds-core/client';

interface Rollout {
  applyToExistingEvents: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'The request failed');

export default function JourneyDefaultsSettingsPage() {
  const [rollout, setRollout] = useState<Rollout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notifyError, notifySuccess } = useGdsToasts();

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/admin/settings/defaults-rollout');
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Failed to load the journey defaults setting');
        setRollout(payload.data);
      } catch (fetchError) {
        setError(messageOf(fetchError));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!rollout) return;
    try {
      setIsSaving(true);
      setError(null);
      const response = await fetch('/api/admin/settings/defaults-rollout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applyToExistingEvents: rollout.applyToExistingEvents }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save');
      setRollout(payload.data);
      notifySuccess({ title: 'Saved', message: payload.data.applyToExistingEvents ? 'Existing events now get the journey defaults.' : 'Existing events keep what they have.' });
    } catch (saveError) {
      setError(messageOf(saveError));
      notifyError({ title: 'Save failed', message: messageOf(saveError) });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <StateBlock variant="loading" title="Loading the journey defaults setting…" />;
  if (!rollout) return <StateBlock variant="error" title="Could not load the journey defaults setting" description={error ?? undefined} />;

  return (
    <EditorScaffold
      eyebrow="Settings"
      title="Journey defaults"
      description="Defaults, such as the consent page every user accepts before the photo, are added to events created from now on automatically. Existing events keep exactly what they have until you turn this on."
      maxWidth={720}
    >
      {error ? <InlineAlert title="Error" message={error} severity="error" /> : null}
      <form onSubmit={save}>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <FormSection
            title="Existing events"
            description="When this is on, every existing event shows the defaults it does not have yet, at once, including events that are running now. Whatever an event has already set (its pages, its frames, its pictures) is kept and wins; nothing is deleted. Turn it off and existing events go back to what they have."
          >
            <AdminCheckbox
              name="applyToExistingEvents"
              label="Apply the journey defaults to existing events"
              checked={rollout.applyToExistingEvents}
              onChange={(checked) => setRollout((current) => (current ? { ...current, applyToExistingEvents: checked } : current))}
            />
          </FormSection>
          <div style={{ alignItems: 'center', display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
            <SemanticButton action="defaults-rollout:save" type="submit" loading={isSaving}>
              Save
            </SemanticButton>
            {rollout.updatedAt ? (
              <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem' }} suppressHydrationWarning>
                Last saved {new Date(rollout.updatedAt).toLocaleString()}
                {rollout.updatedBy ? ` by ${rollout.updatedBy}` : ''}
              </span>
            ) : null}
          </div>
        </div>
      </form>
    </EditorScaffold>
  );
}
