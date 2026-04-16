/**
 * FunFitFan (FFF) segment: served at URL `/fff` and exposed as `/` on FFF hostnames (see middleware).
 */

import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'FunFitFan — FFF',
  description: 'Fitness and health: lessons, workouts, and gym check-ins.',
  applicationName: 'FunFitFan',
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
