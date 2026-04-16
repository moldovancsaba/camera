import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { isFffHost } from "@/lib/site-hosts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  try {
    const host = (await headers()).get("host");
    if (isFffHost(host)) {
      return {
        title: { absolute: "FunFitFan" },
        description:
          "FunFitFan (FFF): log activities and selfies, build your reel — fitness and health on the web.",
        applicationName: "FunFitFan",
      };
    }
  } catch {
    /* headers() unavailable in some prerender contexts */
  }
  return {
    title: "FunFitFan",
    description:
      "FunFitFan: log activities and selfies, build your reel — fitness and health on the web.",
    applicationName: "FunFitFan",
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
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
