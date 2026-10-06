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
