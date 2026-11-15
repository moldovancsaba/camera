'use client';

import { useEffect, useState } from 'react';
import { AdminTextInput } from '@sovereignsquad/gds-admin/client';
import { InlineAlert, UploadDropzone } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import MediaCard from '@/components/media/MediaPreviewCard';
import type { LibraryScopeName } from '@/components/admin/library/LibraryItemCard';

interface FrameItem {
  id?: string;
  frameId?: string;
  name: string;
  imageUrl: string;
  thumbnailUrl?: string | null;
  [key: string]: unknown;
}

interface FrameAssetEditorProps {
  endpoint: string;
  scope: LibraryScopeName;
  name: string;
  imageUrl: string | null;
  thumbnailUrl?: string | null;
  /** Global frames already have a name field in their full details form. */
  allowNameEdit?: boolean;
  disabled?: boolean;
  onSaved: (item: FrameItem) => void | Promise<void>;
  onCancel?: () => void;
}

/** Edit the chooser label and/or replace the source image for an owned frame. */
export default function FrameAssetEditor({ endpoint, scope, name: initialName, imageUrl, thumbnailUrl, allowNameEdit = true, disabled = false, onSaved, onCancel }: FrameAssetEditorProps) {
  const [name, setName] = useState(initialName);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const changedName = name.trim() !== initialName.trim();
  const canSave = !disabled && !busy && Boolean(name.trim()) && (Boolean(file) || (allowNameEdit && changedName));

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      let response: Response;
      if (file) {
        const body = new FormData();
        body.set('kind', 'frames');
        body.set('name', name.trim());
        body.set('file', file);
        response = await fetch(endpoint, { method: 'POST', body });
      } else {
        response = await fetch(endpoint, {
          method: scope === 'global' ? 'PUT' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scope === 'global' ? { name: name.trim() } : { kind: 'frames', name: name.trim() }),
        });
      }
      const payload = await response.json().catch(() => null) as { data?: { item?: FrameItem; frame?: FrameItem }; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `Could not save frame (${response.status})`);
      const item = payload?.data?.item ?? payload?.data?.frame;
      if (!item) throw new Error('The saved frame was not returned. Reload the page before editing it again.');
      setFile(null);
      await onSaved(item);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save frame');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Edit frame chooser name or image" style={{ borderTop: '1px solid var(--mantine-color-default-border)', display: 'grid', gap: '0.75rem', paddingTop: '0.75rem' }}>
      {allowNameEdit ? (
        <AdminTextInput name="frame-chooser-name" label="Frame name users see in the chooser" description="This is the chooser label. It is not printed on the photo." value={name} onChange={setName} required maxLength={120} />
      ) : null}
      <div>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Frame image</p>
        <p style={{ margin: '0 0 0.75rem', color: 'var(--mantine-color-dimmed)' }}>Replace the PNG or SVG while keeping this frame and its assignments. Events using it will redraw their generated photos.</p>
        {preview ? (
          <MediaCard src={preview} alt={`Replacement image preview for ${name}`} caption={name.trim() || 'Frame preview'} />
        ) : (
          <MediaCard src={thumbnailUrl ?? imageUrl ?? ''} alt={`Current image for ${name}`} caption={name} />
        )}
        <div style={{ marginTop: '0.5rem' }}>
          <UploadDropzone
            accept="image/png,image/svg+xml"
            title="Choose a replacement image"
            description="PNG or SVG"
            actionLabel="Choose frame image"
            onFilesSelected={(files) => {
              const next = files[0] ?? null;
              if (next && !['image/png', 'image/svg+xml'].includes(next.type)) {
                setError('Choose a PNG or SVG image.');
                return;
              }
              setError(null);
              setFile(next);
            }}
          />
        </div>
      </div>
      {error ? <InlineAlert title="Frame was not saved" message={error} severity="error" /> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <SemanticButton action="library:upload" type="button" loading={busy} disabled={!canSave} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save frame'}
        </SemanticButton>
        {file ? <SemanticButton action="library:clear-upload" type="button" variant="secondary" disabled={busy} onClick={() => setFile(null)}>Clear replacement</SemanticButton> : null}
        {onCancel ? <SemanticButton action="frames:cancel-edit" type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancel</SemanticButton> : null}
      </div>
    </section>
  );
}
