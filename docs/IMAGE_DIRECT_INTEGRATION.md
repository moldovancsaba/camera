# Camera ↔ image.direct rendering contract

**Status: Planned; not implemented or enabled.** Camera try-on is paused. This contract describes the gated replacement path and is not evidence that an image.direct route, callback, or worker integration is live. Keep all events disabled until the canary and retirement gates pass.

## Ownership

- Camera owns capture, source submissions, event/garment eligibility, canonical `tryon_jobs`, retry/rerun intent, derived `tryon_result` submissions, moderation, and publication policy.
- image.direct owns a subordinate renderer execution record correlated by stable Camera `jobId`, local worker lease and inference, and integrity-verified immutable R2 output.
- Camera `tryon_jobs` remains the product lifecycle source of truth. image.direct's planned `camera_render_jobs` records mirror execution state and do not replace Camera's queue or write Camera collections.
- The two applications use separate database credentials and communicate through authenticated server-to-server APIs; they do not share Atlas credentials or write each other's collections.

## Current and planned flow

### Current state

Camera's `POST /api/submissions` path validates event and garment policy, uploads the try-on source to Camera storage, and creates/gets a `tryon_jobs` row. Historically, the separate try-on worker claimed that row, rendered, published a result, and called Camera's internal completion endpoint. As of 2026-09-30, try-on is paused: the worker is stopped, current events have try-on disabled, and the five-minute try-on sync cron is removed. Do not restart or enable the legacy runtime as part of this integration.

Camera completion materializes a derived `submissionKind: 'tryon_result'` with source/job/garment/event linkage. Results remain hidden and pending human review unless an existing event policy explicitly says otherwise; rerun results always require fresh review. The callback cannot approve, share, or add a result to a slideshow.

### Planned replacement

1. Camera validates existing event policy and writes the canonical submission, `tryon_jobs`, and a durable dispatch/outbox intent.
2. Camera's server adapter posts the immutable job snapshot to image.direct. A request timeout is recovered by replaying the same Camera `jobId` and intent fingerprint.
3. image.direct validates the machine principal, request schema, public-consent facts, exact input URL hosts, input integrity metadata, and supported capability before accepting work.
4. The image.direct Mac worker claims a fenced execution lease, fetches the approved public source and one garment reference, verifies the bytes, stages temporary files, and invokes only the configured local inference runtime.
5. The worker stores the verified result at image.direct's immutable R2 CDN URL and calls Camera's completion endpoint with a separate callback secret.
6. Camera verifies callback/job correlation and result-host policy, idempotently creates one result, applies its existing event moderation policy (pending/hidden by default; reruns always require fresh review), and acknowledges it. image.direct marks execution complete only after this acknowledgement.
7. Reconciliation repairs missing dispatch/callback acknowledgements without creating another Camera result or rerendering an already-published result.

## Planned API and payload

All routes below are **planned** and must not be called until their implementation issues close.

### Camera → image.direct

`POST /api/integrations/camera/v1/jobs`

Authentication: `Authorization: Bearer <IMAGE_DIRECT_INTEGRATION_TOKEN>` over HTTPS. The token is unique to this integration and is not the legacy try-on secret, Atlas URI, R2 token, or image.direct worker token.

```json
{
  "schemaVersion": 1,
  "cameraJobId": "job_opaque_camera_id",
  "source": {
    "submissionId": "camera_submission_id",
    "imageUrl": "https://approved-camera-image-host.example/source.jpg",
    "sha256": "64-lowercase-hex-characters",
    "byteLength": 123456,
    "mediaType": "image/jpeg"
  },
  "garmentReference": {
    "leatherSuitId": "garment_id",
    "imageUrl": "https://approved-camera-image-host.example/garment.png",
    "sha256": "64-lowercase-hex-characters",
    "byteLength": 45678,
    "mediaType": "image/png",
    "garmentType": "jersey",
    "sleeveStyle": "short_sleeve"
  },
  "request": {
    "setupId": "camera_setup_id",
    "promptProfileId": "approved-image-direct-profile",
    "promptProfileVersion": "1"
  },
  "consent": {
    "publicDelivery": true,
    "recordedAt": "2026-10-01T00:00:00.000Z",
    "policyVersion": "camera-public-image-processing-v1"
  }
}
```

The example contains illustrative values only. Camera must send a stable job ID, immutable setup/profile snapshot, per-job public-delivery consent provenance, and expected SHA-256, byte length, and media type for every input. image.direct verifies actual bytes. Only HTTPS URLs on exact configured host/path allowlists are eligible. Reject private, loopback, link-local, reserved, or rebinding destinations and cross-host redirects. No credentials may appear in URLs.

Identical replay for the same `cameraJobId` and request fingerprint returns the existing renderer execution (`202` on first acceptance, `200` on replay); reuse with changed intent returns `409 idempotency_conflict`. Safe errors include `400 invalid_request`, `401 unauthorized`, `413 request_too_large`, `429 rate_limited`, `503 queue_unavailable`, and `409 capability_unsupported`.

Planned status lookup: `GET /api/integrations/camera/v1/jobs/{cameraJobId}`. Planned cancellation: `POST /api/integrations/camera/v1/jobs/{cameraJobId}/cancel`; cancellation succeeds idempotently only before worker claim and otherwise returns `409 job_not_cancellable`. It does not interrupt inference or delete assets.

### image.direct worker execution

The planned worker claim route is `POST /api/worker/integrations/camera/jobs/claim`, protected by image.direct's existing worker authentication and a per-claim lease. `204` means no eligible job. The worker receives only validated references and immutable job/profile data; it never receives Camera's Atlas URI. Writes are lease-fenced, and expired/stale workers cannot finalize a result.

### image.direct → Camera result callback

The planned target is `POST /api/internal/tryon/complete`, extended for a versioned `renderer: 'image_direct'` result. It must require `X-Camera-Image-Direct-Callback-Token: <CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN>`; this credential is distinct from the legacy try-on worker secret. The result includes Camera `jobId`, image.direct execution ID, immutable result URL, SHA-256, length, media type, pipeline/model version, and idempotency key. Camera accepts only the exact configured image.direct R2 CDN host and immutable path, correlated to the canonical Camera job. It must not fetch arbitrary callback URLs. Duplicate identical callbacks return the original acknowledgement; conflicting outputs fail safely. Callback data cannot set moderation, sharing, or slideshow flags.

## State mapping and retry ownership

| image.direct execution state | Camera `tryon_jobs` state | Contract meaning |
|---|---|---|
| `accepted`, `queued` | `queued` | Durable remote intent; awaiting local worker. |
| `claimed` | `claimed` | Worker lease acquired. |
| `downloading_inputs`, `rendering` | `processing` | Inputs checked or inference active. |
| `uploading_result` | `uploading_result` | Immutable R2 publication and verification. |
| `callback_pending` | `notifying_camera` | Output is verified; Camera acknowledgement pending. |
| `retry_wait` | `retry_wait` | Transient failure has bounded retry scheduled. |
| `completed` | `done` | Camera acknowledged materialization; moderation still applies. |
| `failed` | `failed` | Stable terminal/operator-retryable error. |
| `cancelled` | `cancelled` | Cancel won while work remained queued. |

Camera owns retry and rerun intent. Retry of unchanged intent preserves the Camera job ID and fingerprint; rerun or changed garment/setup creates a new Camera job and a new moderation candidate. Permanent auth, consent, schema, integrity, and unsupported-capability errors do not auto-retry. Camera never marks a job `done` before accepting the result callback.

## Capability and consent gates

- V1 accepts one person/source plus at most one garment reference. The Camera garment snapshot preserves `leatherSuitId`, `garmentType` (`motorsport_suit | jersey | top | bottom`), and optional `sleeveStyle`.
- Two-piece requests with `outfitBottomLeatherSuitId` are rejected before rendering; they are not degraded to top-only.
- Presence of a garment type does not promise the current image.direct engine supports it. image.direct local model qualification issue [#15](https://github.com/moldovancsaba/image.direct/issues/15) and Mac acceptance issue [#18](https://github.com/moldovancsaba/image.direct/issues/18) gate canary. No model-quality parity with prior providers is implied.
- Public CDN URLs are readable by anyone who obtains them. Explicit per-job consent is required for source and garment assets. Approval for the user's test images does not authorize other submissions. Consent withdrawal blocks new work; retention/deletion and public-cache consequences must be reviewed before canary.
- No inference fallback to a hosted provider is allowed. Vercel CDN is not a durable second object store, and the image.direct local vault is not automatically populated by this integration.

## Environment names and secrets

These are contract names. Separate admission and callback secrets have been provisioned as Vercel Secrets per Preview/Production receiver; this does not mean any integration route is live. Host allowlists and the Preview URL remain unset until the owning API work defines them. Do not reuse worker, Atlas, R2, or legacy try-on credentials.

| Runtime | Planned keys | Use |
|---|---|---|
| Camera Vercel | `IMAGE_DIRECT_INTEGRATION_URL`, `IMAGE_DIRECT_INTEGRATION_TOKEN` | Camera admission/status/cancel request. |
| image.direct Vercel | `CAMERA_INTEGRATION_TOKEN`, `CAMERA_INTEGRATION_TOKEN_PREVIOUS`, `CAMERA_INPUT_ALLOWED_HOSTS` | Authenticate Camera and constrain source/garment hosts. The current inbound token matches `IMAGE_DIRECT_INTEGRATION_TOKEN` in Camera for the same environment only; previous token is unset except during rotation. |
| image.direct Mac worker | `CAMERA_IMAGE_DIRECT_CALLBACK_URL`, `CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN` | Outbound authenticated completion. |
| Camera Vercel | `CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN`, `CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN_PREVIOUS`, `IMAGE_DIRECT_RESULT_ALLOWED_HOSTS` | Verify callback and restrict immutable R2 CDN outputs. This token is separate from the admission token and matches the local worker token only within the same environment; previous token is unset except during rotation. |

Use independent random secrets for Preview and Production. Paired values must match within one environment only; never reuse one environment's value in the other. Production uses `https://imagedirect.vercel.app`; Preview must not point to Production. No shared Atlas URI is required. Secret values are never returned from health routes or logged. Rotation uses a bounded overlap and verified revocation; authentication failures fail closed and are not retried as transient errors. See the [credential rotation runbook](https://github.com/moldovancsaba/image.direct/blob/main/docs/runbooks/CAMERA_INTEGRATION_CREDENTIALS.md).

## Operations, recovery, and rollback

- Bound request bodies, image dimensions/bytes, DNS/connect/read/total fetch time, inference, R2 upload, and callback time. The implementation issues must set numeric service deadlines before release; no unbounded operation is permitted.
- Retry only transient network, Atlas, and R2 errors, using bounded backoff with jitter. Do not retry malformed input, missing consent, hash mismatch, invalid host, unsupported setup, or bad credentials without correction.
- Correlate logs/metrics by opaque Camera job ID, execution ID, attempt, state, elapsed time, worker heartbeat/build, and safe error code. Never log prompts, input URLs, image bytes, or credentials.
- Monitor oldest dispatch, oldest callback, stale leases, queue age, safe failure codes, duplicate acknowledgements, and Camera/image.direct state drift.
- Global and event-level pause must stop new dispatch. Keep accepted work and immutable result objects for reconciliation; never delete Atlas rows or rerender only because an acknowledgement was lost.
- Before legacy retirement, inventory every queued/active/retry-wait legacy job and document its disposition. Preserve Camera submissions, moderation records, garment catalog, and historical result links.

## Accessibility and UX scope

This contract adds no UI. The dependent renderer rollout controls issue must use only Sovereign Squad General Design System components. Loading, disabled, error, stale, and saved states must be keyboard accessible, labeled for assistive technology, visibly focused, contrast-compliant, and not color-only. Any job status must distinguish disabled, waiting, processing, failed, and pending human review.

## Acceptance and verification

Before canary, tests must prove idempotent admission/callback, state mapping, input SSRF and integrity denial, consent absence/revocation, size/time limits, stale lease fencing, retry classification, worker outage/recovery, queued-cancel race, R2 outage, moderation defaults, and rollback. Use disposable Atlas and synthetic or individually consented public-CDN assets only. Record hashes, response codes, model/build, metrics, and signoff; do not attach private image bytes or credentials to issues.

Related contracts: [Try-On Architecture](./TRYON_ARCHITECTURE.md), [Try-On Low-Level Design](./TRYON_LOW_LEVEL_DESIGN.md), [operations](./TRYON_OPERATIONS.md), [documentation index](./DOCUMENTATION.md). The image.direct delivery board is [project #65](https://github.com/users/moldovancsaba/projects/65); the issues are [image.direct #24–#29](https://github.com/moldovancsaba/image.direct/issues/24), [Camera #162–#166](https://github.com/moldovancsaba/camera/issues/162), and the gated [try-on retirement issue #49](https://github.com/moldovancsaba/try-on/issues/49).
