'use client';

/**
 * Upload an item into a library at the level of the page it is on (camera#361): a partner page uploads for the partner, an event page for the
 * event. The picture is shown before it is sent, so nobody uploads blind. One form for frames now; logos and images use it later.
 */

import { useState } from 'react';
import { InlineAlert, UploadDropzone } from '@sovereignsquad/gds-core/client';
import { AdminTextInput } from '@sovereignsquad/gds-admin/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import MediaCard from '@/components/media/MediaPreviewCard';

interface LibraryUploadFormProps {
  /** The upload route of the level: `/api/partners/<id>/library/upload` or `/api/events/<id>/library/upload`. */
  endpoint: string;
  kind: 'frames' | 'logos';
  /** What the item is: "frame", "logo". */
  noun: string;
  /** The file types the dropzone offers, as an accept list, and the same in words. */
  accept: string;
  acceptWords: string;
  /** Called after a successful upload, so the page can reload its lists. */
  onUploaded: () => void | Promise<void>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'The upload failed';
}

export default function LibraryUploadForm({ endpoint, kind, noun, accept, acceptWords, onUploaded }: LibraryUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (selected: File | null) => {
    if (!selected) return;
    const allowed = accept.split(',').map((type) => type.trim());
    if (!allowed.includes(selected.type)) {
      setError(`Only ${acceptWords} files are allowed.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
      setFile(selected);
      setName((current) => current || selected.name.replace(/\.[^.]+$/, ''));
      setError(null);
    };
    reader.readAsDataURL(selected);
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
    setError(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('kind', kind);
      body.set('file', file);
      body.set('name', name);
      const response = await fetch(endpoint, { method: 'POST', body });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `The upload failed (${response.status})`);
      clear();
      setName('');
      await onUploaded();
    } catch (uploadError) {
      setError(errorText(uploadError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem' }}>
      {preview ? (
        <MediaCard
          src={preview}
          alt={`Preview of the new ${noun}`}
          caption={file?.name}
          action={
            <SemanticButton action="library:clear-upload" variant="secondary" onClick={clear}>
              Choose another file
            </SemanticButton>
          }
        />
      ) : (
        <UploadDropzone
          accept={accept}
          title="Click to upload or drag and drop"
          description={`${acceptWords.toUpperCase()}`}
          onFilesSelected={(files) => choose(files[0] ?? null)}
          actionLabel={`Choose ${noun}`}
        />
      )}
      {error ? <InlineAlert title="Upload failed" message={error} severity="error" /> : null}
      <AdminTextInput name="name" label={`${noun[0].toUpperCase()}${noun.slice(1)} name`} value={name} onChange={setName} required placeholder="e.g. Blue match frame" />
      <div>
        <SemanticButton action="library:upload" type="submit" loading={busy} disabled={!file || !name.trim()}>
          Upload
        </SemanticButton>
      </div>
    </form>
  );
}
