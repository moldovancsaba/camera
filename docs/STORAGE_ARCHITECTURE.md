# Storage architecture: how we never lose an image

Research and recommendation of 2026-10-09 (owner question 222, issue 509). Everything marked "verified" was read in the code, in the real data (read-only) or in the vendors' own documents; what could not be verified is listed in section 11.

## 1. In one page

**The owner's requirements:** never lose an image; Vercel Blob only temporary; R2 is the trusted CDN for the "small enough" pictures (the naked crop and the composed picture); ImgBB (paid for three years, unlimited, not 100 % reliable) keeps copies, the original-size picture too if possible; no short-term fix.

**The finding that decides everything:** with today's process an image can be lost at four places: the unframed crop is deleted when a photo is approved; the ImgBB mirror is best effort, silent and unrecorded; 1,354 photos exist only on ImgBB, which already lost some; and there is no independent copy that we control.

**The recommendation, in one sentence:** make **R2 the primary store of every picture** (two buckets: a public one behind a Cloudflare custom domain for what people see, a private one for what only we may see), keep **ImgBB as a verified extra copy of the public pictures**, add **one more copy at a different provider under credentials the application does not hold** (Backblaze B2, a few dollars a month at any volume we will see), and let **Vercel Blob be only the temporary landing place** when R2 cannot be reached. Everything is recorded in one **manifest** (a collection that says, for every picture, which copies exist, their checksum and when each was last verified); copies are made by a **retrying queue**, checked by a **daily verification**, and an **"Image safety" card** shows what is protected and what is not.

**What I would not do** (and why): put naked or original photos on ImgBB (a public third-party site with terms that allow it to delete anything without notice, and a privacy cost); count ImgBB as the second copy of record; serve pictures from `r2.dev` (Cloudflare calls it development only: our logos are served from it today); change the live capture path before the 16 October match.

**What is needed from the owner** is in section 10 (a Cloudflare zone for a media domain, an R2 bucket pair and a token, a B2 account, three decisions about privacy and retention).

## 2. What exists today (verified)

| Step | What happens | Where the file lives |
|---|---|---|
| Take the photo | In the browser; the full camera frame is held in memory for the zoom step and dropped after the preview. A route to upload it exists (`/api/uploads/original`, issue 210) but no page calls it. | nowhere |
| Zoom and pan | In the browser; the result is the crop in the shape of the frame. | memory |
| Save | The browser makes a JPEG (at most 2048 px, quality 85 %) and sends it. With photo vetting on (every event) it is sent without the frame and stored as a private pending file. | Vercel Blob `pending/…`, not mirrored |
| Approval | The server puts the frame on and stores the framed picture: Blob is the required primary, ImgBB a best-effort mirror (waits at most 5 s, ignores failure, **its address is not stored**, only an id and a delete link). | Blob, and ImgBB if it worked |
| After approval | **The unframed crop is deleted.** `originalImageUrl` is set to the framed picture. | gone |
| Other writers to Blob | the screen-sized pictures, every generated frame image (1,004 now), library uploads, the default slideshow overlays, the welcome screen pictures | Blob |
| R2 | logos (bucket `messmass-logos`) and a few hand-placed campaign pictures, **served from the `r2.dev` address** | R2 |

**The data** (read-only, 2026-10-09): 1,667 submissions; **1,354 still have an i.ibb.co address as their only picture** (from before Blob became primary), 305 are on Blob, 8 are pending; since 1 October 150 new submissions, of which 128 carry an ImgBB mirror record; of the 305 photos on Blob **93 have no mirror record**. Sizes: a naked or composed picture is about 425 KB on average, a screen picture about 100 KB, a try-on result about 2 MB. Volume: 150 in October so far, 1,001 in June; the largest month so far was 1,000 photos.

**How reliable is ImgBB, measured:** all 1,354 ImgBB addresses were asked (one byte each). **8 did not answer after two retries: 7 are gone (HTTP 404, five of them on AS Roma – Lupetto Day, from November 2025), 1 timed out.** The median answer took 657 ms, the 95th percentile **9.7 seconds**, the slowest 15 s (the limit I set). A CDN answers in tens of milliseconds. So ImgBB is usable as a copy and not as the place pictures are served from, which is also what its own terms say (below).

## 3. The facts about each piece (with sources)

**Cloudflare R2** ([pricing](https://developers.cloudflare.com/r2/pricing/), [durability](https://developers.cloudflare.com/r2/reference/durability/), [limits](https://developers.cloudflare.com/r2/platform/limits/), [S3 API](https://developers.cloudflare.com/r2/api/s3/api/), [bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), [public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/)):
- Designed for **eleven nines of annual durability**, 99.9 % availability SLA; every write is **synchronous** (success is returned only after the data is on disk); data is spread over several data centres **within one geographic region**, no multi-region replication.
- **Standard** $0.015 per GB-month; **Infrequent Access** $0.01 (retrieval $0.01/GB, 30-day minimum); writes (Class A) $4.50 per million, reads (Class B) $0.36 per million; **egress free**; free tier 10 GB, 1 M writes, 10 M reads a month.
- **No object versioning, no S3 object lock, no replication** in the S3 API (listed as not implemented). **Bucket locks** exist (retention rules by prefix, fixed age or indefinite; a locked object cannot be deleted or overwritten; they override lifecycle rules).
- A **public bucket reached through a custom domain** is the production path (Cloudflare cache, WAF, access rules); **`r2.dev` is "for development only"**, rate limited (hundreds of requests per second, then 429) without the cache. **The custom domain must be a zone in the same Cloudflare account** (a domain whose nameservers are Cloudflare's, or a partial CNAME setup on a paid plan).
- Browser uploads use a **presigned PUT** (POST forms are not supported), at most 7 days valid, bucket CORS needed; a single PUT up to 5 GiB; **1 write per second to the same key** (we never overwrite, so this does not matter); object key 1,024 bytes, metadata 8 KB.
- Checksums: the S3 documentation does not list `x-amz-checksum-sha256` for PutObject; `Content-MD5` is supported. Our own sha256, kept in the manifest and in object metadata, is what we verify with.
- Change notifications: an object-created event can be sent to a Cloudflare Queue and consumed by a Worker (an option for later).

**ImgBB** ([API](https://api.imgbb.com/), [terms](https://imgbb.com/tos)):
- API: upload only; the `image` field takes a file, base64 **or an address** (so the server can tell ImgBB to fetch a picture from our CDN); **32 MB per image**; an optional expiry; the answer has `id`, `url`, `display_url`, `delete_url`. **There is no list, get, search or delete endpoint**: the only way to delete is the `delete_url`, and the only way to find a picture again is an address we stored. The Pro plan (unlimited storage, ads removed, 64 MB per file; the 3-year price of $143.64 matches what the owner has) is described by third-party reviews; I could not confirm it on ImgBB's own page.
- Terms: ImgBB may **delete any content at any time without notice and for any reason**, may **terminate an account without warning**, says "although we perform regular routine backups… you are solely responsible for all data that you transmit", and the user waives any claim over lost data; it forbids "automated use of the system" in general terms (the API is the exception it provides).

**Vercel Blob and Functions** ([Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing), [function limits](https://vercel.com/docs/functions/limitations)):
- A Function's request or response body is **at most 4.5 MB** (HTTP 413 above it). Fluid compute gives Hobby and Pro functions up to 300 s (Pro 800 s).
- Blob: $0.023 per GB-month plus operations and transfer on Pro; **on the Hobby plan the store is limited to 1 GB and, when the limit is passed, "you will not be able to access Vercel Blob"** until 30 days have passed. I could not see which plan the project is on; **the Blob store is probably between 0.6 and 1 GB now** (250 MB of photos, 36 MB of screen pictures, about 1,000 generated frames), so this is the first thing to look at in the Vercel dashboard.

**Backblaze B2** ([pricing](https://www.backblaze.com/cloud-storage/pricing)): from $6.95 per TB-month, first 10 GB free, **no minimum retention fee**, API calls free for pay-as-you-go, egress free up to three times the stored amount. S3-compatible. Object Lock is part of B2's S3-compatible API, but the pricing page does not say so; to be confirmed when the account is opened.

## 4. What "rock solid" has to mean here

1. **Durable before the user is told "saved".** The first copy is written to the store we trust, synchronously, before the answer.
2. **At least three copies, on at least two providers, and one of them reachable only with credentials the application does not hold** (the 3-2-1 rule). A bug or a leaked key in the application must not be able to destroy every copy.
3. **Immutable, content-addressed names.** A picture is never overwritten; a new version is a new key, the old one stays. Removal is a deliberate, logged act.
4. **One manifest** (the truth about every picture): which copies exist, their size and sha256, when each was last read back and found right.
5. **Copies are made by a retrying queue, not by hope.** A failed copy is retried with a back-off and is visible; nothing depends on a request surviving.
6. **A daily verification** (every copy still answers and has the right size; a sample is read in full and its sha256 compared) and **repair from a good copy**.
7. **A restore that has been practised**, with a script, not a plan.
8. **Deleting is a flow:** a person's request removes every copy, in every store, and leaves a record that it did.
9. **Public and private are different buckets.** What people see is public and cached; the naked crop and the original are never reachable by an address.
10. **Visible:** a card that says "N pictures fully protected, N with one copy only, N missing", the age of the oldest unprotected one, and an alert when a picture stays below two copies for an hour.

## 5. The recommendation

### 5.1 The classes of picture and where each lives

| Class | What it is | Primary (served) | Second copy | Third copy | Notes |
|---|---|---|---|---|---|
| **Composed** | the framed picture people see, share and the screens show | **R2 public** bucket, custom domain, cached | **ImgBB** (address stored, verified) | **B2** | already public by its nature |
| **Screen** | the lighter picture for the giant screen | R2 public | none needed (it is made again from the composed one) | B2 optional | derived: can be regenerated |
| **Naked** | the unframed crop the person chose | **R2 private** | **B2** | ImgBB only if the owner decides to (section 10) | never reachable by an address; approvers see it through a short-lived signed address |
| **Original** | the full camera frame at full size, when we start to capture it | **R2 private** (Infrequent Access after 30 days) | **B2** | ImgBB optional | 4 to 6 MB each; see 5.4 |
| **Library** | frames, logos, images editors upload | R2 public | ImgBB | B2 | one place for all of it |
| **Generated** | the images drawn for a frame | R2 public | none (drawn again from their inputs) | none | derived |
| **Temporary** | the landing place when R2 cannot be reached, and nothing else | **Vercel Blob** | – | – | emptied by the queue once R2 holds the picture |

Why this differs from the owner's list: the owner's list has the naked and composed pictures on R2 and the originals on ImgBB. I agree with R2 as the CDN and primary and with Blob as temporary. I would put the **originals on R2 as well**, because **capacity is not the problem** (section 9: 100,000 photos with originals cost about $10 a month on R2), and ImgBB's "unlimited" is therefore not worth its risk for the pictures that cannot be made again. ImgBB stays valuable as an **additional independent copy** of what is already public, checked every day and re-uploaded from R2 when it has lost something. For the private classes the second copy goes to B2: ImgBB is a public host; an "unlisted" address is still an address, and the terms give ImgBB rights over what is on it.

### 5.2 The write path (new photo)

1. The browser sends the crop (at most 4.5 MB: the JPEG of 2048 px is about 0.5 MB, so the Function limit is not a problem).
2. The server computes its **sha256**, writes it to **R2 private** under `naked/<event>/<submission>/<sha256-first-16>.jpg` with the sha256 as object metadata, **synchronously** (timeout 5 s, two retries). If R2 cannot be reached it writes to **Blob** instead (temporary) and the manifest says so; the user is never told "failed".
3. It inserts the submission and the **manifest entry** (copy: R2 ok, size, sha256, time).
4. **Approval:** the composed picture is made, written to **R2 public** (synchronously), recorded, and the copy jobs for ImgBB (the server hands ImgBB the R2 address, so no bytes pass through the Function) and B2 are queued. **The naked crop is not deleted.**
5. Everything after step 3 is idempotent and retried by the queue.

The original (5.4) follows the same pattern through a **presigned PUT straight from the browser to R2 private**, which avoids the 4.5 MB limit.

### 5.3 The copies, the queue, the verification

- **The queue** is a MongoDB collection of jobs (an "outbox"): created in the same step as the manifest entry; an immediate attempt after the response (`after()`); a **sweeper** endpoint, called every five minutes by a scheduler, takes due jobs, retries with a back-off (1 min, 5 min, 30 min, 3 h, then daily) and records every failure. The scheduler is **a Cloudflare Worker cron trigger or a GitHub Actions schedule** (both are free; [Vercel's own cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) runs at most once a day, with an hour of imprecision, on the Hobby plan, and every minute on Pro).
- **The B2 copy** is made by a **nightly `rclone copy` run from GitHub Actions** (R2 read-only token in, B2 key restricted to the backup bucket out; **copy, never sync**, so a deletion on R2 never reaches B2). The application holds no B2 credentials at all, which is what makes it independent of application mistakes.
- **Verification:** each night every manifest entry is checked (R2 `HEAD`, ImgBB a one-byte range request, B2 `HEAD`: size and existence), and a sample (about 2 % a night) is read in full and its sha256 compared. A copy found missing or wrong is **repaired from a healthy copy** (order: R2, B2, ImgBB) and the repair is logged; a picture below two verified copies for an hour raises an alert (the owner's e-mail and the push channel already used for CI).
- **Restore:** `scripts/restore-asset.ts <submission>` puts back any picture from any surviving copy; a monthly drill restores a random sample from B2 and compares hashes.

### 5.4 The original-size picture

It is the only picture that cannot be made again, and today it is never kept. Two product questions decide how: **when** it is sent (a phone on a stadium network sending 5 MB in parallel with the crop makes "save" slower and less reliable; I recommend sending it **in the background after the person has pressed Save**, with the page kept awake, and treating a missing original as "not received", not as an error) and **whether to upload the photo of a person who then abandons the flow** (a privacy question: I recommend uploading it only after the person pressed Save, i.e. consent was given for this photo). Stored on R2 private, second copy on B2.

### 5.5 Serving and the domain

R2 custom domains need the domain's DNS zone in the Cloudflare account. **messmass.com and doneisbetter.com are on Vercel DNS and seyuselfies.com is at GoDaddy**, so none can be attached without moving its nameservers. **Recommendation: register one dedicated media domain** (about $10 a year; a name that carries no app, so it can be cached and served without cookies) and put it on Cloudflare; the public bucket gets `img.<media-domain>`. Objects are written with `Cache-Control: public, max-age=31536000, immutable` (the names never change), so the CDN never needs purging. The logos now served from `r2.dev` move to the same bucket and domain.

Allow-lists to update when this is built: `next.config.ts` (image `remotePatterns` and the Content-Security-Policy), `lib/imgbb/url.ts`, `lib/frame/logo.ts` (`isAllowedLogoUrl`), `lib/theme/event-theme.ts` (`allowedImage`), and the places that accept "our own storage" (`blobStoreHostFromToken`).

### 5.6 Deleting, retention, privacy

- **Retention is a decision, not a default** (section 10): how long naked crops and originals are kept after an event, and what a person can ask for.
- **Deleting a submission** (`lib/submissions/delete-files.ts`) deletes in every store: R2 (both buckets), ImgBB through the stored `delete_url`, Blob staging, and writes a **tombstone** in the manifest (what, when, by whom). B2 holds a nightly copy, so it is removed through a **lifecycle rule (hide, then delete after 30 days)**, which is how the "right to erasure within a month" can be honoured with a backup in place. Please confirm this reading with whoever advises on privacy.
- **R2 bucket lock:** I recommend a **short fixed retention (14 days) on the private bucket** as a shield against a bug that deletes new pictures, not an indefinite lock (which would block a person's erasure). The long-term protection is the B2 copy.
- Region: an R2 bucket can be created with a **jurisdictional restriction `eu`**, which guarantees that its objects are stored in the EU ([data location](https://developers.cloudflare.com/r2/reference/data-location/); chosen at creation and **cannot be changed afterwards**, so it has to be right the first time), or only with a best-effort location hint (`weur`, `eeur`); B2 has an EU region. Vercel Blob's region is not set by us today. For EU photos of EU persons I recommend the `eu` jurisdiction for both R2 buckets.

## 6. What happens when something fails

| Failure | Today | With the recommendation |
|---|---|---|
| ImgBB deletes or loses a picture | lost unless Blob has it | R2 and B2 still have it; the verification notices and re-uploads |
| Vercel Blob full or locked (Hobby limit) | **every picture read and write fails** | Blob is only the temporary landing place; R2 is primary |
| R2 unreachable for a while | n/a | new photos land in Blob, the queue moves them to R2 later, nothing is refused |
| A bug in our code deletes pictures | gone (the unframed crop is deleted on purpose already) | nothing is overwritten, bucket lock for 14 days, the B2 copy holds, a restore script |
| Cloudflare account suspended or key leaked | n/a | B2 (other provider, other credentials) and ImgBB hold public pictures |
| Mongo (the manifest) lost | the submission rows are lost too | a nightly export of the manifest next to B2; R2 and B2 keys are built from the ids, so pictures can be re-indexed |
| A person asks for erasure | delete from Blob and ImgBB link | delete everywhere, tombstone, B2 lifecycle |

## 7. The manifest (sketch)

`assets`: `{ assetId, submissionId, eventId, role: 'original'|'naked'|'composed'|'screen'|'library', sha256, bytes, mime, width, height, createdAt, class: 'public'|'private', copies: [{ store: 'r2'|'imgbb'|'b2'|'blob', key | url, state: 'ok'|'pending'|'failed'|'missing', size, verifiedAt, attempts, lastError, extra: { imgbbId, deleteUrl } }], deletedAt? }` and `asset_jobs` for the queue. The submission keeps `imageUrl` (the public address on the media domain) so nothing that reads it changes; old addresses are kept as `legacyUrls` so e-mails and shared links that already went out keep working as long as their hosts do.

## 8. The order of work

The match is on 16 October. **Nothing in the live capture path changes before it.** Phase 0 touches no live behaviour.

| Phase | What | Risk to live | Owner steps | Size |
|---|---|---|---|---|
| **0 Rescue** | Copy every existing picture that matters into R2 (the 1,354 ImgBB-only photos first, because ImgBB can delete at any time, then Blob photos, generated frames, logos), with the manifest filled and checksums recorded; no database address changes yet | none (adds files and a collection) | the R2 buckets, token, media domain (section 10) | M |
| **1 Foundation** | `lib/storage/` (one module: put, copy, verify, repair, restore), the manifest and queue, tests with fakes and a bucket of our own | none until switched on | – | L |
| **2 Safety net** | the sweeper, the daily verification, alerts, the "Image safety" card | low | the scheduler (a Worker cron or a GitHub Actions secret) | M |
| **3 Third copy** | nightly R2 to B2 copy with separate credentials, a restore drill | none | the B2 account and a restricted key | S |
| **4 Switch the write path** | new photos: R2 first, Blob fallback, the naked crop kept, composed to R2 public, ImgBB mirror through the queue | **yes: the capture and approval paths** | a go after the match | M |
| **5 Move the addresses** | the database addresses point at the media domain (old ones kept), logos off `r2.dev`, allow-lists, then Blob writes retire to staging only | medium | a go | M |
| **6 Originals** | background upload of the original-size picture by presigned PUT | product change | the decisions of 5.4 | M |
| **7 Policy** | retention, erasure flow with tombstones, the 14-day bucket lock, a written restore procedure | low | the decisions of 5.6 | S |

**The one step I recommend regardless of the architecture, right now and safe:** stop deleting the unframed crop at approval (a one-line change that keeps the file on Blob until Phase 4 moves it). It needs the owner's go because it keeps people's unframed photos longer.

## 9. Cost (at the sizes we have)

Assumptions from the data: composed 0.5 MB, naked 0.5 MB, screen 0.1 MB, original 5 MB. R2 Standard $0.015/GB-month, Infrequent Access $0.01, writes $4.50 per million; B2 $6.95/TB-month.

| Volume | Without originals (1.1 MB a photo) | With originals (6.1 MB a photo) |
|---|---|---|
| 10,000 photos | 11 GB: R2 $0.17, B2 free (first 10 GB) then $0.08 | 61 GB: R2 ~$0.70 (originals in IA), B2 $0.42 |
| 100,000 photos | 110 GB: R2 $1.65, B2 $0.76 | 610 GB: R2 ~$6.50, B2 $4.20 |
| One-off writes for 100,000 photos (4 objects each) | 400,000 Class A operations: $1.80 | same |

Egress from R2 is free, so the CDN costs nothing per view. The media domain is about $10 a year. ImgBB is already paid for. Vercel Blob usage falls to the staging fallback. **Storage cost is not a reason to accept any of the risks above.**

## 10. What I need from the owner

1. **A Cloudflare zone for the media domain** (register a domain, put it on Cloudflare; or tell me which existing domain may move its nameservers). **Decision A.**
2. **Two R2 buckets** (public and private, both with the `eu` jurisdiction, which cannot be changed later) and **one API token** limited to them, set in Vercel as `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BASE_URL`. I will write the exact steps, with screenshots of where to click.
3. **A Backblaze B2 account** and one application key restricted to the backup bucket (kept only in GitHub Actions, never in Vercel). **Decision B.**
4. **Privacy and retention (Decision C):** keep the naked crop after approval? how long after the event? may a person's erasure wait up to 14 days for the bucket lock to pass? is ImgBB acceptable for the naked and original pictures (I recommend not)?
5. **The original-size picture (Decision D):** yes or no, and sent after Save in the background (recommended).
6. **Please check in the Vercel dashboard:** which plan the project is on (Hobby or Pro) and the Blob store's size today; **in MongoDB Atlas:** whether continuous backups are on (the manifest lives there).
7. **ImgBB:** which plan limits apply to your account (per-file size, any bandwidth or API limits), from your account page.

## 11. What I could not verify

The Vercel plan and the Blob store's size (no access); ImgBB's own plan page and limits (the figures come from third-party reviews, the terms and API pages are ImgBB's own); whether Backblaze Object Lock is available as I expect (to be confirmed on opening the account); R2's behaviour with an SHA-256 checksum header on upload (not documented; we verify with our own hash); that a Cloudflare partial setup on a paid plan would allow a subdomain of an external zone (not needed if a dedicated domain is used); MongoDB's backup settings; the real latency from Vercel's region to R2 (expected tens to a few hundred milliseconds; to be measured in Phase 1).

## 12. Sources

- Cloudflare R2: [pricing](https://developers.cloudflare.com/r2/pricing/), [durability](https://developers.cloudflare.com/r2/reference/durability/), [limits](https://developers.cloudflare.com/r2/platform/limits/), [S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), [public buckets and custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/), [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/), [Workers cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [data location](https://developers.cloudflare.com/r2/reference/data-location/)
- ImgBB: [API](https://api.imgbb.com/), [terms of service](https://imgbb.com/tos); third-party plan descriptions found by search (Gappsy, FreeTier), not official
- Vercel: [Functions limits](https://vercel.com/docs/functions/limitations), [Blob pricing and limits](https://vercel.com/docs/vercel-blob/usage-and-pricing), [Cron Jobs limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- Backblaze: [B2 pricing](https://www.backblaze.com/cloud-storage/pricing)
- In this repository: `lib/imgbb/upload.ts`, `lib/photo-vetting/pending.ts`, `lib/photo-vetting/review.ts`, `app/api/submissions/route.ts`, `app/capture/[eventId]/page.tsx`, `lib/submissions/delete-files.ts`, `next.config.ts`, `lib/imgbb/url.ts`
