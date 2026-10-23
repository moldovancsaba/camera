# Camera verified-subject resolver

**Contract:** `privacy.erasure.camera-resolver.v1`  
**Owner:** Camera  
**Dependency:** merged SSO case-bound proof endpoint from [SSO #143](https://github.com/moldovancsaba/sso/issues/143)  
**Status:** implementation; runtime remains fail-closed until operations configures the two service credentials below.

## Boundary and ownership

SSO verifies the request, resolves a Facebook subject to an SSO account, and stores the verified erasure case. Camera owns the submissions and resolves that case to Camera photo references. Camera never accepts an e-mail, Facebook ID, account ID, or provider assertion from the caller. It accepts only the opaque SSO request ID, then fetches the case-bound proof from SSO with its dedicated machine client. Camera queries its own submission database read-only and returns product references only. Fanmass receives no identity or contact data from this API.

## Runtime flow

1. SSO's erasure coordinator sends `POST /api/internal/privacy/resolve-subject` with `x-camera-privacy-resolver-secret` and `{ "request_id": "<SSO case UUID>", "limit": 100, "cursor": "<optional signed cursor>" }`.
2. Camera authenticates the dedicated resolver secret, rate-limits the request, and validates the closed request schema.
3. Camera obtains a short-lived SSO `client_credentials` token with only `sso:privacy.resolve`. The OAuth client ID must exactly match SSO's `SSO_PRIVACY_RESOLVER_CLIENT_ID` allowlist value.
4. Camera requests `GET /api/internal/privacy/requests/{requestId}?includeSubject=true`. SSO releases proof only for a verified and approved case and the exact resolver client.
5. Camera performs indexed, exact lookups. It excludes admin gallery uploads and never uses reviewer/decision-actor fields. Exact account ID matches can be combined with an SSO-verified, normalized address match. A different stable account attached to that verified address makes the result ambiguous; no IDs are returned for that case.
6. Camera returns opaque photo, submission, event, and partner references plus the non-identifying match basis. The response never contains contact details, raw provider IDs, image URLs, or image payloads.
7. SSO gathers every page. `complete: true` is the only indication that the resolver snapshot has finished; a partial page must never be dispatched as the complete product target set.

## Matching rules

- `sso_user`: exact `userId`; optionally exact normalized e-mail only when SSO supplies `proof: "sso_account_email_verified"`.
- `camera_photo`: exact `submissionId` and, when valid, exact Mongo `_id`.
- Canonical e-mail uses `guestContact.status === "complete"` and `guestContact.email`.
- Legacy `userInfo.email` is eligible only when there is no canonical contact record and the contact was finalized or has no draft. Legacy e-mail fields use a case-insensitive indexed collation; SSO account IDs remain case-sensitive anchored lookups.
- Legacy top-level `userEmail` is eligible only for non-anonymous accounts without a draft. `anonymous@event`, `anonymous@event.com`, `admin@upload`, and `unknown@unknown.com` are never proof.
- Names, event timing, reviewer e-mail, `reviewedBy`, `approvedBy`, `reviewHistory`, and free-text moderation notes are never identity keys.
- A missing proof, unsupported subject kind, unresolved Facebook-to-SSO mapping, unapproved case, or conflicting account mapping fails closed. The resolver does not guess.

## API contract

Successful read responses use `{ success: true, data: { version: 1, request_id, status, candidate_count, matches, complete, ... } }`.

`matches[]` is limited to:

```json
{
  "photo_id": "<Camera Mongo submission _id>",
  "submission_id": "<Camera submission UUID or photo ID fallback>",
  "event_ids": ["<Camera event ID>"],
  "partner_id": "<Camera partner ID or null>",
  "basis": "sso_account_id | verified_email | camera_photo_id"
}
```

States are `resolved`, `no_match`, `ambiguous`, `invalid_proof`, and `temporarily_unavailable`. Ambiguity returns an empty `matches` array and a bounded reason code. The first page snapshots the highest matching Mongo ObjectId; subsequent cursors are HMAC-signed, case-bound, and capped at 100 results. Replaying a page is read-only and deterministic while source rows are unchanged. Callers may retry `503` and `429` with bounded backoff; malformed requests receive `400`, missing resolver credentials receive `403`, and the endpoint does not mutate submissions.

## Authentication and configuration

Camera requires:

- `CAMERA_PRIVACY_RESOLVER_SECRET`: high-entropy, purpose-limited secret shared only with SSO's erasure coordinator, sent in `x-camera-privacy-resolver-secret`.
- `SSO_PRIVACY_RESOLVER_CLIENT_ID` and `SSO_PRIVACY_RESOLVER_CLIENT_SECRET`: dedicated confidential OAuth client used only by Camera to fetch subject proof from SSO. Its ID must equal SSO's `SSO_PRIVACY_RESOLVER_CLIENT_ID`; allow only `sso:privacy.resolve`.
- `SSO_BASE_URL`: canonical SSO origin. Production requires HTTPS.

Missing or mismatched configuration fails closed. These variables are documented only; this change does not read, set, rotate, or expose production secret values. Do not reuse the broad Messmass, Fanmass, or savetheworld secrets.

## Storage and operations

`npm run db:ensure-indexes` creates case-insensitive indexes for canonical and legacy participant e-mail fields while preserving the existing binary indexes. MongoDB supports same-key indexes with distinct collations when they have distinct names; the resolver passes the matching collation so those indexes remain usable. The resolver uses the existing account index with a case-sensitive anchored lookup. Index provisioning is an owner-controlled operational step; this PR does not run it against production.

Logs use fixed event names and phase/outcome codes. They must not include the request body's identity proof, e-mail, Facebook ID, token, image URL, or response body. SSO outbound calls have 5-second deadlines; an expired SSO token is refreshed once. Database/SSO failures return `503` and do not produce a partial-success claim. The request is safe to retry because it is read-only.

## Verification and recovery

- Focused contract tests: `node --import tsx lib/privacy/subject-resolver.test.ts` and `node --experimental-test-module-mocks --import tsx app/api/internal/privacy/resolve-subject/route.test.ts`.
- Full repository gate: `npm run release:check` plus `npm run inventory:check`.
- Recovery: disable SSO's resolver caller or remove its dedicated caller secret. The route fails closed. No submission, image, contact, consent, Fanmass result, or report is changed by resolver rollback.
- This lookup does not establish that a photo's Blob/ImgBB copies, backup copies, Fanmass derivatives, or Messmass projections have been erased. Those remain product erasure steps; backup restore/replay coverage is blocked on Camera #509 and the sequenced #727 work.
