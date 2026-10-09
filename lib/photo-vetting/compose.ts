/**
 * The real picture of an approved photo (camera#267, docs/PHOTO_VETTING_PLAN.md): the guest's plain framed-size photo with the frame image the
 * photo recorded laid over it, made on the server so the branded composite only exists once someone approved the photo.
 */

import sharp from 'sharp';

export interface ComposedPhoto {
  buffer: Buffer;
  width: number;
  height: number;
  mime: 'image/jpeg';
}

const JPEG_QUALITY = 92;

/** The frame is stretched over the photo exactly as the browser canvas does (`drawImage(frame, 0, 0, width, height)`). */
export async function composePhotoWithFrame(photo: Buffer, frame: Buffer): Promise<ComposedPhoto> {
  const { width, height } = await sharp(photo, { failOn: 'none' }).metadata();
  if (!width || !height) throw new Error('The photo dimensions could not be determined');
  const frameLayer = await sharp(frame, { failOn: 'none', density: 300 }).resize({ width, height, fit: 'fill' }).png().toBuffer();
  const buffer = await sharp(photo, { failOn: 'none' }).composite([{ input: frameLayer, blend: 'over' }]).jpeg({ quality: JPEG_QUALITY }).toBuffer();
  return { buffer, width, height, mime: 'image/jpeg' };
}

/**
 * A photo an editor uploaded, put into a frame (camera#488): the photo is **cropped to fill the frame's shape** (a guest's photo is shot inside the frame, an uploaded one
 * has any shape; the crop keeps the part with the most going on, which is usually the people), then the frame image is laid over it at its own size, exactly as the guest
 * photos are composed, so the picture looks like the generated ones.
 */
export async function composeUploadWithFrame(photo: Buffer, frame: Buffer): Promise<ComposedPhoto> {
  const { width, height } = await sharp(frame, { failOn: 'none' }).metadata();
  if (!width || !height) throw new Error('The frame dimensions could not be determined');
  const base = await sharp(photo, { failOn: 'none' }).rotate().resize({ width, height, fit: 'cover', position: sharp.strategy.attention }).toBuffer();
  const frameLayer = await sharp(frame, { failOn: 'none', density: 300 }).resize({ width, height, fit: 'fill' }).png().toBuffer();
  const buffer = await sharp(base).composite([{ input: frameLayer, blend: 'over' }]).jpeg({ quality: JPEG_QUALITY }).toBuffer();
  return { buffer, width, height, mime: 'image/jpeg' };
}
