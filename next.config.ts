import type { NextConfig } from "next";

process.env.BROWSERSLIST_IGNORE_OLD_DATA ??= 'true';
process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA ??= 'true';

/**
 * Next.js configuration for Camera webapp
 * 
 * Key configurations:
 * - Image hosts: Camera's Vercel Blob store and the public logo bucket on Cloudflare R2. ImgBB is backup-only.
 * - Security headers (HSTS, CSP, X-Frame-Options)
 * - Performance optimizations (compression, caching)
 * - TypeScript strict mode enforcement
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@sovereignsquad/gds-theme', '@sovereignsquad/gds-core', '@sovereignsquad/gds-admin'],
  // The generated default frame is drawn on the server (lib/frame/render.ts) with a native canvas package, which
  // must be loaded by Node instead of bundled, and the bundled fonts must travel with the routes that render
  // (docs/DEFAULT_FRAME_PLAN.md, camera#235).
  serverExternalPackages: ['@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/admin/events/*/frame-design': ['./assets/frame-fonts/*'],
    '/api/admin/events/*/frame-design/refresh': ['./assets/frame-fonts/*'],
    '/api/internal/messmass/events': ['./assets/frame-fonts/*'],
  },
  // WHAT: The exact remote hosts /_next/image may fetch and transform, nothing else.
  // WHY: '*.public.blob.vercel-storage.com' matched every Vercel customer's
  //   Blob store, so an arbitrary store could use Camera's domain (and the team's
  //   billed optimizer quota) as an image proxy (SEC-05). ImgBB is a backup
  //   provider and must never be used as a production/browser image source.
  //   Legacy ImgBB-only assets must be copied to a serving provider before use.
  //   - bidx0njghn1voknt.public.blob.vercel-storage.com: the only Blob store
  //     camera writes to (lib/imgbb/upload.ts put()); every Blob URL on record.
  //   ImgBB domains are intentionally absent: their stored URLs are backup data,
  //   not production image sources.
  //   Every next/image call site currently passes `unoptimized`, so this list
  //   does not affect rendering; it only bounds what the optimizer endpoint
  //   will proxy. If the Blob store is ever replaced, add the new store's
  //   hostname here (it is the host of any freshly uploaded image URL).
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'bidx0njghn1voknt.public.blob.vercel-storage.com',
        pathname: '/**',
      },
      // The logo bucket on Cloudflare R2 (messmass-logos): partner and event logos only (lib/imgbb/url.ts LOGO_STORAGE_HOST).
      {
        protocol: 'https',
        hostname: 'pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev',
        pathname: '/logos/**',
      },
    ],
  },

  // TypeScript configuration
  typescript: {
    // Enforce strict type checking during build
    ignoreBuildErrors: false,
  },

  // The try-on pages are gone (issue 557, docs/TRYON_REMOVED.md). The old vetting address stays alive because it was also the page of the
  // cross-event photo vetting: the dashboard used to link to it and so does the messmass event page (`/admin/tryon/vetting?eventId=<event uuid>`).
  // Next passes the query string on, and /admin/vetting sends an `eventId` on to that event's own Vetting tab.
  async redirects() {
    return [
      { source: '/admin/tryon/vetting', destination: '/admin/vetting', permanent: false },
      { source: '/admin/tryon-results', destination: '/admin/vetting', permanent: false },
      // The all-events Analytics page (issue 521) lived at the address of the try-on report it replaced.
      { source: '/admin/tryon/analytics', destination: '/admin/analytics', permanent: false },
    ];
  },

  // Security and Performance headers
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: [
          // DNS prefetching
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          // HSTS - Force HTTPS for 2 years
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          // Prevent clickjacking
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          // Prevent MIME sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          // Control referrer information
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          // XSS Protection (legacy browsers)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          // Permissions Policy (formerly Feature-Policy)
          {
            key: 'Permissions-Policy',
            value:
              'camera=(self), microphone=(self), geolocation=(), interest-cohort=()',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires unsafe-inline/eval
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Tailwind requires unsafe-inline, Google Fonts for Material Icons
              "img-src 'self' data: https://*.public.blob.vercel-storage.com https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev blob:",
              "font-src 'self' data: https://fonts.gstatic.com https://messmass.com https://www.messmass.com", // Google Fonts CDN for Material Icons and the event theme; messmass for the custom fonts of event themes (camera#285)
              "connect-src 'self' https://sso.doneisbetter.com https://*.public.blob.vercel-storage.com https://vercel.com/api/blob/", // vercel.com/api/blob/: direct browser upload of the full-frame original (camera#210)
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self' https://sso.doneisbetter.com",
            ].join('; ')
          },
        ],
      },
      {
        // Cache static assets (images, fonts, etc.)
        source: '/(.*)\\.(ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          },
        ],
      },
      {
        // Cache API responses (shorter duration)
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate' // Don't cache API responses by default
          },
        ],
      },
    ];
  },
};

export default nextConfig;
