# Guest contact lifecycle and incomplete-capture erasure

Updated 2026-10-19. This is the canonical description of how Camera treats a
guest's contact details and the selfie captured before the contact step.

## The rule

Camera stores the selfie as soon as capture succeeds so the journey can survive
the next page and a same-tab social-login redirect. That does **not** make it
eligible for review or analysis. Until a valid guest contact is finalized, the
submission is private and excluded from moderation, Camera analytics, event
galleries, public pages, and Fanmass. If the guest does not finish contact in
24 hours from capture, Camera deletes the selfie and its stored copies.

## One canonical contact lifecycle

| Field | Purpose | Authoritative? |
|---|---|---|
| `guestContact.status` | `awaiting_contact`, `draft`, `complete`, or `erased` | Yes; gates all guest-photo processing |
| `guestContact.source` | `typed_email`, `social_login`, `legacy`, or null | Yes; explains how final contact was obtained |
| `guestContact.name`, `guestContact.email` | Finalized guest contact; null until finalization and cleared at erasure | Yes |
| `guestContact.updatedAt`, `completedAt` | Lifecycle timestamps | Yes |
| `userInfoDraft` | Temporary values typed into an unfinished contact form | No; never makes a photo eligible |
| `userInfo`, `userEmail`, `userName` | Compatibility mirrors for older exports, templates, and integrations | No; new code must resolve through `guestContactOf` |
| `userId` | Authenticated account identifier | No; it does not replace a valid contact address |
| `metadata.identityStatus` | Legacy display/analytics summary (`CONTACT_PENDING`, `ERASED`, etc.) | No; do not use it for eligibility |
| `erasure.status` | `scheduled`, `deleting`, or `complete` | Yes; excludes scheduled/deleting/erased records |
| `analyticsDeletion` | Minimal outcome (`automatic_no_login`, `automatic_other`, or `manual`) | Yes for aggregate deletion counts only |

`anonymous@event`, `anonymous@event.com`, and `admin@upload` are placeholders,
never guest addresses. They must never be displayed as an address or used as an
email recipient.

## State transitions

1. **Capture without finalized contact**: write `guestContact.status=awaiting_contact`,
   `reviewStatus=awaiting_contact`, `isShareVisible=false`, and
   `erasure.status=scheduled` with a deadline exactly 24 hours after capture.
   A partial form save may set `guestContact.status=draft` and `userInfoDraft`,
   but leaves the erasure deadline unchanged and does not enable processing.
2. **Contact completed**: typed email or social login atomically writes
   `guestContact.status=complete`, the source/name/email and completion time,
   mirrors the older contact fields, and removes the scheduled erasure. Only
   then can the photo enter the event's configured review/publication flow.
3. **24-hour deadline**: the cron atomically changes `scheduled` to `deleting`,
   deletes every owned Blob and ImgBB copy, and retries if any delete fails. It
   then clears contact, image URLs/copies, annotations, review history, consent
   details, email metadata, and Fanmass intake state. It retains only the event
   references, capture time/method, a completed erasure marker, and the
   `automatic_no_login` aggregate outcome.

The owner-checked contact/restore endpoint refuses contact completion at or
after the deadline or while deletion is in progress. This makes the deadline
race deterministic: either contact completion removes the scheduled erasure
first, or erasure claims the submission first and contact can no longer attach.

## Storage boundary

The current `pending/` upload uses the project's existing public Vercel Blob
store with a random, unlisted URL. Camera does not return that URL to public
routes or hand the photo to moderators, analytics, or Fanmass before contact,
but anyone who obtains the raw URL can open the image directly. Do not describe
this as storage-level private. A strict requirement that even a leaked URL be
unreadable needs a Vercel Private Blob store, an authenticated image-delivery
path for Camera reviewers and processing services, and a deployment token/store
configuration. See [Vercel Private Blob storage](https://vercel.com/docs/vercel-blob/private-storage).

## Shared eligibility rule

`lib/submissions/guest-contact.ts` is the shared implementation of
`guestContactOf`, `canProcessSubmission`, and Mongo eligibility filters. A
contact-incomplete capture is excluded from:

- the Waiting/Rejected/Approved moderation queues and every decision endpoint;
- vetting-time marking and the separate Photo analysis list/save endpoints;
- Camera's photo analytics (until the image is erased, when only the deletion
  outcome may be counted);
- event galleries and global submission inventory;
- public sharing, slideshows, and the Camera-to-Fanmass feed/claim path.

Admin-uploaded gallery artwork is a separate source and does not require guest
contact. Legacy submissions are read through the old fields only when no new
canonical lifecycle has been written; placeholders do not pass that fallback.

## Operational notes

- The existing `purge-unconsented-captures` Vercel cron runs every 15 minutes
  with `CRON_SECRET`; it handles both missing required consent and incomplete
  guest contact. Image cleanup is file-first and retries failures.
- `analyticsDeletion=automatic_no_login` is not retained selfie analysis. It
  contributes only to deletion totals after `erasure.status=complete`.
- A browser closing does not notify the server. Camera therefore starts the
  24-hour clock at successful capture and uses absence of contact completion
  as the reliable signal that the journey was abandoned.
- New writes mirror final contact for old code, but unfinished drafts never
  populate the compatibility fields. New reads should use `guestContactOf`.
