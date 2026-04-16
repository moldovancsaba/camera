/**
 * FunFitFan (FFF) segment: served at URL `/fff` and exposed as `/` on FFF hostnames (see middleware).
 */

import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'FunFitFan' },
  description: 'FFF (FunFitFan): activities, gym, and your personal reel.',
  applicationName: 'FunFitFan',
  manifest: '/fff/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'FunFitFan',
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
