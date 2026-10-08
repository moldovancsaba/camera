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

## The partner's logo as a library item (camera#367)

Importing a partner's logo from messmass (the button on `/admin/partners/<id>/logos`, `docs/LIBRARIES.md`) stores a document in camera's `logos` collection that belongs to
the partner (`scope: 'partner'`, `source: 'messmass'`); its `imageUrl`, `thumbnailUrl` and `sourceUrl` are the bucket address of `Partner.logoUrl`. Camera still writes no file
to the bucket and makes no copy elsewhere: a file there never changes (it is named by its hash), so the address stays good. Before storing, camera downloads the file once with
the same checks as the frame logo (`lib/frame/logo.ts`: https, this host, no redirect, 8 seconds, 5 MB, an image) and reads its size with sharp. A move of the bucket (below)
must also rewrite those three fields of the imported logos, as it rewrote the logo library.

## Limits and what to do about them

- `r2.dev` addresses are meant for light public traffic and Cloudflare may rate-limit them; the files are immutable and long-cached, so a
  browser asks once. If the traffic ever makes that a problem, put the bucket behind a custom domain (needs a DNS zone in the Cloudflare
  account) and change `LOGO_STORAGE_HOST` and the base URL; the move script is keyed by file hash, so the stored links can be rewritten.
- The token used so far can read and write every bucket of the account. Replace it with an R2 token limited to "Object Read & Write" on
  `messmass-logos` (Cloudflare dashboard, R2, Manage API tokens) and put that value in `MESSMASS_R2_API_TOKEN`.
- Logos only: report images and fan selfies of messmass events, the try-on garments and the frame images are not moved (they are on imgbb or
  Blob as before).

## The move of 2026-10-07 (camera#305)

160 distinct logo links (351 references: messmass partners 144, camera partners 192, camera events 2, the logo library 12, one landing page)
were downloaded, checked as real images, stored in the bucket under their hash, verified through the public address (hash, size and cache
header, 159 of 159) and replaced in both databases. The one dead link (OTP Bank - PICK Szeged: imgbb answered 404 with its "image not found"
picture) was replaced by the badge the partner has from TheSportsDB (`sportsDb.strBadge`), after a person looked at it. Camera then took a
new snapshot of every event, so the guest pages and the frame images use the new links.

The records of the move (every old link and the document that held it, the new links) and a script that puts every link back are kept in
`/Users/Shared/Projects/logo-migration-2026-10-07/` on the machine that ran it. The files stay in the bucket either way.

To do the same again (a new batch of links, or a new address): collect the distinct links of messmass partners and camera partners, events,
logo library and landing pages, store each file with `storeLogo` (messmass `lib/logoStorage.ts`), check each through its public address, then
replace the old link by the new one with `updateMany` per field, writing the rollback file first.
