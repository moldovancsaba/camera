import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { preconnect, preinit } from "react-dom";
// WHAT: the official GDS stylesheet. It imports both Mantine sheets itself and
//     defines every --gds-* token; it must stay before globals.css.
import '@sovereignsquad/gds-theme/styles.css';
import "./globals.css";
import Providers from './providers';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  await headers().catch(() => null);
  return {
    title: "Camera",
    description:
      "Capture and share photos at your events with branded frames and flows.",
    applicationName: "Camera",
  };
}

// WHAT: loads Inter, the only font the GDS theme renders.
// WHY: @sovereignsquad/gds-theme/styles.css declares Inter with a CSS @import
//     placed after the Mantine sheets it inlines. Turbopack keeps that import
//     mid-file (build warning "@import rules must precede all rules") and
//     browsers ignore a late @import, so the font silently never loads (see
//     LEARNINGS.md FRONT-009). React's resource hints emit the same head links
//     as a JSX <link> without tripping @next/next/no-page-custom-font, which
//     targets the Pages Router. Remove when GDS ships the import first or as a
//     documented link (general-design-system#791).
const INTER_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  preconnect("https://fonts.googleapis.com");
  preconnect("https://fonts.gstatic.com", { crossOrigin: "anonymous" });
  preinit(INTER_STYLESHEET, { as: "style", precedence: "default" });
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
