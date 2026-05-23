import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import '@mantine/core/styles.css';
import '@mantine/modals/styles.css';
import '@mantine/notifications/styles.css';
import "./globals.css";
import CameraGdsProvider, { CameraColorSchemeScript } from '@/components/gds/CameraGdsProvider';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  await headers().catch(() => null);
  return {
    title: "Camera",
    description:
      "Capture and share photos at your events with branded frames and flows.",
    applicationName: "Camera",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <CameraColorSchemeScript />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <CameraGdsProvider>{children}</CameraGdsProvider>
      </body>
    </html>
  );
}
