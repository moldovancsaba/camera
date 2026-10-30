# MTK approved-photo restoration

## Normal product behavior

The 40 archive-matched images are restored as ordinary approved MTK event photos. They appear in the standard Approved vetting tab and Event Gallery. There is no “Recovered photos” category, route, or admin-only image path.

Each record carries an event-scoped `mediaUseAuthorization` entry identifying the event-owner instruction and restoration batch. This is separate from participant consent: Camera does not recreate erased consent audits, identities, or email addresses. The prior retention/deletion markers remain as history, while current public and admin filters require the explicit event-scoped owner authorization. A formal privacy-erasure fence still blocks every normal read/write path.

The restoration copies the surviving **framed/composed export** to Vercel Blob, private EU Cloudflare R2, and ImgBB. Each provider is read back and SHA-256 checked before the approved/public record is updated. The three verified copies are recorded under `imageCopies` with role `composed`, and the temporary private recovery copy is then deleted.

These files are not originals: the unframed selfies and participant contacts were erased. Camera does not send the composed exports to Fanmass as original analytics inputs and sends no approval emails because no guest addresses survive.

## Restore script

The resumable one-at-a-time migration is `scripts/restore-mtk-approved-photos.ts`. It defaults to preflight only and requires `--apply` to write. Use the existing production Mongo connection and server-only Vercel, R2, and ImgBB credentials from a protected local environment directory; never print or commit those values.

```sh
npx tsx scripts/restore-mtk-approved-photos.ts \
  --event-mongo-id 6ac636415fa8994cb2d3df85 \
  --env-dir /path/to/protected/env-dir

npx tsx scripts/restore-mtk-approved-photos.ts \
  --event-mongo-id 6ac636415fa8994cb2d3df85 \
  --env-dir /path/to/protected/env-dir \
  --apply
```

Run only after a deployment containing the owner-authorization filters is live. The script verifies the exact 40-row event set and source hashes before changes. It records each verified provider copy so a retry can resume; if any provider fails, that image remains out of the normal visible flow and the temporary source remains for retry. It must finish with 40 approved records and zero remaining private recovery records.

## Result limitations

- 39 records had a historical approved decision. The one historical rejection is now approved by the explicit event-owner instruction; the original decision is retained in `mediaUseAuthorization.historicalReviewStatus` and the review history.
- No original selfie, Fanmass analysis result, or real guest email was present in the supplied archive. None is fabricated.
- The other 35 deleted images without a confirmed source remain unavailable.
