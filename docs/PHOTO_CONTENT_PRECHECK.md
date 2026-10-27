# Camera photo content precheck

**Status:** implemented in this branch; live Hetzner credentials and deployment are not verified.  
**Owner:** Camera.  
**Boundary:** this is a moderation signal for the existing human Vetting workflow. It does not make Fanmass audience/brand analytics, change publication state, or replace a person's decision.

## Purpose

An event may opt in to a server-side precheck that looks for a bounded set of explicit or prohibited-content signals in new selfies. It helps a vetter prioritize attention while they review one photo at a time. A flagged image stays `pending_review`; a no-flags or uncertain result is not proof that the image is eligible.

## Runtime flow

1. A global admin turns on the event's **Content precheck** setting while photo vetting is on. The controls are stored separately, but this human-review aid cannot be enabled when vetting is off. The event API also refuses enablement unless valid server credentials are configured. The setting is absent/off by default.
2. For new photos, Camera snapshots a private moderation intent only when photo vetting is active, the event option is on, and the private pending Blob photo exists. This lets a capture uploaded before a later login/consent page wait for those steps to finish. The worker cannot read it as eligible until the required consent has a verifiable timestamped audit, participant contact is finalized, and retention/privacy fences allow processing. A photo captured before the setting was enabled is not backfilled.
3. Camera's one-minute `CRON_SECRET`-protected scheduled route reads the oldest eligible outbox item. A MongoDB lease gives Camera only one worker invocation at a time and reserves one unresolved remote task at a time.
4. Camera verifies the source is an event-scoped pending Blob URL in its own store; downloads a bounded JPEG, PNG, or WebP; rejects unsupported/oversized images; rotates, scales to a 640 px longest edge, flattens transparency, strips metadata through re-encoding, and hashes both source and normalized bytes.
5. Before submitting, the worker discovers `GET /job-types` and `GET /models`, verifies `image_moderation` is permitted and at least one model is selectable for it, then calls:

   ```json
   {
     "task": "image_moderation",
     "model": "auto",
     "input": { "image_base64": "<normalized bytes>" }
   }
   ```

   It also sends `Authorization: Bearer <CAMERA_MODERATION_API_KEY>` and a stable `Idempotency-Key`. It never sends the source URL, name, email, Camera photo ID, event ID, or partner ID.
6. Camera stores the remote job ID and source revision on that same submission. It polls `GET /jobs/{id}` within a 42-second worker-run budget and resumes on later cron invocations if the remote job is still queued/running. A global lease and pending-job fence prevent a second Camera photo from being submitted while the first remote outcome is ambiguous.
7. Before applying a result, Camera checks the submission is still consent-eligible, contact-complete, pending vetting, unerased, and attached to the same photo URL and source/normalized hashes. A stale result is discarded.
8. Camera validates the result against `camera-moderation.v1`, stores the validated signal on the same submission, and shows it in the existing one-photo Vetting UI. It never writes `reviewStatus` from an AI result. A human uses the existing approve/reject controls.

## Result vocabulary

The current service contract has exactly these nine category keys:

| Key | Meaning |
| --- | --- |
| `nudity` | Possible nudity |
| `sexualContent` | Possible sexual content |
| `middleFinger` | Middle-finger gesture |
| `hateSymbols` | Possible hate symbols |
| `hateWords` | Possible hate words |
| `alcohol` | Alcohol |
| `drugs` | Drugs |
| `violence` | Violence |
| `weapons` | Weapons |

Each category is `detected`, `not_detected`, or `uncertain`. The overall signal is `flagged`, `uncertain`, or `no_flags_detected`. The versioned contract also requires `review_required: true` and `automated_decision: "none"`; inconsistent or partial output is rejected. There is no numeric confidence score in the current contract.

The one-photo Vetting screen displays the state, detected category names, and bounded evidence text supplied by the service. React renders evidence as text, not HTML. The service may be wrong: false positives and false negatives are possible. Hate-word coverage is English-only according to the service policy. The nine categories are the API's current capability, not a promise to identify every prohibited image or every local legal category. This precheck does not identify people, teams, brands, merchandise, emotion, age, or other Fanmass analytics.

## Queue, retries, and failure behavior

- Camera cron runs once per minute; each invocation is capped at 42 seconds and at 10 queue actions. A remote image is submitted only after the previous job completes or definitively expires.
- The outbox stores the status (`queued`, `submitting`, `queued_remote`, `running`, `completed`, `failed`), attempt timestamps/count, idempotency key, remote job ID while active, and source/normalized SHA-256 revisions on the submission.
- Submission retries are capped at five with exponential backoff, bounded to 15 minutes and honoring numeric `Retry-After` up to five minutes. Ambiguous POST outcomes retry only the same photo and idempotency key; the worker will not submit another photo during the 330-second remote uncertainty window.
- Remote polling resumes from the saved job ID. A job that exceeds 330 seconds becomes unavailable and the worker releases its Camera slot. Temporary API/auth errors retain the slot with backoff until that bound so a second Camera photo is not submitted while the first task's state is unknown.
- A photo waiting for consent or finalized contact is not sent to the service. If those steps never finish, existing 24-hour cleanup removes the private photo. Invalid credentials, disallowed task/model inventory, unsupported image, malformed response, and exhausted retries produce no safety verdict and no publication change. The photo remains available to the existing human review. The Vetting screen says unavailable/retrying where applicable.
- A missing `CAMERA_MODERATION_API_KEY` causes the worker to return `not_configured`; the admin API refuses to enable the setting when its server configuration is absent or invalid. Human vetting continues normally.

## Configuration and operations

Set only the Camera-specific bearer key in the authorized server secret store:

```text
CAMERA_MODERATION_API_KEY=<provisioned securely; never paste into chat or commit>
CAMERA_MODERATION_BASE_URL=https://chatbotapi.haho.ai/v1  # optional; this is the default
CRON_SECRET=<existing Camera cron secret>
```

`.env.example` contains an empty placeholder only. No credential is exposed to browser code or API responses. Live discovery is not considered verified until an authorized runtime with the key returns both permitted inventories.

Enable the setting on an event's Vetting tab only after the key, provider access, data-processing basis/notice, and scheduled runtime are ready. The setting affects new captures only. Disabling it prevents new outbox records; an already submitted remote task may complete, while its result is still subject to the source-revision and consent fences.

The worker runs once per minute through Vercel Cron. Vercel's current plan rules allow per-minute cron schedules on Pro and Enterprise; Hobby allows only daily schedules. Camera already has other every-minute cron entries, so this change does not introduce that platform requirement. See [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing).

For operational checks, inspect the existing one-photo Vetting screen and the aggregate `camera.photo_moderation.run` log counters. Failure logs include only a bounded error code, not the key, photo bytes, email, image URL, or moderation evidence. Do not use service logs as a source of a verdict.

## Data handling and limitations

- Camera keeps the original pending photo in its own private Blob store. Only a normalized copy is sent to the external service. No arbitrary URL is sent or fetched by Hetzner.
- Camera stores the moderation result in the same Atlas submission as the photo, linked by that submission's Mongo ID and the exact source revision. The remote API receives no identifying IDs.
- The shared API's documented queue and results are in-memory with a 15-minute retention limit, queued jobs expire after 180 seconds, and inference is bounded to 120 seconds. It has no cancellation/delete endpoint. If Camera erases a photo after the service accepts a job, Camera discards any result and the remote task may still complete within the service's bounded window.
- This implementation requires Camera's existing timestamped consent audit and finalized guest contact. It does not add a new guest-facing consent category. Before using this external image processing for a real event, the owner must verify the existing privacy notice/consent and data-processing terms cover the transfer and retention.
- The precheck is optional and not blocking: a human may review while it is queued or unavailable. No AI signal—including `no_flags_detected`—approves an image.

## Rollback and recovery

Turn **Content precheck** off for the event. New captures stop entering the queue. Existing records and their human decisions remain; an already accepted remote task cannot be cancelled, but its result is still checked and cannot alter publication. If the provider key is rotated or revoked, update it only through the authorized secret store; queued work remains in Camera and can resume after valid configuration is restored, subject to retry/job retention bounds.

## Verification

Local tests cover inventory discovery, `model: auto`, idempotency headers, result-contract validation, one-at-a-time submission, ambiguous POST handling, consent/contact gating, and stale-revision discard. This is a local mocked end-to-end flow, not proof of the shared service's live behavior. The owner has not provisioned `CAMERA_MODERATION_API_KEY` in the authorized local environment; live `/job-types`, `/models`, provider E2E, deployed cron, and production event checks remain open.
