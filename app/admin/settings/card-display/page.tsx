'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { AdminCheckbox, FormSection } from '@sovereignsquad/gds-admin/client';
import { InlineAlert, StateBlock, useGdsToasts } from '@sovereignsquad/gds-core/client';

interface CardDisplaySettings {
  metadata: { email: boolean; eventPartner: boolean; garmentName: boolean };
  status: { reviewBadge: boolean; greatBadge: boolean; visibilityLabel: boolean; assetHealth: boolean };
  actions: {
    approveReject: boolean;
    great: boolean;
    service: boolean;
    view: boolean;
    download: boolean;
    fix: boolean;
    remove: boolean;
    rerunControls: boolean;
    pinToSlideshow: boolean;
  };
  updatedAt: string;
  updatedBy: string | null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Card display settings request failed';
}

export default function CardDisplaySettingsPage() {
  const [settings, setSettings] = useState<CardDisplaySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notifyError, notifySuccess } = useGdsToasts();

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch('/api/admin/settings/card-display');
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load card display settings');
        }
        setSettings(payload.data);
      } catch (fetchError) {
        setError(getErrorMessage(fetchError));
      } finally {
        setIsLoading(false);
      }
    }
    void fetchSettings();
  }, []);

  function toggle<G extends 'metadata' | 'status' | 'actions'>(group: G, key: keyof CardDisplaySettings[G], checked: boolean) {
    setSettings((current) =>
      current ? { ...current, [group]: { ...current[group], [key]: checked } } : current
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    try {
      setIsSaving(true);
      setError(null);
      const response = await fetch('/api/admin/settings/card-display', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: settings.metadata,
          status: settings.status,
          actions: settings.actions,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save card display settings');
      }
      setSettings(payload.data);
      notifySuccess({ title: 'Saved', message: 'Card display settings updated.' });
    } catch (submitError) {
      const message = getErrorMessage(submitError);
      setError(message);
      notifyError({ title: 'Save failed', message });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading card display settings…" />;
  }

  if (!settings) {
    return (
      <StateBlock
        variant="error"
        title="Could not load card display settings"
        description={error ?? undefined}
      />
    );
  }

  return (
    <EditorScaffold
      eyebrow="Settings"
      title="Vetting Card Display"
      description="Choose which fields and action buttons appear on the Vetting moderation card. Changes apply for every admin immediately -- there is no per-admin-user override."
      breadcrumbs={
        <nav aria-label="Breadcrumb">
          <Link href="/admin/tryon/vetting">Vetting</Link>
          <span aria-hidden> / </span>
          <span>Card Display Settings</span>
        </nav>
      }
      maxWidth={720}
    >
      {error ? <InlineAlert title="Error" message={error} severity="error" /> : null}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <FormSection title="Metadata" description="Text shown under the image, beside the actions.">
            <AdminCheckbox
              name="metadata_email"
              label="Guest email"
              checked={settings.metadata.email}
              onChange={(checked) => toggle('metadata', 'email', checked)}
            />
            <AdminCheckbox
              name="metadata_eventPartner"
              label="Event / partner"
              checked={settings.metadata.eventPartner}
              onChange={(checked) => toggle('metadata', 'eventPartner', checked)}
            />
            <AdminCheckbox
              name="metadata_garmentName"
              label="Garment name"
              checked={settings.metadata.garmentName}
              onChange={(checked) => toggle('metadata', 'garmentName', checked)}
            />
          </FormSection>

          <FormSection title="Status indicators">
            <AdminCheckbox
              name="status_reviewBadge"
              label="Review status badge (pending / approved / rejected)"
              checked={settings.status.reviewBadge}
              onChange={(checked) => toggle('status', 'reviewBadge', checked)}
            />
            <AdminCheckbox
              name="status_greatBadge"
              label="Great badge"
              checked={settings.status.greatBadge}
              onChange={(checked) => toggle('status', 'greatBadge', checked)}
            />
            <AdminCheckbox
              name="status_visibilityLabel"
              label="Share / slideshow visibility label"
              checked={settings.status.visibilityLabel}
              onChange={(checked) => toggle('status', 'visibilityLabel', checked)}
            />
            <AdminCheckbox
              name="status_assetHealth"
              label="Asset health warning (unreachable source/result image)"
              checked={settings.status.assetHealth}
              onChange={(checked) => toggle('status', 'assetHealth', checked)}
            />
          </FormSection>

          <FormSection
            title="Actions"
            description="Turning an action off hides the button everywhere on this card -- it does not disable the underlying capability, so operators can still reach it from the Queue page or elsewhere."
          >
            <AdminCheckbox
              name="actions_approveReject"
              label="Approve / Reject"
              checked={settings.actions.approveReject}
              onChange={(checked) => toggle('actions', 'approveReject', checked)}
            />
            <AdminCheckbox
              name="actions_great"
              label="Great / Remove Great"
              checked={settings.actions.great}
              onChange={(checked) => toggle('actions', 'great', checked)}
            />
            <AdminCheckbox
              name="actions_service"
              label="Service"
              checked={settings.actions.service}
              onChange={(checked) => toggle('actions', 'service', checked)}
            />
            <AdminCheckbox
              name="actions_view"
              label="View"
              checked={settings.actions.view}
              onChange={(checked) => toggle('actions', 'view', checked)}
            />
            <AdminCheckbox
              name="actions_download"
              label="Download"
              checked={settings.actions.download}
              onChange={(checked) => toggle('actions', 'download', checked)}
            />
            <AdminCheckbox
              name="actions_fix"
              label="Fix (link to the Queue page for this job)"
              checked={settings.actions.fix}
              onChange={(checked) => toggle('actions', 'fix', checked)}
            />
            <AdminCheckbox
              name="actions_remove"
              label="Remove (permanent delete)"
              checked={settings.actions.remove}
              onChange={(checked) => toggle('actions', 'remove', checked)}
            />
            <AdminCheckbox
              name="actions_rerunControls"
              label="Rerun preset + garment picker"
              checked={settings.actions.rerunControls}
              onChange={(checked) => toggle('actions', 'rerunControls', checked)}
            />
            <AdminCheckbox
              name="actions_pinToSlideshow"
              label="Add to slideshow picker (Great results only)"
              checked={settings.actions.pinToSlideshow}
              onChange={(checked) => toggle('actions', 'pinToSlideshow', checked)}
            />
          </FormSection>

          <div style={{ alignItems: 'center', display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
            <SemanticButton action="card-display-settings:save" type="submit" loading={isSaving}>
              Save
            </SemanticButton>
            {settings.updatedAt ? (
              <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }} suppressHydrationWarning>
                Last saved {new Date(settings.updatedAt).toLocaleString()}
                {settings.updatedBy ? ` by ${settings.updatedBy}` : ''}
              </span>
            ) : null}
          </div>
        </div>
      </form>
    </EditorScaffold>
  );
}
