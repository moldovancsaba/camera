'use client';

/**
 * Admin-only: upload files into the event gallery (creates submissions via API).
 * Supports drag/drop, multi-file batches, folder import, and client-side resize/compression.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InlineAlert, LabelTag, SemanticButton } from '@doneisbetter/gds-core/client';

interface Props {
  eventMongoId: string;
  onUploaded: (submission: Record<string, unknown>) => void;
}

type UploadStatus = 'queued' | 'preparing' | 'uploading' | 'done' | 'error';

interface UploadQueueItem {
  id: string;
  file: File;
  status: UploadStatus;
  sourceLabel: string;
  message: string | null;
  finalSizeBytes: number | null;
}

interface PreparedUpload {
  file: File;
  width: number;
  height: number;
  transformed: boolean;
}

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

const MAX_DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_PARALLEL_UPLOADS = 2;
const MAX_RENDER_DIMENSION = 2560;
const ACCEPT_COPY = 'JPEG, PNG, GIF, WebP';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function normalizedImageExtension(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

function replaceExtension(fileName: string, ext: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return `${base}.${ext}`;
}

function hasAnimatedGifRisk(file: File): boolean {
  return file.type === 'image/gif';
}

async function probeImageSize(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close();
    return { width, height };
  } catch {
    return { width: 0, height: 0 };
  }
}

function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to encode image'));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

async function compressImageForUpload(file: File): Promise<PreparedUpload> {
  const bitmap = await loadBitmap(file);
  try {
    const width = bitmap.width;
    const height = bitmap.height;

    if (width <= 0 || height <= 0) {
      throw new Error('Invalid image dimensions');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not supported');
    }

    let scale = Math.min(1, MAX_RENDER_DIMENSION / Math.max(width, height));
    let quality = 0.9;

    for (let attempt = 0; attempt < 8; attempt++) {
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

      let blob = await canvasToBlob(canvas, 'image/webp', quality);
      let outputType = 'image/webp';

      if (blob.size > MAX_DIRECT_UPLOAD_BYTES) {
        const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
        if (jpegBlob.size < blob.size) {
          blob = jpegBlob;
          outputType = 'image/jpeg';
        }
      }

      if (blob.size <= MAX_DIRECT_UPLOAD_BYTES) {
        return {
          file: new File([blob], replaceExtension(file.name, normalizedImageExtension(outputType)), {
            type: outputType,
            lastModified: file.lastModified,
          }),
          width: targetWidth,
          height: targetHeight,
          transformed: true,
        };
      }

      if (quality > 0.6) {
        quality = Math.max(0.55, quality - 0.1);
      } else {
        scale *= 0.82;
      }
    }

    throw new Error(
      `Image stays above ${formatBytes(MAX_DIRECT_UPLOAD_BYTES)} after compression`
    );
  } finally {
    bitmap.close();
  }
}

async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files can be uploaded');
  }

  const { width, height } = await probeImageSize(file);

  if (file.size <= MAX_DIRECT_UPLOAD_BYTES) {
    return {
      file,
      width,
      height,
      transformed: false,
    };
  }

  if (hasAnimatedGifRisk(file)) {
    throw new Error(
      `GIF is larger than ${formatBytes(MAX_DIRECT_UPLOAD_BYTES)} and cannot be reduced safely`
    );
  }

  return compressImageForUpload(file);
}

function makeQueueItems(files: File[]): UploadQueueItem[] {
  const now = Date.now();
  return files.map((file, index) => {
    const sourceLabel = file.webkitRelativePath || file.name;
    return {
      id: `${now}-${index}-${sourceLabel}-${file.size}`,
      file,
      status: 'queued',
      sourceLabel,
      message: null,
      finalSizeBytes: null,
    };
  });
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name);
}

function updateItem(
  items: UploadQueueItem[],
  id: string,
  patch: Partial<UploadQueueItem>
): UploadQueueItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const unique: File[] = [];
  for (const file of files) {
    const key = `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }
  return unique;
}

async function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readDirectoryEntries(
  directory: FileSystemDirectoryEntry
): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const all: FileSystemEntry[] = [];

  while (true) {
    const chunk = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (chunk.length === 0) break;
    all.push(...chunk);
  }

  return all;
}

async function collectFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [await readFileEntry(entry as FileSystemFileEntry)];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const childEntries = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
  const nested = await Promise.all(childEntries.map((child) => collectFilesFromEntry(child)));
  return nested.flat();
}

async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const itemEntries = Array.from(dataTransfer.items || [])
    .map((item) => (item as DataTransferItemWithEntry).webkitGetAsEntry?.() || null)
    .filter((entry): entry is FileSystemEntry => entry != null);

  if (itemEntries.length > 0) {
    const nested = await Promise.all(itemEntries.map((entry) => collectFilesFromEntry(entry)));
    return nested.flat();
  }

  return Array.from(dataTransfer.files || []);
}

export default function EventGalleryUpload({
  eventMongoId,
  onUploaded,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const activeUploadsRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [queueItems, setQueueItems] = useState<UploadQueueItem[]>([]);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);

  useEffect(() => {
    const folderInput = folderInputRef.current;
    if (!folderInput) return;
    folderInput.setAttribute('webkitdirectory', '');
    folderInput.setAttribute('directory', '');
    folderInput.multiple = true;
  }, []);

  const pendingCount = useMemo(
    () =>
      queueItems.filter(
        (item) =>
          item.status === 'queued' ||
          item.status === 'preparing' ||
          item.status === 'uploading'
      ).length,
    [queueItems]
  );

  const completedCount = useMemo(
    () => queueItems.filter((item) => item.status === 'done').length,
    [queueItems]
  );

  const failedCount = useMemo(
    () => queueItems.filter((item) => item.status === 'error').length,
    [queueItems]
  );

  const enqueueFiles = useCallback((incomingFiles: File[], source: 'files' | 'folder' | 'drop') => {
    const imageFiles = dedupeFiles(incomingFiles).filter(isImageFile);
    if (imageFiles.length === 0) {
      setSummaryMessage(
        source === 'folder'
          ? 'No supported images found in the selected folder'
          : 'No supported image files found'
      );
      return;
    }

    setQueueItems((prev) => [...makeQueueItems(imageFiles), ...prev]);
    setSummaryMessage(
      `${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'} added to upload queue`
    );
  }, []);

  const uploadSingleItem = useCallback(
    async (item: UploadQueueItem) => {
      setQueueItems((prev) =>
        updateItem(prev, item.id, {
          status: 'preparing',
          message: 'Preparing image…',
        })
      );

      try {
        const prepared = await prepareUpload(item.file);

        setQueueItems((prev) =>
          updateItem(prev, item.id, {
            status: 'uploading',
            message: prepared.transformed
              ? `Compressed to ${formatBytes(prepared.file.size)}`
              : 'Uploading original image…',
            finalSizeBytes: prepared.file.size,
          })
        );

        const formData = new FormData();
        formData.append('file', prepared.file);
        if (prepared.width > 0) formData.append('imageWidth', String(prepared.width));
        if (prepared.height > 0) formData.append('imageHeight', String(prepared.height));

        const res = await fetch(
          `/api/admin/events/${encodeURIComponent(eventMongoId)}/gallery-upload`,
          {
            method: 'POST',
            body: formData,
          }
        );

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof json.error === 'string'
              ? json.error
              : typeof json.message === 'string'
                ? json.message
                : 'Upload failed'
          );
        }

        const submission = json.data?.submission;
        if (!submission) {
          throw new Error('Invalid response');
        }

        onUploaded(submission);
        setQueueItems((prev) =>
          updateItem(prev, item.id, {
            status: 'done',
            message: prepared.transformed
              ? `Uploaded after compression (${formatBytes(prepared.file.size)})`
              : 'Uploaded',
          })
        );
      } catch (error) {
        setQueueItems((prev) =>
          updateItem(prev, item.id, {
            status: 'error',
            message: error instanceof Error ? error.message : 'Upload failed',
          })
        );
      } finally {
        activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
      }
    },
    [eventMongoId, onUploaded]
  );

  useEffect(() => {
    const queued = queueItems.filter((item) => item.status === 'queued');
    if (queued.length === 0) return;

    while (activeUploadsRef.current < MAX_PARALLEL_UPLOADS) {
      const nextItem = queued[0];
      if (!nextItem) break;
      activeUploadsRef.current += 1;
      void uploadSingleItem(nextItem);
      queued.shift();
    }
  }, [queueItems, uploadSingleItem]);

  const onFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    enqueueFiles(files, 'files');
  };

  const onFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    enqueueFiles(files, 'folder');
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const files = await filesFromDataTransfer(e.dataTransfer);
    enqueueFiles(files, 'drop');
  };

  const clearFinished = () => {
    setQueueItems((prev) =>
      prev.filter(
        (item) =>
          item.status === 'queued' ||
          item.status === 'preparing' ||
          item.status === 'uploading'
      )
    );
  };

  const busy = pendingCount > 0;

  return (
    <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '1rem', padding: '1rem' }}>
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <strong style={{ fontSize: '0.875rem' }}>
              Add photos to this event
            </strong>
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: 0 }}>
              Drag and drop images, upload multiple files at once, or import a folder. Large files
              are resized/compressed in the browser to fit the current Vercel upload path.
            </p>
            <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: 0 }}>
              Supported: {ACCEPT_COPY}. Target upload size per file: under {formatBytes(MAX_DIRECT_UPLOAD_BYTES)}.
            </p>
          </div>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={onFileInputChange}
            />
            <input
              ref={folderInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onFolderInputChange}
            />
            <SemanticButton
              action="event-gallery:upload-images"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload images
            </SemanticButton>
            <SemanticButton
              action="event-gallery:upload-folder"
              type="button"
              onClick={() => folderInputRef.current?.click()}
              variant="secondary"
            >
              Upload folder
            </SemanticButton>
            {queueItems.length > 0 ? (
              <SemanticButton
                action="event-gallery:clear-finished"
                type="button"
                onClick={clearFinished}
                variant="secondary"
              >
                Clear finished
              </SemanticButton>
            ) : null}
          </div>
        </div>

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragActive) setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (e.currentTarget === e.target) {
              setDragActive(false);
            }
          }}
          onDrop={onDrop}
          data-active={dragActive || undefined}
          style={{
            border: '1px dashed var(--gds-color-border)',
            borderRadius: '1rem',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <strong style={{ fontSize: '0.875rem' }}>
            Drop images here
          </strong>
          <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
            Files and folders are accepted. Uploads run in a controlled queue of {MAX_PARALLEL_UPLOADS}.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <LabelTag tone={busy ? 'warning' : 'neutral'} label={busy ? `${pendingCount} in progress` : 'Queue idle'} />
          <LabelTag tone="success" label={`${completedCount} completed`} />
          <LabelTag tone={failedCount > 0 ? 'warning' : 'neutral'} label={`${failedCount} failed`} />
        </div>

        {summaryMessage ? (
          <InlineAlert title="Upload queue updated" message={summaryMessage} severity="info" />
        ) : null}

        {queueItems.length > 0 ? (
          <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', maxHeight: 288, overflowY: 'auto' }}>
            <div style={{ display: 'grid' }}>
              {queueItems.map((item) => (
                <div key={item.id} style={{ padding: '0.75rem' }}>
                  <div style={{ alignItems: 'flex-start', display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
                    <div style={{ display: 'grid', gap: '0.25rem', minWidth: 0 }}>
                      <strong style={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.sourceLabel}
                      </strong>
                      <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
                        Original: {formatBytes(item.file.size)}
                        {item.finalSizeBytes != null ? ` · Upload: ${formatBytes(item.finalSizeBytes)}` : ''}
                      </span>
                      {item.message ? (
                        <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
                          {item.message}
                        </span>
                      ) : null}
                    </div>
                    <LabelTag tone={item.status === 'error' ? 'warning' : item.status === 'done' ? 'success' : 'neutral'} label={item.status} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
