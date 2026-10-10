/**
 * What a kind of library item needs to be uploaded (camera#361): which files it accepts and the document it stores. `createLibraryItem` (../upload.ts) does
 * the checks every kind shares (a name, a file of an accepted type), stores the file and inserts the document; a kind adds one file here and one line in the registry.
 */

import type { Document } from 'mongodb';
import type { LibraryKind } from '../kinds';

/** What the file store answered for the uploaded file. */
export interface StoredFile {
  imageUrl: string;
  thumbnailUrl: string;
  deleteUrl: string;
  imageId: string;
  fileSize: number | null;
  mimeType: string;
}

/** The fields of an upload every kind has, already checked, and who owns the item (`scope`, `partnerId`, `eventId`). */
export interface UploadFields {
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  createdBy: string;
  now: string;
  owner: Record<string, string>;
  /** What the item is for (`lib/library/sample-selfie.ts`); only images carry tags. */
  tags?: string[];
}

export interface Uploader {
  kind: LibraryKind;
  /** The accepted MIME types, and the same in words for the messages. */
  fileTypes: readonly string[];
  fileTypeWords: string;
  /** The largest file accepted, in bytes; no limit when left out. */
  maxBytes?: number;
  /** The prefix of the stored file's name. */
  storeName: string;
  /** The document to insert for the stored file. */
  document(stored: StoredFile, fields: UploadFields, file: File): Document | Promise<Document>;
}
