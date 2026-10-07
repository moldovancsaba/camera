# Logo storage (Cloudflare R2)

Partner and event logos live in one public bucket on Cloudflare R2, `messmass-logos`, not on imgbb. imgbb is a free upload site: a link can
answer slowly, time out, or turn into its "image not found" picture (the OTP Bank - PICK Szeged logo did, on 2026-10-07), and the guest pages
then show a broken logo.

## Where things are

- **Bucket:** `messmass-logos` in the Cloudflare account that holds the other R2 buckets (image.direct has its own, `image-direct-assets`; a
  bucket is never shared between products).
- **Public address:** `https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/<sha256>.<ext>` (Cloudflare's managed `r2.dev` address; the
  account has no DNS zone, so there is no custom domain). The key is the SHA-256 of the file, so a file is stored once, a link never changes
  its content, and the objects are served with `Cache-Control: public, max-age=31536000, immutable`. The bucket answers `GET` and `HEAD` from
  any origin (CORS).
- **Who writes:** messmass, the master of the partners (`lib/logoStorage.ts`, the partner badge upload); credentials are the project-prefixed
  `MESSMASS_R2_*` variables. Camera only reads: it needs no credentials, only to accept the host.
- **Who accepts the host in camera:** `LOGO_STORAGE_HOST` in `lib/imgbb/url.ts` is the single name of the address; the theme
  (`lib/theme/event-theme.ts`, `allowedImage`), the frame logo fetch (`lib/frame/logo.ts`, `isAllowedLogoUrl`), `next.config.ts`
  (`images.remotePatterns`, limited to `/logos/**`, and the CSP `img-src`) use it. Only this exact host is accepted, not `*.r2.dev`.

## Limits and what to do about them

- `r2.dev` addresses are meant for light public traffic and Cloudflare may rate-limit them; the files are immutable and long-cached, so a
  browser asks once. If the traffic ever makes that a problem, put the bucket behind a custom domain (needs a DNS zone in the Cloudflare
  account) and change `LOGO_STORAGE_HOST` and the base URL; the move script is keyed by file hash, so the stored links can be rewritten.
- The token used so far can read and write every bucket of the account. Replace it with an R2 token limited to "Object Read & Write" on
  `messmass-logos` (Cloudflare dashboard, R2, Manage API tokens) and put that value in `MESSMASS_R2_API_TOKEN`.
- Logos only: report images and fan selfies of messmass events, the try-on garments and the frame images are not moved (they are on imgbb or
  Blob as before).

## Moving the existing logos

The move reads every logo link of the messmass partners and of camera (partners, events, the logo library, landing pages), downloads each
distinct file, stores it in the bucket under its hash, and replaces the old link in both databases, keeping the old-to-new table (the way
back). A logo whose old link no longer answers is replaced by the badge the partner has from TheSportsDB (`sportsDb`), after a person has
looked at it. See the release notes for the day it ran and its numbers.
