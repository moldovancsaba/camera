# MTK erased-photo recovery

## What this restores

The October 17, 2026 archive matched 40 of the 75 erased MTK submission records exactly: 39 had a historical approved decision and one had a historical rejected decision. The other 35 have no confirmed image source and are not recreated from metadata.

The recovered files live in the `camera-mtk-recovery` private Blob store in the Frankfurt region. Camera stores only the private Blob pathname, archive filename, SHA-256, recovery time, and historical decision in the separate `adminRecovery` field. It does not reconstruct guest identity or consent evidence.

## Runtime behavior

- The existing event **Approved** and **Rejected** tabs include these images under their historical decision. The existing manager Event Gallery includes the historically approved images. There is no separate recovery section or menu.
- The cards use the same authenticated Camera image route after it checks manager access and confirms the submission is still marked `consentStatus: expired` and `retentionStatus: erased`. In Vercel Functions, the route reads the short-lived Blob OIDC token from the `x-vercel-oidc-token` request header; `VERCEL_OIDC_TOKEN` is only a build/local fallback. The route passes that token explicitly to the private Blob SDK and bypasses cache so expired or removed copies are never served from a stale edge response.
- These cards are read-only: they cannot be approved, rejected, returned to vetting, selected for bulk removal, or framed. The historical decision is retained; the one historically rejected photo stays in Rejected.
- The archive does not restore the erased submission fields or the consent audit. These manager views do not add the photos to the guest-facing public gallery, share pages, e-mails, or Fanmass. Those systems continue to require Camera's ordinary stored consent and visibility fields.
- Reads return `Cache-Control: private, no-store` and never return the private Blob address to the browser.
- Permanent submission deletion removes this separate private copy as well. Deletion routes pass the Function's OIDC request header to the private Blob SDK; a missing recovery-store ID or OIDC token fails closed and keeps the submission row so deletion can be retried.

## Recovery procedure

The one-time script `scripts/restore-mtk-erased-photos.ts` is resumable and defaults to a dry run. Its manifest and extracted JPEGs must remain outside git. It validates the event, exact count, record state, original review status, JPEG signature, and SHA-256 before upload. It uploads and verifies one image at a time, then adds only `adminRecovery` to the matching submission.

The production environment uses the dedicated `CAMERA_MTK_RECOVERY_*` variables connected to the private store. The existing public `camera-blob` token and existing capture uploads are unchanged.

## Recovery limits

This recovery restores manager-only inspection for the 40 archive-confirmed images in the existing Camera views. It does not restore customer contact details or the erased consent record, nor does it grant guest-facing publication or analysis eligibility. The remaining 35 originals were not found in the supplied archive or confirmed storage inventory; their metadata is not sufficient to recreate the photos.
