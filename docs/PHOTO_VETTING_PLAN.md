# Photo vetting by default: plan

> **Written before the try-on removal (issue 557, 2026-10-10).** Where this document mentions try-on, it describes the app as it was on its date; the integration has been removed from the app, see [TRYON_REMOVED.md](TRYON_REMOVED.md). Read those places as history.

Status: **plan, decisions confirmed by the owner on 2026-10-06 (below); work packages not started.** Related: `docs/DEFAULT_FRAME_PLAN.md` (the frames), `RUNBOOK.md` ("How the photo is taken, and what is kept").

## The request

Owner, 2026-10-06, passing on a client request: by design every event should have vetting required, so that the final result
appears on the photo sharing page only after vetting. This needs a different guest journey: while vetting is on, the image with
the rendered frame is not shown, so that an unwanted guest photo never carries the brand; the guest sees the photo with the 50%
transparent shapes instead.

## Decisions confirmed by the owner (2026-10-06)

| # | Question | Owner's answer | What it means |
|---|---|---|---|
| 1 | Vetting required for all new events and switched on for all existing events, with a per-event off switch only global admins can use | yes | `photoVetting.required` defaults to true everywhere; backfill of the 238 existing events (dry run first) |
| 2 | Who may vet | event managers and above | partner Events managers and global admins can approve and reject photos of their events |
| 3 | What others see while a photo waits; how the guest learns | "guest images gets the link via email as registered users, every event has a requirement for email or social login" | the share link is only given to the guest by email once the photo is approved; until then the share link shows a waiting message and no photo; **every event requires an email or a social login** (new work package V3) |
| 4 | Events with their own frame | same for any frame, following 3 | the shapes picture and the delivery are the same for every kind of frame (own frames show a darkened silhouette of the frame) |
| 5 | After approval | see 3 | email to the registered guest |
| 6 | Rejected photos | yes | "not approved" on the page with "Take another photo"; read literally ("is a rejection email needed too?" yes) the guest also gets a short rejection email, easy to switch off |
| 7 | Existing photos | yes | all existing photos are marked approved |
| 8 | Try-on | yes, with their frame as well | the try-on job waits for the source photo's approval; a try-on result is public only when approved, and its frame is put on at approval as for photos |
| 9 | Share links | yes | new photos get an opaque share token; old links keep working for old photos |

Everything else in the plan stands as written (pledge wall, slideshows, fanmass feed and emails get approved photos only).

**Identity today, from the production database:** only 7 of 238 events have an active "who are you" page (name and email, or Google / Facebook
login through SSO); 229 have no custom pages at all, and provisioning from messmass and savetheworld creates none. 1,179 of 1,574 saved
photos carry an email. So "every event requires an email or a social login" is a requirement still to build, not the current state.

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

0. **Identity first (every event):** the guest gives an email or logs in with a social login (Google or Facebook through SSO) before the photo is saved, so the approval email has an address.
1. Capture and zoom / pan: unchanged. The boxes of the frame already show as 50% black shapes in the zoom step.
2. **Preview and save, one screen (camera#344):** the zoom screen shows the guest's photo with the **50% black shapes**, not the real
   frame, with the line "Your photo will get its frame after it has been approved." above the buttons. **Continue saves the photo**; there is
   no separate "Love it" screen any more (planning item 90), and no pledge wall choice (item 91, the consent covers it).
3. **Save:** the browser sends the plain framed-size photo (no frame, no shapes); the shapes are drawn in the browser from the frame's layer boxes (or, for an own frame, from a silhouette made from the frame image), so there is no second upload. The submission is
   `pending_review`. No branded composite exists yet, nothing is mirrored to imgbb, no share link is shown as ready, and no "photo
   is ready" email goes out.
4. **Waiting screen:** thank-you with the shapes picture (only in the guest's own browser) and "We will email you the link when it is
   approved". The share link shows a waiting page: no photo for anyone else.
5. **Approval** (admin or the client's manager): the **server** composes the photo with the frame image the photo recorded (the
   generated variant, or the event's own frame) with the existing `sharp` composer, stores the real composite, flips the photo to
   `approved`, visible and slideshow-eligible, applies the pledge-wall rule, and sends the "your photo is ready" email.
6. **Rejection:** the photo stays private, the share page says it was not approved and offers "Take another photo", the guest gets a short
   rejection email; no composite is ever made.

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
| V-8 | Moderation: one queue for photos next to the try-on queue (`/admin/events/[id]/vetting`), approve / reject, bulk approve, keyboard friendly, audit trail; event managers and global admins can vet their events (owner, 2026-10-06) | the client's staff must be able to do it |
| V-9 | Every downstream feed takes approved photos only: slideshows, `/users/[name]`, pledge wall, `publish-selfies`, fanmass feed, emails, the manual email script | all of them show or send photos today without a check |
| V-10 | Try-on keeps its own vetting; the try-on job is held until the source photo is approved (no cost for rejected photos); a try-on result is only public when both are approved, and its frame is put on at approval, as for photos (owner, 2026-10-06) | avoids publishing a result of an unapproved photo |

## Work packages

Epic: [camera#261](https://github.com/moldovancsaba/camera/issues/261). Status of each package is kept in its issue and on the board.

| # | Package | Depends on | Notes |
|---|---|---|---|
| V1 [camera#262](https://github.com/moldovancsaba/camera/issues/262) | **Close today's leaks and add the shared rule** (`isPubliclyVisible`, "legacy and missing status are visible"): link-preview image, `next-candidate`, `/users/[name]`, share page and download use it. No change for approved or legacy photos | none | independent of the rest; **merged** ([camera#272](https://github.com/moldovancsaba/camera/pull/272), live and checked on five real photos) |
| V2 [camera#263](https://github.com/moldovancsaba/camera/issues/263) | **Built, inert until V10 (indexes and the backfills run in V10):** Data model, event setting and defaults: `photoVetting` on events and in provisioning, `reviewStatus` and pending fields on photos, indexes, backfills (photos to `approved`, events to `required`) with a dry run | V1 | owner reviews the dry run |
| V3 [camera#264](https://github.com/moldovancsaba/camera/issues/264) | **Identity on every event, built and inert until V10 (the backfill runs in V10):** a default "who are you" page (email or Google / Facebook login) for new events and by provisioning, a backfill for the 231 events without one (dry run first), and enforcement at capture: with vetting required a photo cannot be saved without an email or a login | V2 | see the open question on unverified email |
| V4 [camera#265](https://github.com/moldovancsaba/camera/issues/265) | **Built, inert until V10:** Guest journey: shapes preview (generated frames and own frames), pending save (one upload), waiting screen, off-state unchanged | V2, V3 | Playwright on the viewport matrix and a phone |
| V5 [camera#266](https://github.com/moldovancsaba/camera/issues/266) | **Built, inert until V10:** `POST /api/submissions`: pending storage, no mirror, no share link or email, try-on held | V2 | route tests |
| V6 [camera#267](https://github.com/moldovancsaba/camera/issues/267) | **Built, inert until V10 (the queue page that calls it is V7):** Approval pipeline: server composition (photos and try-on results, recorded frame image), publish flags, wall rule, "photo ready" and "not approved" emails, rejection | V5 | uses the `sharp` composer |
| V7 [camera#268](https://github.com/moldovancsaba/camera/issues/268) | **Built, inert until V10 (photos are vetted in the event's Vetting tab, `/admin/events/<id>/vetting`, next to the try-on results: vetting is one place):** Moderation UI for photos, event setting in the editor, roles (event managers and above) | V6 | GDS components |
| V8 [camera#269](https://github.com/moldovancsaba/camera/issues/269) | **Built, inert until V10:** Public pages: share page states (waiting / not approved / approved), `noindex`, download, share token | V1, V5 | |
| V9 [camera#270](https://github.com/moldovancsaba/camera/issues/270) | **Built, inert until V10:** Feeds: savetheworld wall and `publish-selfies`, fanmass, slideshows, emails, the manual email script, admin badges | V1, V6 | |
| V10 [camera#271](https://github.com/moldovancsaba/camera/issues/271) | **Tool built; the runs wait for the owner's test and go-ahead:** Rollout: dry runs, owner review, enable by default, RUNBOOK, release notes, first-day checks | all | |

Testing: unit tests for the rule and the event default; route tests for the pending save and the approval; a browser run of the
whole journey (capture, waiting, approve, share page, email) on the viewport matrix; a check per surface that a pending photo
cannot be seen; the owner's phone test.

## Risks and notes

- **Approval waits only for Vercel Blob (camera#342).** The imgbb courtesy copy of an uploaded picture is waited for at most 5 seconds; imgbb can be slow or closed without notice. A decision locks only its own photo and the page reloads its data after every decision, so a slow or lost answer never leaves the moderator on a stale page.

- Guests at a live event wait for approval: the waiting page should refresh itself, and the queue should be quick to work
  (bulk approve, notification to the vetters). An unvetted event shows nothing on the share page, which is the point.
  **The approver's Waiting list looks for new photos by itself every 10 seconds** (camera#373, `lib/photo-vetting/auto-refresh.ts`): only the Waiting list, only while the page is
  on screen, never while a decision is in flight or a reason for a rejection is being written. Until 2026-10-08 it refreshed only after a decision, so a new photo needed a reload.
- Photos that already have a public composite (all existing ones) are not touched by the backfill; hiding one is the existing
  "remove from event" action, and V1 makes that action effective on the share page as well.
- Deleting a pending photo must delete its private file (the file-deletion helper covers the composite and the original today).
- The shapes picture shows the guest's own photo; it is kept in the guest's browser and in the moderation queue, not on a public page.
- `ensure-indexes.ts` has an index on `{eventId, submissionKind, isSlideshowEligible, isArchived, createdAt}` that gains `reviewStatus`.

## Marking the people in a photo (issue 542, owner request 2026-10-10)

The owner's sketch (six screens, VETTING 1 to 6): a vetting view where the photo is big, the reviewer draws a rectangle around each person, says who it is with 16 emoji buttons, marks the next person, and when they have identified what they can, goes on to approve or decline. What is marked is attached to the photo and used for the analytics.

- **The big view** (`/admin/events/<id>/vetting/review`, `components/admin/PhotoReviewStage.tsx`; the button **Review one by one** on the Vetting tab): the photos that wait, oldest first, one at a time, as big as the screen allows. **Clicker** starts a mark; the reviewer draws a rectangle (a mouse or a finger; a tap or a sliver is not a rectangle; **Retry** draws again); **Next** takes the rectangle and shows the 16 buttons; **Done** keeps the person and **Clicker** marks the next, **Cancel** throws the one in progress away, **Remove** takes the last person off; **Next** goes on to the decision (marking is **required**, owner answer 263: with nobody marked the button is **Nobody in this photo**, which saves an empty list, so every photo decided here has been looked at), where **Approve** and **Reject** (with an optional reason) are the same call as the queue's (`POST /api/admin/submissions/<id>/review`). The 16 buttons come over the photo when it is tall enough to hold them and under it on a phone held upright.
- **The 16 buttons** (`lib/photo-vetting/people.ts`, one table the screens, the check and the counts all read): **who**, one of 8 (female or male, kid, young, adult, old: 👶 👧 👩 👵 / 👶 👦 🧔 👴), **emotion**, one of 4 (☹️ sad, 😒 unamused, 😃 happy, 🤬 angry), **merchandise**, any of 4 (🧢 cap, 🧣 scarf, 🎽 jersey, 🇭🇺 flag; the owner replaced "other merchandise" with the scarf, answer 262). A person needs the *who*; emotion and merchandise are optional.
- **Stored with the photo:** `Submission.people` = a list of `{ id, box: { x, y, w, h } in percent of the photo, gender, age, emotion?, merch? }` and `peopleReview = { by, at }`; **an empty list means looked at, nobody marked**, a missing field means nobody looked. Saved by `PUT /api/admin/submissions/<id>/people` (the same rights as the review: global admins and the event's Events managers) before the decision, so it is kept even if the decision fails; at most 40 people, every value checked against the table.
- **On for every event, a switch per event to turn it off (owner answer 264, "everywhere"):** `Event.markPeopleInVetting` is read as **on unless it is `false`** (`markPeopleOn`, nothing is written to any event, so every event, the live one included, has marking from the moment this is released). The switch is on the Vetting tab next to the vetting switch (`PATCH /api/events/<id>`, global admins only); off, the big view is only the big photo and the decision.
- **Required everywhere (owner answers 263 and 267, "deliver it now"):** a waiting photo cannot get its first decision without a look. **In the big view** the way on is at least one person marked, or **Nobody in this photo**. **On the Vetting tab** (marking on, Waiting list) a card has one button, **Review**, which opens the big view at that photo (`?photo=<id>`; the others follow, oldest first), and there is no quick Approve or Reject, no selection and no bulk approval; **Review one by one** is on the top line. **On the server** `POST /api/admin/submissions/<id>/review` refuses (409, "Mark the people in this photo first (or say nobody is in it)") a first decision of a waiting photo whose `peopleReview` is missing, so an old open page cannot skip it. **Not covered, on purpose:** the Rejected list keeps its Approve (a photo decided before, possibly before marking existed, can be approved again), and an event whose marking switch is off is exactly as before.
- **For the analytics:** `summarizePeople` counts people, photos looked at, who, emotion and merchandise; the card **People marked in the photos** on the Vetting tab shows it. The same counts are the base of the rebuilt Analytics menu and of the messmass counters (docs/ANALYTICS_AUDIT.md, decisions 244 and 246).
- **Not done:** a keyboard way to draw (the marking needs a mouse or a finger), marking on the grid cards, editing the people of an already approved photo, and the analytics by day and by event across events.

## Open questions

1. **Is a typed email enough, or must it be verified?** The existing "who are you" page offers a typed name and email ("pseudo
   registration") and Google / Facebook login through SSO. A typed address is unverified: a guest could type someone else's address and
   that person would get the approval or rejection email. Recommendation: accept a typed email as the existing page does, send only
   short fixed-text emails, rate-limit them, and add a verification step later if abuse shows up. (Owner's answer: pending.)
2. The rejection email follows a literal reading of answer 6; say so if no email should go out.
