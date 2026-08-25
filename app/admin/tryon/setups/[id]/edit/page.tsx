'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { AdminCheckbox, FormSection } from '@sovereignsquad/gds-admin/client';
import { InlineAlert, StateBlock, useGdsConfirm, useGdsToasts } from '@sovereignsquad/gds-core/client';
import type { TryOnSetupConfig } from '@/lib/db/schemas';

interface TryOnSetupRecord {
  _id: string;
  setupId: string;
  name: string;
  description?: string | null;
  cameraId?: string | null;
  active: boolean;
  isDefault: boolean;
  rank: number;
  config: TryOnSetupConfig;
  createdAt?: string;
  updatedAt?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Setup request failed';
}

export default function EditTryOnSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [setup, setSetup] = useState<TryOnSetupRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMask, setShowMask] = useState(true);
  const { confirm } = useGdsConfirm();
  const { notifyError, notifySuccess } = useGdsToasts();

  useEffect(() => {
    async function fetchSetup() {
      try {
        const response = await fetch(`/api/admin/tryon-setups/${id}`);
        if (!response.ok) throw new Error('Setup not found');
        const data = await response.json();
        const loaded: TryOnSetupRecord = data.setup || data.data?.setup || data;
        setSetup(loaded);
        setShowMask(loaded.config?.show_mask !== false);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    }
    void fetchSetup();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const updateData = {
      name: formData.get('name'),
      description: formData.get('description'),
      cameraId: formData.get('cameraId'),
      active: formData.get('active') === 'on',
      isDefault: formData.get('isDefault') === 'on',
      processingProfile: formData.get('processingProfile'),
      category: formData.get('category'),
      sleeveLength: formData.get('sleeveLength'),
      pantLength: formData.get('pantLength'),
      resolution: formData.get('resolution'),
      steps: formData.get('steps'),
      guidance: formData.get('guidance'),
      showMask,
      maskSharpness: formData.get('maskSharpness'),
      maskPadding: formData.get('maskPadding'),
      detailBoost: formData.get('detailBoost'),
    };

    try {
      const response = await fetch(`/api/admin/tryon-setups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update setup');
      }
      router.push('/admin/tryon/setups');
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsSaving(false);
    }
  };

  const handleDuplicate = async () => {
    setIsDuplicating(true);
    try {
      const response = await fetch(`/api/admin/tryon-setups/${id}/duplicate`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to duplicate setup');
      const newId = data.data?.setup?._id || data.setup?._id;
      notifySuccess({ title: 'Duplicated', message: 'Edit the copy to make it a real variant.' });
      router.push(newId ? `/admin/tryon/setups/${newId}/edit` : '/admin/tryon/setups');
      router.refresh();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      notifyError({ title: 'Duplicate failed', message });
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleToggleActive = async () => {
    if (!setup) return;
    const nextActive = !setup.active;
    const confirmed = await confirm({
      title: nextActive ? 'Unarchive setup' : 'Archive setup',
      message: nextActive
        ? 'This setup becomes available for rerun and job resolution again.'
        : 'This setup stops appearing in rerun/job-resolution pickers. It is not deleted -- unarchive any time.',
    });
    if (!confirmed) return;

    setIsArchiving(true);
    try {
      const response = await fetch(`/api/admin/tryon-setups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update setup');
      setSetup(data.data?.setup || data.setup);
      notifySuccess({ title: nextActive ? 'Unarchived' : 'Archived', message: nextActive ? 'Setup is active again.' : 'Setup is archived.' });
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      notifyError({ title: 'Update failed', message });
    } finally {
      setIsArchiving(false);
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading setup…" />;
  }

  if (!setup) {
    return (
      <StateBlock
        variant="error"
        title="Setup not found"
        description={error || undefined}
        action={
          <Link href="/admin/tryon/setups" style={{ textDecoration: 'none' }}>
            <SemanticButton action="tryon-setups:back-to-list" variant="secondary">
              Back to setups
            </SemanticButton>
          </Link>
        }
      />
    );
  }

  return (
    <EditorScaffold
      eyebrow="Apps"
      title="Edit Setup"
      description="Update this processing preset's configuration and publishing state."
      breadcrumbs={
        <nav aria-label="Breadcrumb">
          <Link href="/admin/tryon/setups">AI Setups</Link>
          <span aria-hidden> / </span>
          <span>Edit</span>
        </nav>
      }
      maxWidth={960}
    >
      {error ? <InlineAlert title="Error" message={error} severity="error" /> : null}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <FormSection title="Technical information">
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
              <div><span>Setup ID</span><code style={{ display: 'block' }}>{setup.setupId}</code></div>
              <div><span>MongoDB ID</span><code style={{ display: 'block' }}>{setup._id}</code></div>
              <div>Created: {setup.createdAt ? new Date(setup.createdAt).toLocaleString() : 'N/A'}</div>
              <div>Updated: {setup.updatedAt ? new Date(setup.updatedAt).toLocaleString() : 'N/A'}</div>
            </div>
          </FormSection>

          <FormSection title="Identity">
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Name *
              <input name="name" required defaultValue={setup.name} style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Description
              <textarea name="description" rows={3} defaultValue={setup.description || ''} style={{ padding: '0.75rem' }} />
            </label>
            <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
              <input type="checkbox" name="active" defaultChecked={setup.active} />
              Active (available for job resolution and rerun)
            </label>
            <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
              <input type="checkbox" name="isDefault" defaultChecked={setup.isDefault} />
              Default setup (used when nothing else resolves)
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Camera override (advanced)
              <input name="cameraId" defaultValue={setup.cameraId || ''} placeholder="Leave blank for a global setup" style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
          </FormSection>

          <FormSection title="Processing configuration">
            {([
              ['processingProfile', 'Processing profile', setup.config.processing_profile ?? setup.config.processingProfile ?? '', 'text'],
              ['category', 'Category', setup.config.category ?? '', 'text'],
              ['sleeveLength', 'Sleeve length', setup.config.sleeve_length ?? '', 'text'],
              ['pantLength', 'Pant length', setup.config.pant_length ?? '', 'text'],
              ['resolution', 'Resolution', setup.config.resolution ?? '', 'text'],
              ['steps', 'Steps', setup.config.steps !== undefined ? String(setup.config.steps) : '', 'numeric'],
              ['guidance', 'Guidance', setup.config.guidance !== undefined ? String(setup.config.guidance) : '', 'decimal'],
            ] as const).map(([name, label, defaultValue, inputMode]) => (
              <label key={name} style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
                {label}
                <input name={name} defaultValue={defaultValue} inputMode={inputMode} style={{ minHeight: 44, padding: '0 0.75rem' }} />
              </label>
            ))}
            <AdminCheckbox name="showMask" label="Show mask" checked={showMask} onChange={setShowMask} />
            {([
              ['maskSharpness', 'Mask sharpness', setup.config.mask_sharpness !== undefined ? String(setup.config.mask_sharpness) : '', 'numeric'],
              ['maskPadding', 'Mask padding', setup.config.mask_padding !== undefined ? String(setup.config.mask_padding) : '', 'numeric'],
              ['detailBoost', 'Detail boost', setup.config.detail_boost !== undefined ? String(setup.config.detail_boost) : '', 'decimal'],
            ] as const).map(([name, label, defaultValue, inputMode]) => (
              <label key={name} style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
                {label}
                <input name={name} defaultValue={defaultValue} inputMode={inputMode} style={{ minHeight: 44, padding: '0 0.75rem' }} />
              </label>
            ))}
          </FormSection>

          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <SemanticButton action="tryon-setups:save" type="submit" loading={isSaving}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </SemanticButton>
              <Link href="/admin/tryon/setups" style={{ textDecoration: 'none' }}>
                <SemanticButton action="tryon-setups:cancel-edit" variant="secondary">
                  Cancel
                </SemanticButton>
              </Link>
              <SemanticButton action="tryon-setups:duplicate" variant="secondary" loading={isDuplicating} onClick={() => void handleDuplicate()}>
                Duplicate as New Setup
              </SemanticButton>
            </div>
            <SemanticButton
              action={setup.active ? 'tryon-setups:archive' : 'tryon-setups:unarchive'}
              variant="danger"
              loading={isArchiving}
              onClick={() => void handleToggleActive()}
            >
              {setup.active ? 'Archive Setup' : 'Unarchive Setup'}
            </SemanticButton>
          </div>
        </div>
      </form>
    </EditorScaffold>
  );
}
