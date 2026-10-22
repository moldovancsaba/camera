# Participant contact, eligibility, and erasure

**Status:** current Camera contract, 2026-10-22

## Contact is one lifecycle

Each participant photo has one canonical `guestContact` state on its Camera submission:

| Status | Meaning | Can be vetted, published, or analyzed? |
|---|---|---|
| `awaiting_contact` | No final participant contact was saved. A social account ID alone is not an e-mail address. | No |
| `draft` | The participant is still entering or correcting contact details. A draft is not a final recipient. | No |
| `complete` | A valid typed e-mail or valid social-login e-mail was saved. | Yes, subject to the separate required-consent, retention, vetting, and image-health gates |
| `erased` | Contact and image retention have ended; identity fields and image references are removed. | No |

The canonical shape is `{ status, source, name, email, updatedAt, completedAt }`. `userInfo`, `userInfoDraft`, `userEmail`, and `userName` remain compatibility fields for older pages and mail code. New writes update the canonical state and the necessary compatibility mirrors together. A canonical state overrides stale mirrors. `anonymous@event`, `admin@upload`, and `unknown@unknown.com` are placeholders, never participant addresses.

## Eligibility and ownership

- Camera captures the photo and records event ID, partner ID, consent evidence, contact state, retention deadline, and vetting status.
- A submission with no finalized contact is marked `retentionStatus: pending_erasure` at capture, remains hidden from participant gallery, vetting, and Camera analysis results, and cannot be decided through the review API.
- Fanmass independently discovers Atlas records. Its Atlas-side projection calculates only `guestContactEligible: true|false`; the task itself contains no name, e-mail, login ID, or consent text. Fanmass still applies Camera's independent consent, retention, vetting, image, and event-link gates.
- Messmass receives only the finalized per-photo analytics envelope and the required event/partner/photo IDs. It does not receive participant contact data.
- An authenticated account ID without a usable e-mail remains `awaiting_contact`; an account cannot clear the 24-hour hold by itself.

For legacy submissions with no canonical contact, Camera may recognize a valid saved `userInfo.email`, or a valid top-level account e-mail only when the record belongs to a non-anonymous account and has no unfinished draft. A top-level `userEmail` on an anonymous record is never trusted because older moderation code could put the reviewer's address there. Fanmass evaluates the same fallback conditions on Atlas and emits only the boolean eligibility result.

## Consent and deletion

Consent and contact are independent gates. A contact-complete photo without verifiable required-consent evidence cannot be vetted, published, or analyzed. An absent or unverifiable consent audit means no consent: Camera revokes visibility and starts deletion on the cleanup pass. Explicitly pending required consent remains private until its configured consent deadline; incomplete contact separately expires 24 hours after capture.

Vercel Cron calls `/api/internal/purge-unconsented-captures` every 15 minutes. It requires `CRON_SECRET`; when that secret is not configured, the route fails closed and cleanup is disabled. Each batch handles expired or unverifiable consent records before identity-only erasure retries, so a large identity backlog cannot starve no-consent deletion. The route atomically claims due records, deletes recorded stored image copies, removes contact/consent/photo-review identity data, and records an erasure state. Failed external-file deletions stay retryable; a retry is required before Camera marks that image erase complete. `analyticsDeletion` distinguishes `automatic_no_login` from `automatic_other` and manual deletion.

For ImgBB, a 404 from the delete link is only treated as complete when a follow-up `HEAD` confirms the public image URL also returns 404 or 410. An invalid delete link while the image is still reachable remains a retryable deletion failure.

The current path controls application visibility and durable deletion requests. It does not make public Blob or ImgBB URLs access-controlled before deletion completes. ImgBB is public and does not count as a private disaster-recovery copy.

## Operator checks

1. Before approving an item, check that Camera shows a finalized participant e-mail or a valid registered account contact.
2. A contact hold or expired photo is not an exception to the consent and publication gates.
3. Use the Camera Photo analysis page for Fanmass result correction/confirmation; do not write `Submission.people` or `peopleReview` manual annotations.
4. For legacy cleanup or backfill, generate and review a dry-run inventory first. Never infer a participant address from a reviewer address, a display name, or an anonymous placeholder.

See [Photo vetting](PHOTO_VETTING_PLAN.md), [Fanmass results in Camera](FANMASS_RESULTS_IN_CAMERA.md), and the [Camera Atlas integration contract](MESSMASS_FANMASS_INTEGRATION.md).
