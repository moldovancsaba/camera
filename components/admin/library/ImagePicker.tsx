'use client';

/**
 * The picture picker of a picture field (camera#368, docs/LIBRARIES.md): the welcome page pictures, the CTA page picture, the email footer, the
 * slideshow screen overlay. It shows the current picture (or "No picture"), chooses one from the Images library of the level of the page (an event
 * editor: the event's library; a partner page: the partner's; a global page: the global one), uploads one at that level, or clears the field.
 * The field keeps the same plain address it always stored, so the capture page, the emails and the slideshow need no change; an address typed
 * or pasted by hand still works and shows its preview.
 *
 * It sits inside the editors' own forms: it has no <form>, its buttons never submit, Enter in its name field uploads instead of saving the editor,
 * and none of its fields is required, so the editor's Save works as before.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { InlineAlert, LabelTag, UploadDropzone } from '@sovereignsquad/gds-core/client';
import { AdminTextInput } from '@sovereignsquad/gds-admin/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import AssetThumbnail from '@/components/admin/library/AssetThumbnail';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS, IMAGE_MAX_BYTES, IMAGE_MAX_WORDS, type ImageFileType } from '@/lib/library/image-files';
import { chosenValue, libraryItemFor, pickableImages, pickerEndpoints, pictureFileType, previewableUrl, type PickerLevel } from '@/lib/library/picker';
import type { LibraryItemView } from '@/lib/library/types';

export interface ImagePickerProps {
  /** The field's label, and what it is for. */
  label: string;
  helper?: string;
  /** The address the field stores; empty: no picture. */
  value: string;
  onChange: (value: string) => void;
  /** The library the field chooses from and uploads to: the level of the page it is on. */
  level: PickerLevel;
  /** The file types the field takes, and the same in words (default: every type of the Images library). Others are not offered or uploaded here. */
  fileTypes?: readonly ImageFileType[];
  fileTypeWords?: string;
  placeholder?: string;
}

const GRID = { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))' } as const;
const PANEL = { border: '1px solid var(--gds-color-border)', borderRadius: '0.75rem', display: 'grid', gap: '0.75rem', padding: '0.75rem' } as const;
const MUTED = { color: 'var(--gds-color-muted)', fontSize: '0.8125rem' } as const;

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function ImagePicker({ label, helper, value, onChange, level, fileTypes = IMAGE_FILE_TYPES, fileTypeWords = IMAGE_FILE_WORDS, placeholder = 'https://…' }: ImagePickerProps) {
  const uid = useId();
  const endpoints = pickerEndpoints(level);
  const listUrl = endpoints.list;
  const scope = level.scope;
  // A string, so a list written in place does not reload the library on every render.
  const typesKey = fileTypes.join(',');
  const [panel, setPanel] = useState<'library' | 'upload' | null>(null);
  const [items, setItems] = useState<LibraryItemView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const response = await fetch(listUrl);
      const payload = (await response.json().catch(() => null)) as { data?: unknown; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `The library could not be loaded (${response.status})`);
      setItems(pickableImages(scope, payload?.data, typesKey.split(',') as ImageFileType[]));
    } catch (error) {
      setLoadError(errorText(error, 'The library could not be loaded'));
    }
  }, [listUrl, scope, typesKey]);

  // The library is read once, so the picker can say whether the current picture is one of its own; it is read again when it is opened after an error.
  useEffect(() => {
    void load();
  }, [load]);

  const current = value.trim();
  const preview = previewableUrl(current);
  const fromLibrary = items ? libraryItemFor(current, items) : null;
  const currentType = preview ? pictureFileType(preview) : null;
  const wrongType = currentType !== null && !fileTypes.includes(currentType);

  const choose = (item: LibraryItemView) => {
    onChange(chosenValue(item));
    setPanel(null);
  };

  const openLibrary = () => {
    setPanel(panel === 'library' ? null : 'library');
    if (panel !== 'library' && loadError) void load();
  };

  const clearFile = () => {
    setFile(null);
    setFilePreview(null);
    setUploadError(null);
  };

  const chooseFile = (selected: File | null) => {
    if (!selected) return;
    if (!(fileTypes as readonly string[]).includes(selected.type)) {
      setUploadError(`Only ${fileTypeWords} files are allowed here.`);
      return;
    }
    if (selected.size > IMAGE_MAX_BYTES) {
      setUploadError(`The file is too big: ${IMAGE_MAX_WORDS} at most.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFilePreview(String(reader.result));
      setFile(selected);
      setFileName((name) => name || selected.name.replace(/\.[^.]+$/, ''));
      setUploadError(null);
    };
    reader.readAsDataURL(selected);
  };

  const upload = async () => {
    if (!file || !fileName.trim() || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.set('kind', 'images');
      body.set('file', file);
      body.set('name', fileName.trim());
      const response = await fetch(endpoints.upload, { method: 'POST', body });
      const payload = (await response.json().catch(() => null)) as { data?: { item?: LibraryItemView }; error?: string } | null;
      const item = payload?.data?.item;
      if (!response.ok || !item?.imageUrl) throw new Error(payload?.error || `The upload failed (${response.status})`);
      setItems((list) => [item, ...(list ?? [])]);
      onChange(chosenValue(item));
      clearFile();
      setFileName('');
      setPanel(null);
    } catch (error) {
      setUploadError(errorText(error, 'The upload failed'));
    } finally {
      setUploading(false);
    }
  };

  let status: React.ReactNode;
  if (!current) status = <span style={MUTED}>No picture: nothing is shown.</span>;
  else if (!preview) status = <span style={MUTED}>Not a picture address yet: it starts with https://</span>;
  else if (brokenUrl === preview) status = <LabelTag tone="warning" label="This address does not show a picture" />;
  else if (fromLibrary) status = (
    <>
      <LabelTag tone="success" label="From the library" />
      <span style={MUTED}>{fromLibrary.name}</span>
    </>
  );
  else if (items) status = (
    <>
      <LabelTag tone="neutral" label="Not in the library" />
      <span style={MUTED}>An address typed or pasted here. It keeps working.</span>
    </>
  );

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }} data-image-picker>
      <div style={{ display: 'grid', gap: '0.25rem' }}>
        <strong>{label}</strong>
        {helper ? <span style={MUTED}>{helper}</span> : null}
      </div>
      <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <AssetThumbnail key={preview ?? 'none'} url={preview} name={fromLibrary?.name || label} noun="image" width={200} onError={() => setBrokenUrl(preview)} />
        <div style={{ display: 'grid', flex: '1 1 240px', gap: '0.5rem', minWidth: 0 }}>
          <AdminTextInput name={`picture-address-${uid}`} label="Picture address" value={value} onChange={onChange} placeholder={placeholder} />
          {status ? <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>{status}</div> : null}
          {wrongType ? <LabelTag tone="warning" label={`This field takes ${fileTypeWords}`} /> : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <SemanticButton action={panel === 'library' ? 'library:close' : 'library:choose'} type="button" variant="secondary" size="xs" onClick={openLibrary}>
              {panel === 'library' ? 'Close the library' : 'Choose from the library'}
            </SemanticButton>
            <SemanticButton action="library:upload-here" type="button" variant="secondary" size="xs" onClick={() => setPanel(panel === 'upload' ? null : 'upload')}>
              Upload here
            </SemanticButton>
            <SemanticButton action="library:clear-picture" type="button" variant="secondary" size="xs" disabled={!value} onClick={() => onChange('')}>
              Clear the picture
            </SemanticButton>
          </div>
        </div>
      </div>

      {panel === 'library' ? (
        <div style={PANEL} data-image-picker-library>
          <div style={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between' }}>
            <strong>Choose from {endpoints.words}{items ? ` (${items.length})` : ''}</strong>
            <Link href={endpoints.page} target="_blank" rel="noopener">Open the Images page</Link>
          </div>
          {loadError ? <InlineAlert title="The library could not be loaded" message={loadError} severity="error" /> : null}
          {!items && !loadError ? <span style={MUTED}>Loading the library...</span> : null}
          {items && items.length === 0 ? <p style={{ ...MUTED, margin: 0 }}>No images in {endpoints.words} yet. Upload one here, or add images on the Images page.</p> : null}
          {items && items.length > 0 ? (
            <div style={GRID}>
              {items.map((item) => {
                const inUse = item.imageUrl === current;
                return (
                  <LibraryItemCard
                    key={item.id}
                    name={item.name}
                    imageUrl={item.imageUrl}
                    thumbnailUrl={item.thumbnailUrl}
                    noun="image"
                    scope={item.scope}
                    badges={inUse ? <LabelTag tone="success" label="In use here" /> : null}
                    actions={
                      <SemanticButton action="library:use" type="button" size="xs" disabled={inUse} onClick={() => choose(item)}>
                        Use this picture
                      </SemanticButton>
                    }
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {panel === 'upload' ? (
        <div style={PANEL} data-image-picker-upload>
          <strong>Upload a picture to {endpoints.words}</strong>
          {filePreview ? (
            // The chosen file as the field will show it: the same small 16:9 preview, so the editor around the picker keeps its size.
            <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <AssetThumbnail url={filePreview} name="Preview of the new picture" noun="image" width={240} />
              <div style={{ display: 'grid', gap: '0.5rem', minWidth: 0 }}>
                <span style={{ ...MUTED, overflowWrap: 'anywhere' }}>{file?.name}</span>
                <div>
                  <SemanticButton action="library:clear-upload" type="button" variant="secondary" size="xs" onClick={clearFile}>
                    Choose another file
                  </SemanticButton>
                </div>
              </div>
            </div>
          ) : (
            <UploadDropzone
              accept={typesKey}
              title="Click to upload or drag and drop"
              description={`${fileTypeWords}, up to ${IMAGE_MAX_WORDS}`.toUpperCase()}
              multiple={false}
              onFilesSelected={(files) => chooseFile(files[0] ?? null)}
              actionLabel="Choose image"
            />
          )}
          {uploadError ? <InlineAlert title="Upload failed" message={uploadError} severity="error" /> : null}
          <AdminTextInput
            name={`picture-name-${uid}`}
            label="Image name"
            value={fileName}
            onChange={setFileName}
            placeholder="e.g. Welcome background"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void upload();
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <SemanticButton action="library:upload-and-use" type="button" size="xs" loading={uploading} disabled={!file || !fileName.trim()} onClick={() => void upload()}>
              Upload and use
            </SemanticButton>
            <SemanticButton
              action="library:cancel-upload"
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => {
                clearFile();
                setPanel(null);
              }}
            >
              Cancel
            </SemanticButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
