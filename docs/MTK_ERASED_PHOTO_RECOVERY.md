# MTK erased-photo recovery

## What this restores

The October 17, 2026 archive matched 40 of the 75 erased MTK submission records exactly: 39 had a historical approved decision and one had a historical rejected decision. The other 35 have no confirmed image source and are not recreated from metadata.

The recovered files live in the `camera-mtk-recovery` private Blob store in the Frankfurt region. Camera stores only the private Blob pathname, archive filename, SHA-256, recovery time, and historical decision in the separate `adminRecovery` field. It does not reconstruct guest identity or consent evidence.

## Runtime behavior

- Event managers can inspect these files in a separate **Recovered photos** section of the event's Vetting page.
- Each thumbnail is streamed through an authenticated Camera route after the route checks manager access to the event and confirms the submission is still marked `consentStatus: expired` and `retentionStatus: erased`. In Vercel Functions, the route reads the short-lived Blob OIDC token from the `x-vercel-oidc-token` request header; `VERCEL_OIDC_TOKEN` is only a build/local fallback. The route passes that token explicitly to the private Blob SDK and bypasses cache so expired or removed recovery copies are never served from a stale edge response.
- Recovery files are not added to `imageUrl`, `photoReview`, normal vetting queues, public galleries, share pages, emails, or Fanmass. The historical approved/rejected status is displayed only as context and cannot be changed from this section.
- Reads return `Cache-Control: private, no-store` and never return the private Blob address to the browser.
- Permanent submission deletion removes this separate private copy as well. Deletion routes pass the Function's OIDC request header to the private Blob SDK; a missing recovery-store ID or OIDC token fails closed and keeps the submission row so deletion can be retried.

## Recovery procedure

The one-time script `scripts/restore-mtk-erased-photos.ts` is resumable and defaults to a dry run. Its manifest and extracted JPEGs must remain outside git. It validates the event, exact count, record state, original review status, JPEG signature, and SHA-256 before upload. It uploads and verifies one image at a time, then adds only `adminRecovery` to the matching submission.

The production environment uses the dedicated `CAMERA_MTK_RECOVERY_*` variables connected to the private store. The existing public `camera-blob` token and existing capture uploads are unchanged.

## Recovery limits

This recovery restores private admin inspection for the 40 archive-confirmed images. It does not restore consent, customer contact details, or eligibility for publication or analysis. The remaining 35 originals were not found in the supplied archive or confirmed storage inventory; their metadata is not sufficient to recreate the photos.
