/**
 * The frames an event's gallery can put on an uploaded photo (camera#488, owner report 207: "we need the option to add the frames to it so they will look identical as the
 * generated images"). It follows what the guests get (lib/frame/capture.ts `captureFrameOf`): an event with a frame of its own (a complete frame, switched on) uses those;
 * otherwise the generated frame, one image for each message (and design). A photo gets one of them at random, never the same for every photo, as at a shutter press.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { captureFrameOf, isOwnActiveFrame, type RecordedFrameVariant } from '@/lib/frame/capture';
import { composeUploadWithFrame } from '@/lib/photo-vetting/compose';

export interface GalleryFrame {
  imageUrl: string;
  frameId: string | null;
  frameName: string | null;
  /** Set for a generated image: which message (and design) it carries, recorded on the submission as for a guest photo. */
  variant: RecordedFrameVariant | null;
}

interface FrameRow {
  frameId?: string;
  name?: string;
  imageUrl?: string;
  hasMessageArea?: boolean;
}

export async function loadGalleryFrames(db: Db, event: Document): Promise<GalleryFrame[]> {
  const assigned = Array.isArray(event.frames) ? (event.frames as Array<{ frameId?: string; isActive?: boolean }>).filter((row) => row.isActive && typeof row.frameId === 'string') : [];
  const docs = assigned.length > 0 ? ((await db.collection(COLLECTIONS.FRAMES).find({ frameId: { $in: assigned.map((row) => row.frameId as string) } }).toArray()) as FrameRow[]) : [];
  const rows = assigned.map((row) => ({ ...row, frameDetails: docs.find((doc) => doc.frameId === row.frameId) ?? null }));
  const own = rows
    .filter((row) => isOwnActiveFrame({ isActive: row.isActive, frameDetails: row.frameDetails }) && row.frameDetails?.imageUrl)
    .map((row): GalleryFrame => ({ imageUrl: row.frameDetails!.imageUrl as string, frameId: row.frameId as string, frameName: row.frameDetails!.name ?? null, variant: null }));
  if (own.length > 0) return own;
  const generated = captureFrameOf({ frames: rows, frameDesign: event.frameDesign as Parameters<typeof captureFrameOf>[0]['frameDesign'] });
  return (generated?.variants ?? []).map((variant): GalleryFrame => ({
    imageUrl: variant.imageUrl,
    frameId: variant.frameId,
    frameName: null,
    variant: { index: variant.index, message: variant.message, imageUrl: variant.imageUrl },
  }));
}

/** One of the frames at random, or null when there is none. */
export function pickGalleryFrame(frames: readonly GalleryFrame[], random: () => number = Math.random): GalleryFrame | null {
  return frames.length === 0 ? null : frames[Math.min(frames.length - 1, Math.floor(random() * frames.length))];
}

export interface FramedUpload {
  imageUrl: string;
  deleteUrl: string;
  imageId: string;
  fileSize: number;
  mimeType: string;
  width: number;
  height: number;
}

export interface GalleryFrameDeps {
  fetchImage: (url: string) => Promise<Buffer>;
  upload: (base64: string, name: string) => Promise<{ imageUrl: string; deleteUrl: string; imageId: string; fileSize: number; mimeType: string }>;
}

/** Puts the frame on the photo and stores the result. Throws when the frame cannot be fetched or the picture composed or stored (the caller keeps the unframed photo then). */
export async function frameGalleryPhoto(photo: Buffer, frame: GalleryFrame, name: string, deps: GalleryFrameDeps): Promise<FramedUpload> {
  const composed = await composeUploadWithFrame(photo, await deps.fetchImage(frame.imageUrl));
  const stored = await deps.upload(composed.buffer.toString('base64'), name);
  return { ...stored, width: composed.width, height: composed.height };
}
