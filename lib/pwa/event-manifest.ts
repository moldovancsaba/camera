/**
 * The web app manifest of one event's capture flow (camera#222). Each event is its own installable
 * app: `start_url` and `scope` are the event's capture page, so a home-screen icon opens that event
 * (a single manifest for the origin would start at `/`, which sends a guest to the SSO login).
 * The shape is the GDS one (`GdsWebAppManifest`), but the object is built here instead of calling
 * `getGdsWebAppManifest`: the `@sovereignsquad/gds-theme/server` entry calls `mergeThemeOverrides` from
 * `@mantine/core` when it loads, and Next's server bundling treats that as a client function, so a
 * route handler or layout importing it fails the production build ("Attempted to call
 * mergeThemeOverrides() from the server"). event-manifest.test.ts compares the output with the real
 * generator, so the two cannot drift apart. Pure, so it is unit-tested.
 */

import type { GdsWebAppManifest } from '@sovereignsquad/gds-theme/server';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_PWA_BACKGROUND_COLOR } from '@/lib/gds/tokens/colors';

/** Generated from app/icon.png; the maskable one is the same logo inside the 80% safe zone on its own colour. */
export const PWA_ICONS = [
  { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SHORT_NAME_MAX = 12;

export function pwaThemeColor(brandColor: unknown): string {
  return typeof brandColor === 'string' && HEX_COLOR.test(brandColor.trim())
    ? brandColor.trim()
    : CAMERA_DEFAULT_BRAND_COLOR;
}

/** The home screen label: the name cut to what the launcher shows. */
export function pwaShortName(name: string): string {
  return name.slice(0, SHORT_NAME_MAX).trim();
}

/** The colour of the browser's toolbar and of the installed app's splash screen: the page colour of the event's theme (camera#285), else the brand colour. */
export function pwaPageColor(theme: { background: string } | null | undefined, brandColor: unknown): string {
  return theme && HEX_COLOR.test(theme.background) ? theme.background : pwaThemeColor(brandColor);
}

export function eventManifest(event: Record<string, unknown>, eventId: string, theme?: { background: string } | null): GdsWebAppManifest {
  const name = typeof event.name === 'string' && event.name.trim() ? event.name.trim() : 'Camera';
  const path = `/capture/${eventId}`;
  return {
    name,
    short_name: pwaShortName(name),
    theme_color: pwaPageColor(theme, event.brandColor),
    background_color: theme && HEX_COLOR.test(theme.background) ? theme.background : CAMERA_PWA_BACKGROUND_COLOR,
    display: 'standalone',
    // Both orientations on every device: the capture flow is laid out for portrait and landscape.
    orientation: 'any',
    start_url: `${path}?source=pwa`,
    scope: path,
    id: path,
    icons: PWA_ICONS,
  };
}
