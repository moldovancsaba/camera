'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { AdminCheckbox, AdminCrudForm, AdminFormSection, AdminTextInput, AdminTextarea } from '@sovereignsquad/gds-admin/client';
import type { GarmentType } from '@/lib/db/schemas';

const GARMENT_TYPE_OPTIONS: Array<{ value: GarmentType; label: string }> = [
  { value: 'motorsport_suit', label: 'Motorsport suit' },
  { value: 'jersey', label: 'Jersey' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to create setup';
}

export default function NewTryOnSetupPage() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [cameraId, setCameraId] = useState('');
  const [defaultForGarmentTypes, setDefaultForGarmentTypes] = useState<GarmentType[]>([]);

  const toggleGarmentType = (type: GarmentType, checked: boolean) => {
    setDefaultForGarmentTypes((current) =>
      checked ? [...current.filter((t) => t !== type), type] : current.filter((t) => t !== type)
    );
  };

  const [processingProfile, setProcessingProfile] = useState('');
  const [category, setCategory] = useState('');
  const [sleeveLength, setSleeveLength] = useState('');
  const [pantLength, setPantLength] = useState('');
  const [resolution, setResolution] = useState('');
  const [steps, setSteps] = useState('');
  const [guidance, setGuidance] = useState('');
  const [showMask, setShowMask] = useState(true);
  const [maskSharpness, setMaskSharpness] = useState('');
  const [maskPadding, setMaskPadding] = useState('');
  const [detailBoost, setDetailBoost] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/tryon-setups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          active,
          isDefault,
          cameraId,
          defaultForGarmentTypes,
          processingProfile,
          category,
          sleeveLength,
          pantLength,
          resolution,
          steps,
          guidance,
          showMask,
          maskSharpness,
          maskPadding,
          detailBoost,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create setup');
      }
      router.push('/admin/tryon/setups');
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsSaving(false);
    }
  };

  return (
    <EditorScaffold
      eyebrow="Apps"
      title="Create Setup"
      description="Define a new try-on processing preset. Jobs and the vetting/queue rerun pickers resolve to setups by this configuration."
    >
      <form onSubmit={handleSubmit}>
        <AdminCrudForm title="Setup details" description="Name and describe the preset, then configure how it processes a try-on.">
          {error ? <InlineAlert title="Could not create setup" message={error} severity="error" /> : null}

          <AdminFormSection title="Identity">
            <AdminTextInput name="name" label="Name" value={name} onChange={setName} required placeholder="e.g., MotoGP High Detail" />
            <AdminTextarea name="description" label="Description" value={description} onChange={setDescription} placeholder="Optional operator notes..." />
            <AdminCheckbox name="active" label="Active (available for job resolution and rerun)" checked={active} onChange={setActive} />
            <AdminCheckbox
              name="isDefault"
              label="Default setup (used when nothing else resolves)"
              checked={isDefault}
              onChange={setIsDefault}
            />
            <AdminTextInput
              name="cameraId"
              label="Camera override (advanced)"
              value={cameraId}
              onChange={setCameraId}
              placeholder="Leave blank for a global setup available to every camera"
            />
          </AdminFormSection>

          <AdminFormSection
            title="Default for garment types"
            description="Guest captures with a garment of a checked type use this setup automatically. This is more specific than the event's setup choice, so it wins over it; an explicitly requested setup still wins over both."
          >
            {GARMENT_TYPE_OPTIONS.map((option) => (
              <AdminCheckbox
                key={option.value}
                name={`garmentType_${option.value}`}
                label={option.label}
                checked={defaultForGarmentTypes.includes(option.value)}
                onChange={(checked) => toggleGarmentType(option.value, checked)}
              />
            ))}
          </AdminFormSection>

          <AdminFormSection title="Processing configuration">
            <AdminTextInput name="processingProfile" label="Processing profile" value={processingProfile} onChange={setProcessingProfile} placeholder="e.g., motogp_leather_magic" />
            <AdminTextInput name="category" label="Category" value={category} onChange={setCategory} placeholder="e.g., Upper (T-Shirts, Hoodies)" />
            <AdminTextInput name="sleeveLength" label="Sleeve length" value={sleeveLength} onChange={setSleeveLength} placeholder="e.g., default" />
            <AdminTextInput name="pantLength" label="Pant length" value={pantLength} onChange={setPantLength} placeholder="e.g., default" />
            <AdminTextInput name="resolution" label="Resolution" value={resolution} onChange={setResolution} placeholder="e.g., High Quality" />
            <AdminTextInput name="steps" label="Steps" value={steps} onChange={setSteps} inputMode="numeric" placeholder="e.g., 60" />
            <AdminTextInput name="guidance" label="Guidance" value={guidance} onChange={setGuidance} inputMode="decimal" placeholder="e.g., 4.6" />
            <AdminCheckbox name="showMask" label="Show mask" checked={showMask} onChange={setShowMask} />
            <AdminTextInput name="maskSharpness" label="Mask sharpness" value={maskSharpness} onChange={setMaskSharpness} inputMode="numeric" placeholder="e.g., 12" />
            <AdminTextInput name="maskPadding" label="Mask padding" value={maskPadding} onChange={setMaskPadding} inputMode="numeric" placeholder="e.g., 10" />
            <AdminTextInput name="detailBoost" label="Detail boost" value={detailBoost} onChange={setDetailBoost} inputMode="decimal" placeholder="e.g., 0.15" />
          </AdminFormSection>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SemanticButton action="tryon-setups:create" type="submit" loading={isSaving} disabled={!name.trim()}>
              {isSaving ? 'Creating…' : 'Create Setup'}
            </SemanticButton>
            <SemanticButton action="tryon-setups:cancel-create" variant="secondary" onClick={() => router.push('/admin/tryon/setups')}>
              Cancel
            </SemanticButton>
          </div>
        </AdminCrudForm>
      </form>
    </EditorScaffold>
  );
}
