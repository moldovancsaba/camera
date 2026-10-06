# Photo vetting by default: plan

Status: **plan, not started.** Written 2026-10-06 after the client request below. Open questions are at the end; nothing is built
until they are answered. Related: `docs/DEFAULT_FRAME_PLAN.md` (the frames), `RUNBOOK.md` ("How the photo is taken, and what is kept").

## The request

Owner, 2026-10-06, passing on a client request: by design every event should have vetting required, so that the final result
appears on the photo sharing page only after vetting. This needs a different guest journey: while vetting is on, the image with
the rendered frame is not shown, so that an unwanted guest photo never carries the brand; the guest sees the photo with the 50%
transparent shapes instead.

## What exists today (checked in the code, 2026-10-06)

- **Vetting exists only for try-on results.** `event.tryOn.vettingEnabled` (default on), `submission.reviewStatus`
  (`pending_review | approved | rejected`), the queue at `/admin/events/[id]/vetting` and `/admin/tryon/vetting`, approve / reject /
  great / service routes under `app/api/admin/tryon-results/*` (they need a **global admin**), and an audit trail
  (`lib/tryon/moderation-audit.ts`).
- **A plain photo (`submissionKind: 'original'`) is never reviewed.** `POST /api/submissions` stores it with
  `isShareVisible = shareOptIn` (the checkbox defaults to ticked) and no `reviewStatus`. Photos added by the admin gallery upload
  have neither field.
- **The guest's photo is public the moment it is saved.** The branded composite is built in the browser, uploaded to Blob (plus a
  best-effort imgbb mirror, a third-party public host), and its URL is returned to the guest and linked from `/share/<id>`.
  The share id is the Mongo `_id` (guessable), not a secret.
- **Surfaces that can show or send a saved photo** (from a read-only audit; the starred rows were re-checked by hand):

| # | Surface | Public? | Review check for plain photos today |
|---|---|---|---|
| 1* | Share page `/share/[id]` | yes | none (only the event's "show camera result" toggle) |
| 2* | Share page Open Graph / Twitter image (link previews) | yes | none, and it also exposes pending or rejected try-on results |
| 3 | Share download `/api/share/[id]/download` | yes | same as 1 |
| 4 | `POST /api/submissions` response (URLs to the guest) | yes | creates the photo; also queues a try-on job with the raw photo |
| 5 | Slideshow playlist `/api/slideshows/[id]/playlist` and the players | yes | none for plain photos |
| 6 | `/api/slideshows/[id]/next-candidate` | yes | no review, kind or eligibility filter at all (no in-repo caller) |
| 7* | `/users/[name]` | yes | none: lists every submission of a name, including archived and hidden |
| 8* | savetheworld pledge wall `/api/internal/savetheworld/pledges` | service secret, feeds a public page | only `isShareVisible === true`, which defaults to true |
| 9* | savetheworld `publish-selfies` | service secret | bulk-sets `isShareVisible` on every unflagged photo |
| 10* | fanmass media feed | service secret, external system | none; sends the private full-size original when one exists |
| 11 | Guest result email | to the guest | links to `/share/<id>`; "after save" is sent when the guest finishes; readiness only checks that an image exists |
| 12 | Greatest hits `/greatest-hits/[slug]` | yes | strict (try-on only, approved + visible + great): safe |
| 13 | Admin gallery, partner page, submissions list, event export | admin / manager | no review filter, which is right for a moderation view; needs a pending badge |
| 14 | Admin gallery upload | manager | creates photos with no status: must be approved explicitly |

- Blob and imgbb URLs stay fetchable by anyone who has them, whatever the database says; "hidden" only holds for pages that read the database.
- **Two of these are leaks even without this project:** the share page's link-preview image shows any photo including pending or
  rejected try-on results, and `next-candidate` has no filter. They are fixed in the first work package.

## The journey

**Vetting off** (an event that switches it off): exactly as today.

**Vetting required** (the new default):

1. Capture and zoom / pan: unchanged. The boxes of the frame already show as 50% black shapes in the zoom step.
2. **Preview:** the guest sees their framed-size photo with the **50% black shapes**, not the real frame, with a line such as
   "Your photo will get its frame after it has been approved." Button as today ("Love it").
3. **Save:** the browser sends the plain framed-size photo (no frame, no shapes) and the shapes picture. The submission is
   `pending_review`. No branded composite exists yet, nothing is mirrored to imgbb, no share link is shown as ready, and no "photo
   is ready" email goes out.
4. **Waiting screen:** thank-you with the shapes picture (only in the guest's own browser) and "We will tell you when it is approved"
   (an email if the guest gave one). The share link shows a waiting page: no photo for anyone else.
5. **Approval** (admin or the client's manager): the **server** composes the photo with the frame image the photo recorded (the
   generated variant, or the event's own frame) with the existing `sharp` composer, stores the real composite, flips the photo to
   `approved`, visible and slideshow-eligible, applies the pledge-wall rule, and sends the "your photo is ready" email.
6. **Rejection:** the photo stays private, the share page says it was not approved and offers "Take another photo"; no composite is ever made.

This keeps the rule the client cares about: the brand's frame is never put on a photo nobody approved, and never exists as a file
before approval.

## Decisions proposed (to confirm)

| # | Decision | Why |
|---|---|---|
| V-1 | One shared rule, `isPubliclyVisible(photo, event)`, used by every surface in the table | four copies of the filter today, and gaps |
| V-2 | New event setting `photoVetting.required`, default **true** for new events (creation and messmass / savetheworld provisioning) and switched on for the existing events by a dry-run-first backfill; separate from `tryOn.vettingEnabled` | the client wants it by design; try-on keeps its own rule |
| V-3 | Plain photos get `reviewStatus`; **existing photos are backfilled `approved`** (a missing status never means pending) | history stays visible, nothing disappears by surprise |
| V-4 | Pending photo stored as an unlisted Blob object under `pending/<eventId>/<random>`, never mirrored to imgbb, never returned by a public route; the real composite is made at approval | the brand is never on an unvetted photo; no third-party copy |
| V-5 | Shapes: for a generated frame, the stored layer boxes; for an event's own frame, a darkened silhouette of the frame's non-transparent parts (computed from the PNG), so the guest still sees roughly where things go | needs a decision (question 4) |
| V-6 | Opaque share token for new photos (`/share/<token>`), old `/share/<id>` links keep working for old photos | the Mongo id is guessable; pending pages should not be enumerable |
| V-7 | Pages for a pending or rejected photo are `noindex` and send no Open Graph image | previews must not leak |
| V-8 | Moderation: one queue for photos next to the try-on queue (`/admin/events/[id]/vetting`), approve / reject, bulk approve, keyboard friendly, audit trail; manager roles (not only global admin) can vet their events | the client's staff must be able to do it |
| V-9 | Every downstream feed takes approved photos only: slideshows, `/users/[name]`, pledge wall, `publish-selfies`, fanmass feed, emails, the manual email script | all of them show or send photos today without a check |
| V-10 | Try-on keeps its own vetting; the try-on job is held until the source photo is approved (no cost for rejected photos); a try-on result is only public when both are approved | avoids publishing a result of an unapproved photo |

## Work packages

| # | Package | Depends on | Notes |
|---|---|---|---|
| V1 | **Close today's leaks and add the shared rule** (`isPubliclyVisible`, "legacy and missing status are visible"): link-preview image, `next-candidate`, `/users/[name]`, share page and download use it. No change for approved or legacy photos | none | independent of the rest, can ship first |
| V2 | Data model, event setting and defaults: `photoVetting` on events and in provisioning, `reviewStatus` and pending fields on photos, indexes, backfills (photos to `approved`, events to `required`) with a dry run | V1 | owner reviews the dry run |
| V3 | Guest journey: shapes preview (generated and own frames), pending save (two uploads), waiting screen, off-state unchanged | V2 | Playwright on the viewport matrix and a phone |
| V4 | `POST /api/submissions`: pending storage, no mirror, no share link or email, try-on held | V2 | route tests |
| V5 | Approval pipeline: server composition, publish flags, wall rule, "photo ready" email, rejection | V4 | uses the `sharp` composer and the recorded frame image |
| V6 | Moderation UI for photos, event setting in the editor, roles | V5 | GDS components |
| V7 | Public pages: share page states (waiting / not approved / approved), `noindex`, download, share token | V1, V4 | |
| V8 | Feeds: savetheworld wall and `publish-selfies`, fanmass, slideshows, emails, the manual email script, admin badges | V1, V5 | |
| V9 | Rollout: dry run, owner review, enable by default, RUNBOOK, release notes, first-day checks | all | |

Testing: unit tests for the rule and the event default; route tests for the pending save and the approval; a browser run of the
whole journey (capture, waiting, approve, share page, email) on the viewport matrix; a check per surface that a pending photo
cannot be seen; the owner's phone test.

## Risks and notes

- Guests at a live event wait for approval: the waiting page should refresh itself, and the queue should be quick to work
  (bulk approve, notification to the vetters). An unvetted event shows nothing on the share page, which is the point.
- Photos that already have a public composite (all existing ones) are not touched by the backfill; hiding one is the existing
  "remove from event" action, and V1 makes that action effective on the share page as well.
- Deleting a pending photo must delete its private file (the file-deletion helper covers the composite and the original today).
- The shapes picture shows the guest's own photo; it is kept in the guest's browser and in the moderation queue, not on a public page.
- `ensure-indexes.ts` has an index on `{eventId, submissionKind, isSlideshowEligible, isArchived, createdAt}` that gains `reviewStatus`.

## Open questions

See the message that came with this plan; the answers are recorded here once given.
