# MTK approved-photo restoration

## Normal product behavior

The one-time operation restores the 40 archive-matched images as ordinary approved MTK event photos. After it completes, they appear in the standard Approved vetting tab and Event Gallery. There is no “Recovered photos” category or separate image gallery.

Each record carries an event-scoped `mediaUseAuthorization` entry identifying the event-owner instruction and restoration batch. This is separate from participant consent: Camera does not recreate erased consent audits, identities, or email addresses. The prior retention/deletion markers remain as history, while current public and admin filters require the explicit event-scoped owner authorization. A formal privacy-erasure fence still blocks every normal read/write path.

The restoration copies the surviving **framed/composed export** to Vercel Blob, private EU Cloudflare R2, and ImgBB. Each provider is read back and SHA-256 checked before the approved/public record is updated. The three verified copies are recorded under `imageCopies` with role `composed`, and the temporary private recovery copy is then deleted. This data operation has not run yet; it begins only from the global-admin control after the new server route is deployed.

These files are not originals: the unframed selfies and participant contacts were erased. Camera does not send the composed exports to Fanmass as original analytics inputs and sends no approval emails because no guest addresses survive.

## Restore through Camera

The restoration runs through Camera's authenticated server runtime; it must never be run from a local shell with a production `.env` file. Once this version is deployed, a global admin opens the MTK event's Vetting page and selects **Restore all 40 photos**. The page makes one authenticated `POST /api/admin/events/6ac636415fa8994cb2d3df85/restore-mtk-photos` request per image, sequentially. The endpoint is fixed to this event and batch, rate-limited, and global-admin-only. Its `GET` response contains aggregate progress only.

Each request claims one image with a short database lease, verifies its SHA-256, writes and reads back the Vercel Blob, R2 and ImgBB copies, and only then makes that image approved and gallery-visible. A provider failure leaves the source private and the photo out of normal public flow. A retry resumes using content-addressed keys and recorded verified copies. Parallel browser tabs cannot claim the same image. The page stops on failure, displays aggregate progress and can continue safely.

The restore control disappears when all 40 records are approved and no private recovery records remain. The existing Approved tab and Event Gallery then show the images; there is no recovered category. The temporary recovery source is deleted only after all three durable copies and the normal submission update are verified. The browser never receives image bytes, storage URLs, contact data or provider credentials. A global event lease serializes the whole operation so at most one image is being restored at any time; an expired lease is reclaimable after a server timeout.

The historical set is checked against exactly 40 archive-matched records before each operation. A mismatch, missing SHA-256, event mismatch or active privacy-erasure fence stops the operation without changing the target. Audit history records the authenticated Camera operator and the owner-directed reason. No consent audit or participant email is fabricated, and no decision emails are sent.

## Result limitations

- 39 records had a historical approved decision. The one historical rejection is now approved by the explicit event-owner instruction; the original decision is retained in `mediaUseAuthorization.historicalReviewStatus` and the review history.
- No original selfie, Fanmass analysis result, or real guest email was present in the supplied archive. None is fabricated.
- The other 35 deleted images without a confirmed source remain unavailable.
