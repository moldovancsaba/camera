import type { NextConfig } from "next";

/**
 * Next.js configuration for Camera webapp
 * 
 * Key configurations:
 * - Image domains for imgbb.com CDN
 * - Security headers (HSTS, CSP, X-Frame-Options)
 * - Performance optimizations (compression, caching)
 * - TypeScript strict mode enforcement
 */
const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/gym', destination: '/workout', permanent: true },
      { source: '/gym/:path*', destination: '/workout/:path*', permanent: true },
      { source: '/workout/lesson/:lessonId', destination: '/workout/training/:lessonId', permanent: true },
    ];
  },

  // Image configuration for imgbb.com CDN
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ibb.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'imgbb.com',
        pathname: '/**',
      },
    ],
  },

  // TypeScript configuration
  typescript: {
    // Enforce strict type checking during build
    ignoreBuildErrors: false,
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
              "img-src 'self' data: https://i.ibb.co https://imgbb.com blob:",
              "font-src 'self' data: https://fonts.gstatic.com", // Google Fonts CDN for Material Icons
              "connect-src 'self' https://sso.doneisbetter.com https://api.imgbb.com",
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
