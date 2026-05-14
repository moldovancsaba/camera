'use client';

/**
 * Admin-only: upload files into the event gallery (creates submissions via API).
 * Supports drag/drop, multi-file batches, folder import, and client-side resize/compression.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Add photos to this event
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Drag and drop images, upload multiple files at once, or import a folder. Large files
              are resized/compressed in the browser to fit the current Vercel upload path.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Supported: {ACCEPT_COPY}. Target upload size per file: under {formatBytes(MAX_DIRECT_UPLOAD_BYTES)}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onFileInputChange}
            />
            <input
              ref={folderInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFolderInputChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Upload images
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="px-4 py-2 bg-slate-700 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors"
            >
              Upload folder
            </button>
            {queueItems.length > 0 ? (
              <button
                type="button"
                onClick={clearFinished}
                className="px-4 py-2 bg-white text-slate-700 text-sm font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 dark:bg-transparent dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-800/50 transition-colors"
              >
                Clear finished
              </button>
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
          className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            dragActive
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
              : 'border-gray-300 dark:border-gray-600 bg-white/70 dark:bg-black/10'
          }`}
        >
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Drop images here
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Files and folders are accepted. Uploads run in a controlled queue of {MAX_PARALLEL_UPLOADS}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600 dark:text-gray-300">
          <span>{busy ? `${pendingCount} in progress` : 'Queue idle'}</span>
          <span>{completedCount} completed</span>
          <span>{failedCount} failed</span>
        </div>

        {summaryMessage ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">{summaryMessage}</p>
        ) : null}

        {queueItems.length > 0 ? (
          <div className="max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950">
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {queueItems.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {item.sourceLabel}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Original: {formatBytes(item.file.size)}
                        {item.finalSizeBytes != null ? ` · Upload: ${formatBytes(item.finalSizeBytes)}` : ''}
                      </p>
                      {item.message ? (
                        <p
                          className={`text-xs mt-1 ${
                            item.status === 'error'
                              ? 'text-red-600 dark:text-red-400'
                              : item.status === 'done'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {item.message}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                        item.status === 'done'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : item.status === 'error'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                            : item.status === 'uploading'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              : item.status === 'preparing'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
