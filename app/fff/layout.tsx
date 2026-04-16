/**
 * FunFitFan (FFF) App Router segment (`app/fff/*`). On FFF hostnames, middleware serves public paths
 * like `/`, `/login`, `/log` without `/fff` in the browser (see `lib/funfitfan/fff-browser-urls.ts`).
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
  return <div className="fff-app-shell">{children}</div>;
}
