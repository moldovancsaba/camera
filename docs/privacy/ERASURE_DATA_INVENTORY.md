# Cross-product right-to-erasure data inventory

**Snapshot date:** 2026-10-23  
**Inventory contract:** `privacy.erasure.inventory.v1`  
**Status:** source-code inventory; production-store contents and backup execution are not asserted  
**Scope:** Camera, SSO, Fanmass, Messmass, their configured media surfaces, and currently documented backup boundaries.

This is the source-verified baseline for implementing the GDPR erasure workflow. It records implemented behavior separately from the target design. It does not claim that any particular request is complete, that a production cleanup job has run, or that every backup is known. The inventory is read-only; no production data was changed to prepare it.

## Product ownership and join keys

| Product | Owns | Stable identifiers currently used | Current link to other products |
|---|---|---|---|
| Camera | Participant capture, contact and consent evidence, event/photo lifecycle, moderation, publication, image references, and human review of analysis | Camera `submission._id` (photo identity), `submissionId` (display/legacy identifier), `userId`, `guestContact.email`, `eventId`/`eventIds`, `partnerId` | Event may contain `messmassEventId`; Fanmass reads an identity-free eligibility projection and routes by Camera partner/event/photo IDs. |
| SSO | Public accounts, social-provider identities, authentication credentials, sessions, OAuth authorization/token state, verified erasure cases | `publicUsers.id`, Mongo `_id`, `email`, `socialProviders.facebook.id`; session `userId`; OAuth/token user IDs; case UUID | SSO owns the Facebook callback and case-bound proof; the cross-product coordinator and completion receipt are separate sequenced work. |
| Fanmass | One-photo-at-a-time analysis work, its queue/leases/results/outbox, analysis boxes, and local analysis copies | Camera submission Mongo ID as source-photo key; source revision and generation; Camera event/partner and Messmass destination tuple | Pulls eligible Camera records from Atlas. Sends a per-photo result or tombstone to Messmass. It does not receive participant identity/contact fields. |
| Messmass | Event/project reporting, per-photo Fanmass result rows, report aggregates/projections | Messmass project `_id`, Camera event/partner/photo IDs; stable event/photo record key | Validates the exact Camera event and partner link; Fanmass sends result/tombstone over authenticated API. |

The intended canonical references for request processing are `PrivacySubjectRef` (verified account or verified external provider subject) and `PhotoRef` (Camera partner/event/photo IDs). They are deliberately distinct. A photo reference is not proof of who requested deletion. No service may infer a participant from reviewer identity, a display name, a sentinel address, an image, or an event association.

## Inventory by data class and product

### Camera

| Data class | Current location and key | Current lifecycle / deletion evidence | Inventory status |
|---|---|---|---|
| Participant and account contact | `camera.submissions`: `guestContact`, legacy `userInfo`, `userInfoDraft`, `userEmail`, `userName`, `userId`; indexed by `userId` and `userInfo.email` | Canonical `guestContact` is authoritative when present. `anonymous@event`, `admin@upload`, and `unknown@unknown.com` are sentinels. Manual submission deletion removes the submission after file deletion; anonymous/incomplete-contact cleanup strips identity as it expires. SSO case resolution is available; this Camera change introduces an exact-reference fence and scrub receipt. | Record scrub implementation is in progress; account-wide completion still depends on media, Fanmass, Messmass, backup replay, and SSO coordinator issues. |
| Consent evidence | `submissions.consents[]`, `consentStatus`, `consentExpiresAt`, `consentShareOptIn`, `publicGalleryConsent` | Missing/unverifiable mandatory consent fails closed and triggers cleanup. Explicit pending consent has a separate expiration. Cleanup retains a minimal `expired` state/tombstone for counts. | Existing consent cleanup; full request-specific receipt missing. |
| Photo, crops, and variants | `submissions.imageUrl`, `finalImageUrl`, `originalImageUrl`, `previewImageUrl`, `screenImageUrl`, `photoReview.photoUrl`, `tryOnRequest` legacy URLs, `imageCopies[]` | `lib/submissions/delete-files.ts` removes owned Vercel Blob URLs and requests ImgBB deletion via saved delete links. Shared URLs are retained. Blob failures block row deletion; ImgBB failure is best-effort and logged as unresolved. | Partial. Provider-level completion receipts and verified deletion of every historical object are not guaranteed. |
| Moderation, identity, analysis review | `reviewStatus`, `reviewHistory`, `reviewedBy`, `approvedBy`, `reviewNotes`, `rejectReasons`, `fanmassAnalysisReview` | A case-bound exact photo target is fenced before record scrub. The two-minute scrubber replaces the submission with only its Mongo photo key and request/fence timestamps; public, moderation, analytics, cleanup, and image repair paths are updated to exclude fenced rows. The 24-hour no-contact flow remains separate. | Record tombstone and worker are implemented in the current Camera work; provider deletion and downstream copies remain pending. |
| Erasure receipt and provider handoff | `privacy_erasure_tombstones`, keyed by Camera photo `_id` | Stores the SSO case UUID, opaque submission/event refs, state/attempt timestamps, and AES-256-GCM encrypted media URLs/delete handles. It never stores participant contact, consent, analysis, image bytes, or plaintext media URLs. The internal status endpoint omits all identity and provider details. The separate `CAMERA_PRIVACY_MEDIA_KEY` encrypts the media handoff. | Camera record deletion is implemented in the current unmerged work; media handoff remains `media_pending` until Camera #726 consumes it. Media-key rotation requires versioned migration after pending media work is empty. |
| Deletion counts | `photo_deletion_analytics`, key `<eventId>:<submissionId>` | Minimal manual/automatic counts can remain after the submission is deleted; contains a submission reference and event/review metadata, not the original contact or photo. Whether this reference is retained for erasure evidence needs an approved minimization/retention decision. | Retention disposition needs policy and implementation. |
| Registration and follow-up e-mail | `email_registrations` holds event/e-mail registration and delivery state; `email_follow_ups` uses a hashed event/address key and delivery state | No account/photo erasure cascade is currently documented for these records. Hashing an address is pseudonymization, not proof that it is outside the request. | Erasure adapter and verification query missing. |
| Anonymous journey and tracked-link counts | `journey_events` (random visit ID; 30-day TTL), `journey_daily` (aggregate counts retained indefinitely), `short_link_hits` (link/day/device counts) | Raw journey rows expire through Mongo TTL; daily counts and link counts have no person join. They cannot be attributed to a participant by the current contract. | No person-level deletion path; confirm aggregates remain non-identifying. |
| Operational/admin records | `activity_log`, `activity_exports`, stdout/platform logs, `web_sessions` | Activity rows include manager identity and action context; weekly export removes sent rows after export according to current code/docs. Web sessions expire. Platform log retention is outside Camera's direct deletion API. | Exact retention and request-level deletion evidence unresolved. |
| Image backups and caches | Vercel Blob, ImgBB, rescue copies, any provider cache, MongoDB Atlas backups | Issue [camera#509](https://github.com/moldovancsaba/camera/issues/509) records incomplete independent/private backup and provider inventory. Existing delete adapter knows Blob and saved ImgBB links only. CDN/provider caches and backup replay are not proven. | **Blocked by owner/provider setup and issue #509.** Never claim complete erasure while copies are unknown. |

Camera source references: `lib/db/schemas.ts` (`COLLECTIONS`, `Submission`), `lib/submissions/guest-contact.ts`, `lib/submissions/delete-files.ts`, `app/api/internal/purge-unconsented-captures/route.ts`, `lib/submissions/erasure-batch.ts`, `lib/analytics/photo-deletion.ts`, `lib/db/ensure-indexes.ts`, `docs/PRIVACY_DATA.md`, `docs/GUEST_CONTACT_AND_ERASURE.md`, `docs/STORAGE_ARCHITECTURE.md`.

### SSO

| Data class | Current location and key | Current lifecycle / deletion evidence | Inventory status |
|---|---|---|---|
| Public account and social identity | `publicUsers`, keyed by stable `id` and email; Facebook provider subject under `socialProviders.facebook.id` | `pages/api/public/account.js` deletes a logged-in user's public account and known auth collections. Facebook callback resolves/creates/links account by provider ID and e-mail. | Account endpoint remains local to SSO; no verified cross-product cascade is complete. |
| Authentication and OAuth state | `publicSessions`, `authorizationCodes`, `accessTokens`, `refreshTokens`, `loginPins`, `publicMagicTokens`; other OAuth records reference user/client IDs | Account endpoint deletes records in the enumerated collections. Session revocation/expiration paths exist separately. Coverage of every token/client/admin-linked record must be reconciled against current schemas before completion. | Partial endpoint; no durable erasure case or provider receipt. |
| Login/security logs | SSO application logs; public session metadata includes login method and device/network metadata in current callbacks | Logs are not covered by account endpoint. Retention depends on hosting/log sinks. The current account deletion log includes user ID and e-mail. | Needs privacy-safe audit/event policy and retention inventory. |
| Facebook data-deletion callback | SSO `pages/api/facebook/data-deletion` handler and case-bound status endpoint (SSO #136, merged 2026-10-23) | Validates signed Meta requests, creates/reuses a durable case, and returns a privacy-safe status URL. The callback does not delete Camera/Fanmass/Messmass data. | Code merged; Meta dashboard configuration and non-production callback smoke are still required before marking callback operation complete. |

SSO source references on `origin/main`: `pages/api/public/account.js`, `pages/api/auth/facebook/callback.js`, `lib/publicUsers.mjs`, `lib/publicSessions.mjs`, `lib/facebook.mjs`, `lib/auth/facebook.mjs`, `docs/FACEBOOK_LOGIN_SETUP.md` (the guide explicitly notes the callback is not included).

### Fanmass

| Data class | Current location and key | Current lifecycle / deletion evidence | Inventory status |
|---|---|---|---|
| Queue and worker state | `fanmass_camera_pipeline.fanmass_camera_analysis_queue`, unique `queueKey` derived from Camera source ID/revision | One global lease and one claimed photo at a time; source eligibility is rechecked before work. Source ineligibility/deletion requests privacy cleanup. | Implemented source cleanup path; no user identity is stored in the task. |
| Analysis result, boxes, and delivery outbox | `fanmass_camera_analysis_results`, `fanmass_camera_analysis_delivery`; key is per photo/revision/generation | Results contain image analysis/boxes and routing tuple. Delivery outbox sends to Messmass; tombstone delivery is retried. | Implemented per-photo deletion signal; backup/retention evidence and case correlation need implementation. |
| Discovery/runtime state | `fanmass_camera_pipeline` control, event state, scan state, privacy cleanup collections | Resume tokens, cursors, lease/runtime health, and cleanup retry metadata are operational state, not participant contact. Source changes are reconciled by scans and change streams. | Existing operational recovery; retention and erasure evidence limits require explicit schema. |
| Local copies and model artifacts | Fanmass local upload/analysis working directories and local result store; model files/config | Camera cleanup removes pipeline-owned result/work and local photo data through Fanmass privacy processing. Model binaries are not person-specific. Local volumes/backups are not covered by a cross-system case receipt. | Local storage paths and host backup/snapshot policy need an operator inventory. |
| Identity data | None allowed in task/result contract | Source projection calculates `guestContactEligible` only; no e-mail, name, account/social ID, consent text, or image URL is sent downstream in the result. | Contract requirement; validate by schema and log tests. |

Fanmass source references on `origin/main`: `docs/CAMERA_ATLAS_QUEUE_CONTRACT.md`, `services/camera_atlas.py`, `services/camera_sync.py`, `workers/detection_worker.py`, `config.py`. The queue contract says Camera and Fanmass currently share Atlas, but Messmass production remains on a separate cluster; no shared production database cutover is claimed.

### Messmass

| Data class | Current location and key | Current lifecycle / deletion evidence | Inventory status |
|---|---|---|---|
| Per-photo analytics and boxes | `fanmass_camera_photo_analyses`, deterministic `_id` from Messmass event + Camera photo; unique event/photo index | Authenticated Fanmass `POST` upserts one complete result. `DELETE` stores a tombstone and unsets `analyzedAt`, `summary`, `boxes`, and `analysis`; stale generations are ignored. | Implemented per-photo tombstone. Tombstone routing identifiers remain; report projections must be rebuilt. |
| Report summary/projection | `ai_analysis_summaries` and report data derived from non-tombstoned photo rows | `rebuildFanmassPhotoEventSummary` aggregates current active per-photo records after writes/tombstones. | Event rebuild behavior exists; all derived caches/export surfaces need to be enumerated and verified. |
| Event/partner relationship | `projects.externalRefs.camera` and linked partner `cameraPartnerId` | API rejects mismatched Camera event/partner links. | Link contract available; must be used to enumerate relevant event photo records, not to infer a person. |
| Logs, exports, backups | Messmass app logs, report exports, Mongo backups and current separate production Atlas cluster | Per-photo tombstone does not prove deletion from exports, snapshots, caches, or backup copies. The Fanmass contract documents the cluster mismatch and a guarded backup/parity/cutover requirement. | Unknown until operational inventory and verified backup/restore replay are delivered. |

Messmass source references on `origin/main`: `lib/fanmassPhotoAnalyses.ts`, `app/api/integrations/fanmass/events/[eventId]/photos/[photoId]/route.ts`, `lib/fanmassIntegration.ts`, relevant report/export readers, and `docs` Fanmass integration contracts.

## Data lifecycle distinctions

1. **Facebook platform request:** SSO must validate the provider-signed request and map the provider subject to an SSO account. It then creates a durable request case and coordinates downstream products. A provider callback is not a verified Camera photo list.
2. **Authenticated person/account erasure:** SSO account subject can resolve Camera submissions via exact stable account links and source-backed contact history. E-mail equality alone is not a universal identity key. Ambiguous matches require a human-resolution state, not deletion by guess.
3. **Photo-level erasure:** an authorized request can name exact Camera photo IDs. Camera owns eligibility, photo/contact data, and media deletion; Fanmass and Messmass remove their per-photo copies through their service contracts.
4. **No-login/consent expiry:** Camera's current 24-hour incomplete-contact cleanup and missing-consent cleanup are automated retention/consent controls. They are not proof of a verified subject request and must not be reported as a completed GDPR case.
5. **Backups:** a live-row deletion does not erase an immutable/point-in-time backup immediately. A backup copy needs a documented expiry or a restore-time tombstone replay fence, with a completion receipt that does not leak the erased identity.

## Target contracts to implement

Contract names and canonical fields are reserved by this inventory; changes require a version bump and coordinated updates to all consumers.

```text
privacy.erasure.case.v1
  caseId: opaque UUID
  source: participant | facebook
  sourceRequestId: opaque provider/request reference (never access token)
  subject: { kind: sso_user | facebook_subject | camera_photo, id: exact stable ID }
  status: received | verifying | resolving | processing | retrying | completed | partial | rejected
  createdAt, updatedAt, deadlineAt
  targets[]: { product, targetRef, status, attempts, nextAttemptAt, receiptRef }

privacy.erasure.target.v1
  caseId, targetId, product, action: erase_subject | erase_photo | erase_projection
  references: { cameraPartnerId?, cameraEventId?, cameraPhotoId?, ssoUserId? }
  idempotencyKey, requestedAt

privacy.erasure.receipt.v1
  caseId, targetId, product, outcome, attemptedAt, completedAt?
  evidenceRef: opaque non-PII receipt key
  retainedCategory?: approved policy code
```

Fanmass payloads must carry only photo/event/partner references, source revision, request/idempotency identifiers, and deletion outcome. They must never carry participant identity or contact. Receipts exposed to requesters contain no image URL, photo bytes, Facebook token, e-mail, or provider credential. The proposed API boundaries and auth are owned by the implementation issues, not introduced by this inventory document.

## Unknowns and safe disposition

| Unknown | Safe handling now | Owning follow-up |
|---|---|---|
| Camera backup providers, copies, and retention | Mark erasure incomplete until every known copy is deleted or covered by an approved time-limited backup policy and restore fence. Do not remove surviving backup copies. | [camera#509](https://github.com/moldovancsaba/camera/issues/509), Camera#727 |
| SSO Facebook user-data deletion callback and provider proof | Do not acknowledge a request as completed until the signed subject maps to a case and downstream receipts settle. | SSO#136, SSO#137 |
| Exact subject → photo mapping, including legacy e-mail and social-account links | SSO provides case-bound verified proof to the Camera read-only resolver; Camera applies exact stored identifiers and returns only opaque photo references. Conflicting stable account ownership is `ambiguous`. Never treat reviewer e-mail or `anonymous@event` as a participant. Production resolution remains disabled until dedicated service credentials are configured. | [camera#724](https://github.com/moldovancsaba/camera/issues/724), [sso#143](https://github.com/moldovancsaba/sso/issues/143), SSO#137 |
| Fanmass local file/backups and Mongo backup policy | Keep an explicit unknown receipt and block complete status until the operator inventory is verified. | Fanmass#130, Camera#727, SSO#141 |
| Messmass report caches, generated exports, independent Atlas backups | Tombstone per-photo rows, rebuild projections, inspect exports/backups, and replay tombstones after restore. | Messmass#505, Camera#727, SSO#141 |
| Audit retention and PDF evidence retention | Retain only an opaque case/target receipt, outcome, times, and policy codes for the period approved by the owner/legal policy. Do not retain deleted identifiers in the evidence PDF. | SSO#140, SSO#141 |

## Evidence and verification protocol

- Source review is reproducible with `git rev-parse origin/main` in each repository and the paths cited above.
- Production checks must use targeted counts/projections only after explicit operational approval. Do not attach raw e-mails, Facebook IDs, image URLs, or image payloads to issues or this document.
- Every deletion target needs before/after existence checks scoped to the exact opaque reference, media-provider confirmation where available, and retry state. A failed/unknown target keeps the case `partial` or `retrying`.
- A restored backup must apply the durable deletion fence before application reads or exports resume. A tombstone is not an excuse to rehydrate the original PII into normal collections.
- This document contains no claim that a production deletion, provider purge, backup copy, database migration, or restore drill has run.

## Change control

Update this inventory whenever a new user/photo store, external provider, export, log field, cache, backup, or identity join is added or retired. The owning repo must update its local contract and generated source inventory in the same change. Camera#723 is read-only discovery; the verified proof contract is merged as SSO#143, Camera#724's resolver is in implementation, and remaining work is tracked on Project #76.
