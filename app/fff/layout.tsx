/**
 * FunFitFan (FFF) segment: served at URL `/fff` and exposed as `/` on FFF hostnames (see middleware).
 */

import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'FFF — FunFitFan' },
  description: 'FFF (FunFitFan): activities, gym, and your personal reel.',
  applicationName: 'FFF',
  manifest: '/fff/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'FFF',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#059669',
};

export default function FunFitFanLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
