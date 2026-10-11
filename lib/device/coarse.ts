/**
 * The coarse description of a device that camera keeps with a photo (issue 521, phase 2; owner decision 243, 2026-10-10): **a device class and a browser family, nothing finer.** The full user
 * agent string (a model, an operating system version, a build number, close to a fingerprint) and the IP address used to be stored with every photo and were read by nothing but the Devices figure of
 * the Analytics view. New photos store only what this file returns; the Devices figure reads the stored class and, for the older photos, classifies the stored string at read time
 * (lib/analytics/facts.ts), so it keeps working and nothing stored is rewritten or deleted.
 *
 * The user agent is looked at once, in the request, and is not kept. Pure and DOM-free; unit-tested in coarse.test.ts.
 */

export type DeviceClass = 'ios' | 'android' | 'desktop' | 'unknown';

/** The browser family, from the user agent: never a version. `in-app` is a browser inside another app (Facebook, Instagram, TikTok, ...), which behaves differently from the browser it is built on. */
export type BrowserFamily = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'opera' | 'in-app' | 'other' | 'unknown';

export interface CoarseDevice {
  deviceClass: DeviceClass;
  browserFamily: BrowserFamily;
}

/** What kind of device a user agent is, from the user agent alone. An iPad that asks for the desktop site looks like a Mac and counts as a desktop: a limit of the user agent, not of the count. */
export function deviceClassOf(userAgent: unknown): DeviceClass {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (!ua) return 'unknown';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/windows nt|macintosh|x11|cros|linux/i.test(ua)) return 'desktop';
  return 'unknown';
}

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Snapchat|MicroMessenger|Line\/|Pinterest|LinkedInApp|Twitter for|GSA\/|; wv\)/i;

/** The browser family of a user agent; `unknown` for a missing one. Order matters: Edge, Opera and Samsung Internet also say "Chrome"; Chrome also says "Safari". */
export function browserFamilyOf(userAgent: unknown): BrowserFamily {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (!ua) return 'unknown';
  if (IN_APP.test(ua)) return 'in-app';
  if (/Edg\/|EdgA\/|EdgiOS\//.test(ua)) return 'edge';
  if (/OPR\/|Opera|OPiOS\//.test(ua)) return 'opera';
  if (/SamsungBrowser\//.test(ua)) return 'samsung';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'firefox';
  if (/Chrome\/|CriOS\/|Chromium\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'safari';
  return 'other';
}

export function coarseDeviceOf(userAgent: unknown): CoarseDevice {
  return { deviceClass: deviceClassOf(userAgent), browserFamily: browserFamilyOf(userAgent) };
}

/** The `Submission.metadata` fields for a new photo (lib/db/schemas.ts): the legacy device type from the class, the class and the family. Never the user agent, never an address. */
export function deviceMetadataOf(userAgent: unknown): { deviceType: 'mobile_ios' | 'mobile_android' | 'desktop' | 'unknown'; deviceClass: DeviceClass; browserFamily: BrowserFamily } {
  const { deviceClass, browserFamily } = coarseDeviceOf(userAgent);
  const deviceType = deviceClass === 'ios' ? 'mobile_ios' : deviceClass === 'android' ? 'mobile_android' : deviceClass === 'desktop' ? 'desktop' : 'unknown';
  return { deviceType, deviceClass, browserFamily };
}

/** A stored class, if it is one of the four; anything else is not a class. */
export function storedDeviceClass(value: unknown): DeviceClass | null {
  return value === 'ios' || value === 'android' || value === 'desktop' || value === 'unknown' ? value : null;
}
