'use client';

/**
 * Upload an item into a library at the level of the page it is on (camera#361): a partner page uploads for the partner, an event page for the
 * event. The picture is shown before it is sent, so nobody uploads blind. One form for every kind (frames, logos and images). It is a <form>, so it is
 * not for use inside another form: the picture picker (ImagePicker) has its own upload for that.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { InlineAlert, UploadDropzone } from '@sovereignsquad/gds-core/client';
import { AdminTextInput } from '@sovereignsquad/gds-admin/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import MediaCard from '@/components/media/MediaPreviewCard';
import type { LibraryKind } from '@/lib/library/kinds';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';

interface LibraryUploadFormProps {
  /** The upload route of the level: `/api/partners/<id>/library/upload`, `/api/events/<id>/library/upload`, or `/api/images` for the global images. */
  endpoint: string;
  kind: LibraryKind;
  /** What the item is: "frame", "logo", "image". */
  noun: string;
  /** The file types the dropzone offers, as an accept list, and the same in words. */
  accept: string;
  acceptWords: string;
  /** The largest file, in bytes, and the same in words ("4 MB"); a bigger one is refused before it is sent. */
  maxBytes?: number;
  maxWords?: string;
  /** The example in the empty name field. */
  namePlaceholder?: string;
  /** Called after a successful upload, so the page can reload its lists. */
  onUploaded: (result?: { messageSetup?: { status: string; detail?: string } }) => void | Promise<void>;
  /** More fields sent with the file (a logo uploaded for an event sends its `scenario`), and the inputs for them, shown above the button. */
  extraFields?: Record<string, string>;
  children?: ReactNode | ((setUploadField: (name: string, value: string) => void, resetVersion: number) => ReactNode);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'The upload failed';
}

export default function LibraryUploadForm({ endpoint, kind, noun, accept, acceptWords, maxBytes, maxWords, namePlaceholder = 'e.g. Blue match frame', onUploaded, extraFields, children }: LibraryUploadFormProps) {
  const language = useUiLanguage();
  const t = (source: string) => adminOperationText(source, language);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFields, setUploadFields] = useState<Record<string, string>>({});
  const [messageNotice, setMessageNotice] = useState<{ message: string; severity: 'success' | 'warning' | 'error' } | null>(null);
  const [resetVersion, setResetVersion] = useState(0);

  const setUploadField = useCallback((field: string, value: string) => {
    setUploadFields((current) => ({ ...current, [field]: value }));
  }, []);

  const choose = (selected: File | null) => {
    if (!selected) return;
    const allowed = accept.split(',').map((type) => type.trim());
    if (!allowed.includes(selected.type)) {
      setError(`Only ${acceptWords} files are allowed.`);
      return;
    }
    if (maxBytes && selected.size > maxBytes) {
      setError(`The file is too big: ${maxWords ?? `${Math.round(maxBytes / 1048576)} MB`} at most.`);
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
    setMessageNotice(null);
    try {
      const body = new FormData();
      body.set('kind', kind);
      body.set('file', file);
      body.set('name', name);
      for (const [field, value] of Object.entries(extraFields ?? {})) body.set(field, value);
      for (const [field, value] of Object.entries(uploadFields)) body.set(field, value);
      const response = await fetch(endpoint, { method: 'POST', body });
      const payload = (await response.json().catch(() => null)) as { error?: string; data?: { messageSetup?: { status: string; detail?: string } } } | null;
      if (!response.ok) throw new Error(payload?.error || `The upload failed (${response.status})`);
      clear();
      setName('');
      setUploadFields({});
      setResetVersion((current) => current + 1);
      const status = payload?.data?.messageSetup?.status;
      if (status === 'ready') setMessageNotice({ message: t('Frame and message images are ready.'), severity: 'success' });
      else if (status === 'needs-generation') setMessageNotice({ message: t('The message was saved and linked. Generate the default frame when you are ready to use it.'), severity: 'warning' });
      else if (status === 'generation-failed') setMessageNotice({ message: t('The message was saved and linked, but its images could not be generated. Use Generate default frame to retry.'), severity: 'warning' });
      else if (status === 'link-failed') setMessageNotice({ message: t('Frame uploaded, but the message could not be attached. Open the event frame settings to attach it again.'), severity: 'error' });
      await onUploaded(payload?.data);
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
          caption={kind === 'frames' ? (name.trim() || file?.name) : file?.name}
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
          description={maxWords ? `${acceptWords.toUpperCase()}, UP TO ${maxWords.toUpperCase()}` : `${acceptWords.toUpperCase()}`}
          onFilesSelected={(files) => choose(files[0] ?? null)}
          actionLabel={`Choose ${noun}`}
        />
      )}
      {error ? <InlineAlert title="Upload failed" message={error} severity="error" /> : null}
      {messageNotice ? <InlineAlert title={t('Printed message')} message={messageNotice.message} severity={messageNotice.severity} /> : null}
      <AdminTextInput
        name="name"
        label={kind === 'frames' ? t('Frame name users see in the chooser') : `${noun[0].toUpperCase()}${noun.slice(1)} name`}
        description={kind === 'frames' ? t('This is the chooser label, not the text printed on the photo.') : undefined}
        value={name}
        onChange={setName}
        required
        placeholder={namePlaceholder}
      />
      {typeof children === 'function' ? children(setUploadField, resetVersion) : children}
      <div>
        <SemanticButton action="library:upload" type="submit" loading={busy} disabled={!file || !name.trim()}>
          Upload
        </SemanticButton>
      </div>
    </form>
  );
}
