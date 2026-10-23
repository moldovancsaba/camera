# Camera record erasure and tombstone

**Contract:** `privacy.erasure.camera-record.v1`  
**Owner:** Camera  
**State:** record tombstone merged; provider deletion implementation in review; deployment, secret setup, and production execution are not verified

## Responsibility

Camera accepts exact photo references from the SSO case coordinator, applies a durable publication/processing fence, and removes participant-linked fields from its submission document. Camera does not decide identity, infer a person from an image, or call Fanmass/Messmass to delete their data. SSO provides verified case proof; Fanmass and Messmass own their own erasure adapters; Camera #726 owns provider media deletion; Camera #727 owns backup replay.

## Runtime sequence

1. SSO sends `POST /api/internal/privacy/erase` with its purpose-limited resolver secret and a closed body containing only `request_id` and up to 100 exact photo tuples (`photo_id`, `submission_id`, optional `event_id`).
2. Camera fetches case-bound proof from SSO, then matches each tuple against the exact subject proof and exact Camera identifiers. Caller-supplied identity data is rejected.
3. Camera marks the matching submission `privacyErasure.state = fenced`, disables share/slideshow visibility, and writes a case receipt to `privacy_erasure_tombstones`. Only media URLs and provider delete handles are encrypted in the receipt; analysis, review, consent, identity, and contact fields are not copied there. The source row remains private until the scrubber replaces it.
4. `GET`/`POST /api/internal/privacy/process-erasure` runs every two minutes with `CRON_SECRET`. It also recovers a source fence whose receipt write failed. It claims a bounded batch, replaces each source document with `_id` and the minimal erasure marker, then reports `record_erased` or `media_pending`.
5. `GET /api/internal/privacy/process-media-erasure` runs every minute with `CRON_SECRET`. It claims one media receipt, deletes and verifies at most three objects concurrently, and persists an outcome for each encrypted provider reference. `POST` on the same route requeues one exact photo after an operator has corrected a provider/configuration issue.
6. `POST /api/internal/privacy/erasure-status` returns per-photo record/media state and unresolved/pending media counts to the authenticated SSO coordinator. It never returns contact data, image URLs, delete handles, or analysis results.
7. Camera reports `complete` from the resolver only after the participant row is scrubbed and every known Blob/ImgBB object is verified absent. Fanmass, Messmass, backups, and SSO receipts remain separate completion gates.

The intake requires `CAMERA_PRIVACY_RESOLVER_SECRET` for caller authentication
and a separate, high-entropy `CAMERA_PRIVACY_MEDIA_KEY` of at least 32 UTF-8
bytes for encrypting media references. A missing key is a 503 before any source
row is fenced. The API secret can rotate independently; the media key remains
stable until no pending receipt needs it.

## HTTP contracts

### `POST /api/internal/privacy/erase`

Request:

```json
{
  "request_id": "<SSO case UUID>",
  "photos": [
    { "photo_id": "<24-hex Camera Mongo id>", "submission_id": "<exact Camera submission id>", "event_id": "<optional exact event id>" }
  ]
}
```

The body is capped at 32 KiB and 100 unique photos. Unknown fields, duplicate photo IDs, malformed IDs, an unverified case, an unavailable identity service, and a cross-subject reference fail closed. The response has one state per exact photo. A same-case retry resumes or returns the existing state; another case receives `not_found` for an existing tombstone.

### State meaning

| State | Meaning | Next owner/action |
|---|---|---|
| `not_found` | The exact tuple did not resolve under the verified case, or belongs to another case. | SSO operator reviews the target; do not guess. |
| `fenced` | Normal app reads/writes hide the photo; record scrub is queued. | Camera scrubber retries. |
| `processing` | A worker lease is active. | Wait; stale leases are recoverable after 15 minutes. |
| `record_erased` | Camera replaced the participant-linked source row. | Continue provider and product deletion; this is not end-to-end completion. |
| `media_pending` | Record scrub succeeded and one or more encrypted provider references still need work or backoff. | The scheduled media worker claims the photo and processes due provider tasks. |
| `media_processing` | A media worker lease is active; an expired lease is recoverable after 15 minutes. | Wait for the provider receipt; the worker retries safely after a crash. |
| `media_review_required` | A legacy target has no safe provider reference or an unsupported store was found. | An operator resolves the exact target, then requeues the case; never guess a URL. |
| `media_failed` | A provider task exhausted ten bounded attempts. | Correct the provider/configuration cause, then use the authenticated retry route. |
| `media_erased` | Every known object was deleted or already absent and the provider checks verified absence. | Continue with Fanmass, Messmass, backup, and SSO receipts. |
| `retryable_failure` / `failed` | Camera could not complete the record phase. | Retry while attempts remain; inspect fixed error codes and alert on terminal failure. |
| `retained_exception` | Reserved for a formally approved and documented legal hold. | SSO coordinator must preserve the reason and approval record. Camera never sets it automatically. |

## Safety and concurrency

- All normal public, gallery, vetting, analytics, export, Fanmass eligibility, consent cleanup, and image-repair paths must include the active erasure filter or the shared public visibility rule.
- Every conditional write must include the active filter. If an asynchronous Vercel Blob or ImgBB upload loses the race to a fence, the worker deletes the just-created copy when possible and logs a bounded error without a URL containing user data.
- The source fence is the publication barrier. Record replacement is atomic per Mongo document and retains only the opaque `_id` plus the request/fence timestamps needed to prevent resurrection.
- Tombstone receipts are unique by Camera photo `_id`, use insert-only identity, and keep no plaintext provider address. `CAMERA_PRIVACY_MEDIA_KEY` is a separate secret with at least 32 bytes of entropy, used only for authenticated encryption; resolver API credential rotation does not affect stored media receipts. A media-key rotation needs a versioned migration and must not occur while receipts encrypted with the old key remain pending.
- The worker leases at most 40 receipts per invocation, uses a 15-minute stale-lease threshold, and stops after 10 record-scrub attempts. Alerts must inspect terminal `failed` receipts; they must not include raw proof, email, image, or provider URL.
- The media worker leases one photo per invocation and processes up to three provider objects concurrently. Provider calls are bounded to 10 seconds each; retries use exponential backoff with deterministic jitter (30 seconds through six hours), stop after 10 attempts, and retain an incomplete receipt for operator recovery. Blob deletion is checked through the Blob API and the public URL; Vercel documents that deletion may take up to 60 seconds to propagate through its CDN, so a still-visible cached object is retried instead of being reported complete ([Blob caching behavior](https://vercel.com/docs/vercel-blob#caching)). ImgBB deletion requires its saved, allowlisted delete URL and a public-address absence check. Unsupported providers, missing legacy references, and media still referenced by another live photo are explicit unresolved states; none may be reported as deleted without provider absence evidence.
- A backup restore can resurrect scrubbed source rows unless the restore process replays tombstones first. This remains blocked on Camera #509/#727.

## Recovery, rollback, and limits

An intake failure after the source fence is recoverable: the scheduled worker finds fenced submissions without receipts, encrypts the minimal provider references, and recreates the receipt before record scrub. A missing media key leaves such a source fenced rather than dropping the media handoff. A partial provider deletion must remain incomplete; never report completion just because the submission document is minimal. `POST /api/internal/privacy/process-media-erasure` accepts only the request UUID and exact 24-hex photo ID, requires `CRON_SECRET`, and only resets failed/review tasks to pending. It cannot replace or accept media references.

Rollback removes the cron schedule or disables the authenticated caller. Existing fences stay private. Do not restore the old submission document to roll back; recovery must continue from the durable receipt. No operator script in this change deletes production data or changes provider accounts.

Known boundaries: an image already downloaded to a user's device or provider/CDN cache cannot be recalled by Camera; external backup retention and purge windows are controlled by provider policy; a deletion cannot be certified until Camera media, Fanmass local/pipeline data, Messmass per-photo rows and derived exports, and restore replay are verified.

## Verification

- Focused tests: `node --import tsx lib/privacy/erasure.test.ts` and `node --import tsx lib/privacy/media-erasure.test.ts` (auth, exact reference, encrypted minimal handoff, provider allowlists, deletion verification, already-absent handling, retryable presence, and unknown references).
- Required repository release gate: `npm run release:check` and `npm run inventory:check`.
- GitHub Verify must pass before merge. Production Meta configuration, service secrets, Atlas indexes, provider deletion, and backup replay require separate operational evidence; none is implied by local tests.
