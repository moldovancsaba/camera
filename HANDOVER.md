# Handover

**Version**: 12.3.42
**Last Updated**: 2026-10-11

`RELEASE_NOTES.md` is kept current on every release and is the detailed record;
this file is the short current-state summary. Previous rewrite: 2026-08-17
(v2.23.0 era); everything from v12.2.0 to v12.3.37 is in `RELEASE_NOTES.md`.
Open work is tracked on the GitHub project board, not in this file (next section).

## Status 2026-10-11, end of day (v12.3.42)

One page to start from: **what is done, what happens next, what is still not delivered but needed.** The detail of each item is in `RELEASE_NOTES.md` (the "v12.3.42" entry and the "Unreleased" entries below it); the open work and its order is the board (project #24, **Order** column; rules and waves in `docs/EXECUTION_ORDER.md`). Live state at the end of the day: all five repos on 12.3.42, `main` green in all five, the only open camera pull request is the held try-on draft #576, the MTK x Vasas event read-only unchanged (device camera mode, vetting required, 5 pages, journey recording on).

### 1. Done since 12.3.41 (all merged, all live)
1. **Fleet release 12.3.42** in camera, messmass, fanmass, try-on and savetheworld (version-only in the four; `docs/_audit/fleet-version-policy.md` in messmass).
2. **Analytics, phases 1 and 2** (issue 521): the Analytics menu rebuilt on the data that exists; the anonymous **journey recording** with a kill switch on the Journey tab; no IP address and no full user agent stored with a photo any more (`docs/ANALYTICS.md`, `docs/JOURNEY_RECORDING.md`, `docs/PRIVACY_DATA.md`).
3. **Consent settings** (issue 558): every kind of checkbox is shown or not and required or optional, per partner, event and checkbox; the public gallery permission is a setting; the sentence says "public campaign wall". No setting is stored, so no event changed.
4. **Camera mode** selector (device, live, still, frame) and **marking the people** in each photo at vetting (required in the big view and on the server), both live.
5. **Try-on removed from the camera app** except the guest path (R0, R1, R2, R4 merged; R3 is the held draft #576, issue 579); `docs/TRYON_REMOVED.md`, tag `tryon-integration-final`.
6. **Outbound deadlines and outcome logs** (issue 178), **long links in e-mails** (issue 382), **the follow-up e-mail job** (issue 559; built and dormant), **Hungarian for the pages above the event** (issue 352).
7. **Welcome page screen and default slideshow** (issues 326, 327): the redraw after an editor's change, the backfill card for existing events (not run), the **stadium backgrounds** and **QR texts** libraries (empty), and the slideshow's **look at the crossfade** (`?crossfade=1`) and **reload guard**. #476 (the slideshow freeze) is complete on main; the crossfade is off until a slideshow ticks it.
8. **Tooling and rules:** the stable inventory and `npm run sync:main`, the playbook `docs/PR_AND_MERGE_PLAYBOOK.md` (why green pull requests could not merge, why conflicts happened, what the permission system refuses, the lessons of the fleet release), CLAUDE.md sections 3, 5 and 10, the dependency audit (`docs/DEPENDENCIES.md`), the obsolete and deprecated sweep, the CI actions moved to Node 24 versions in all five repos, the messmass drift register re-verified (80 entries).
9. **messmass guides:** approving photos, camera mode, analytics, checkbox settings, gallery permission, sample selfies, giant screen, and one for the stadium backgrounds and QR texts.
10. **Image safety (issue 509, PRs 609 and 612, 2026-10-12):** approval no longer loses the unframed photo: it is copied to ImgBB, read back, and only after that verified copy is the private Blob file deleted (owner decision 295, "variant B"); every copy is recorded on the submission (`Submission.imageCopies`); deleting a submission deletes every recorded copy. The admin card **Image safety** on the Slideshows page counts where every picture is held (a dry run that writes nothing), checks addresses, and runs bounded batches that copy ImgBB-only pictures into our store and finish the unframed copies. **Not run:** the owner reads the count first (test plan T53 to T55); the run needs room in the Blob store (T03).
11. **Client feedback of 2026-10-12:** the camera hint line no longer sits under the shutter and the waiting page uses a big window (PR 620, issues 618 and 619); the admin's saved and failed notices are drawn (PR 622, issue 229: they were invisible before, not even read to screen readers); the design-system server-entry finding is reported upstream (general-design-system issue 942).
12. **Dependencies:** camera 622 to 581 packages and no advisory (PRs 610, 611, 613), messmass and sso lose the sprintf-js alerts at the root (PRs 478, 479, 131, 132), messmass jest crash worked around (`--no-sparkplug`, a Node 24.19 V8 bug), CI runs on `ubuntu-26.04` (tried).

### 2. Next required steps, in time order
**Before the match (Friday 2026-10-16); the capture path, the live giant screen and the approver's screens are frozen from Wednesday 14 October, fixes found in the rehearsal only:**
1. **The approver (issue 373, owner tasks 403 to 407):** add the MTK approver as a partner user; share the approver guide and the Hungarian text review sheet with MTK; rehearse approving on a throw-away event under MTK Budapest that is not linked to messmass (the recipe is the 2026-10-08 comment on issue 373; not on the savetheworld event, its wall is live); the phone checks that a desktop cannot confirm (issue 406: the one photo screen after the shutter, vetting on a phone, the colours of the user flow, the Hungarian pages, the guided tour switch, the default consent and login pages, the event editor pages and the brand colours panel), plus the camera ways, marking in the big view and the beacons on a real iPhone; the first real upload on the new Images pages (issue 407; not on the match event's welcome page).
2. **Two small answers:** the label of the MTK welcome page button, START or INDÍTÁS (issue 409); MTK's Hungarian text suggestions when they arrive (issue 410).
3. **Owner platform steps:** delete the eight Vercel variables of the removed integration (`docs/TRYON_REMOVED.md`, 3.11; `CRON_SECRET` stays); run `npm run db:ensure-indexes` once (the 30-day journey retention); align the privacy notice with `docs/PRIVACY_DATA.md`; decide what to do with the IP addresses and user agents stored with earlier photos (`scripts/count-stored-photo-addresses.ts` counts them, read-only); the Vercel dashboard Node setting (issue 182).
4. **Look at the crossfade** on a spare screen (`/slideshow/<id>?crossfade=1`); nothing is saved.
5. **Do not** run the welcome-screen backfill, switch the follow-up e-mail on, or merge #576 before the match.

**On the day (issue 271, first-day checks):** an MTK person approves live; watch the Vercel runtime logs (`camera.slideshow_diagnostic`, the `reload held` lines, the outbound outcome lines); the journey recording can be switched off from the Journey tab within 30 seconds if anything looks wrong.

**After the match (from Saturday 2026-10-17), in this order:**
1. Server also refuses the standard required checkboxes (issue 578, owner answer 349): then turn `ENFORCE_STANDARD_REQUIREMENTS` on (the switch is off now, so nothing is refused).
2. Try-on R3 (PR 576, issue 579) and the cleanup that goes with it (issue 561: the original-upload route and its claim handling, `ORIGINAL_UPLOAD_ENDPOINT`, `npm run blob:orphans`, the old logo fields and routes, `config/leather-suits.example.json`, the 8 places listed on PR 594). Only on the owner's go.
3. The welcome-screen backfill for existing events: the dry run first, then the events the owner names (issues 326, 327); the screen-sized pictures backfill of existing photos (#476 S7, its card on the Slideshows page).
4. `CRON_SECRET` on the Vercel project (issue 529): until then the follow-up e-mail job and the weekly activity log mail answer 403.
5. The admin kit, the gate and the fail-safe snapshot (issues 415, 418, 421), then the page defaults 3a, 3b, 3f (issues 330, 333, 339), the welcome page composition (issue 412) and the rest of the default slideshow and global defaults (issues 326, 327, 332).
6. Then the I cards and the P cards in Order.

### 3. Not delivered yet, but needed
1. **Needed for legal and privacy:** the server-side enforcement of required checkboxes (578); the privacy notice matching `docs/PRIVACY_DATA.md`; the decision about old IP addresses; the profile across events (purposes A, B and C decided on 2026-10-10 in `docs/PROFILE_PURPOSE_AND_CONSENT_DRAFT.md`, the texts are Dictionary drafts and are shown nowhere, the profile itself, its consent checkbox, the user's page to see, export and delete it, and the 24-month deletion job are **not built**).
2. **Needed so the service runs by itself:** `CRON_SECRET` (529); the follow-up e-mail's test send with a real address; the messmass route and the triggers and switch for the push of the journey counters (the counters stay off until the owner decides).
3. **Analytics phase 3 (issue 521):** which QR or poster a visit came from, plays by hour, sign-ins by provider, the fixed decline reasons.
4. **Storage beyond the first fix (issue 509 and owner decision 295):** done: the unframed crop is kept until its ImgBB copy is verified, every copy is recorded, and the card exists. Not done: R2 as the primary store and the media domain, the third copy at another provider, the manifest collection with its retrying queue and nightly verification, the 90-day retention deletion of unframed photos on ImgBB, the original-size picture, and the scheduled scan for gone pictures (needs `CRON_SECRET`). The first run of the card is the owner's decision after reading its count (T53 to T55).
5. **Vetting:** the approver chooses the rejection reason (442), a keyboard way to mark people, an accessibility audit, editing the people of an approved photo (560).
6. **Layouts and messages at an event** (epic 444: S6 to S9, issues 450 to 453, 331); **a partner URL** (374); the **library audit leftovers** (393 to 396).
7. **Selfie in the photo window:** the remaining steps (issues 540, 328).
8. **Testing and hardening:** the fake-camera test harness and a canary rollout (205, 213), the export end-to-end proof (198), image optimizer hosts, SSO hardening, the environment prefix decision, react-hooks rules (193 to 196), the capture module overhaul (203, 207).
9. **Design system:** GDS work packages A and B and the upstream tracker (185 to 187), the owner decisions D1 to D10 (188), the sidebar row height on the deployed admin (184), camera's own tour onto the GDS tour (S22).
10. **In messmass:** report-config legacy partner field (430), deprecated code (465), the Bitly status endpoint that may fail on the strict database connection (469, **check first**), the other drift findings (470), messmass still on GDS 6.3.0.
11. **Roadmap, later:** the try-on add-on and image.direct (camera 189, 190, 192; image.direct 14 to 43; try-on 51, 52), the default event frame backfill (231, 238), the ideabank (323 to 325 are future options: the stage showing the event logo and teams, more kinds of bricks, an event language setting, a Known issues menu, fonts and colours as library items, a garment library, an app icon per event, `public/fff`).

### 4. Rules in force
1. **Merging:** after `Verify` and the full local chain with the real exit code; one `gh pr merge` per command, by the lead; a live guest-path, giant-screen, consent or production-data pull request only after the owner names it in chat; when a command is refused, stop and tell the owner (`docs/PR_AND_MERGE_PLAYBOOK.md`, CLAUDE.md section 10).
2. **Production data:** no test data into production messmass, no database read with the `.env` credentials from here, live looks are read-only (`curl`, the guest event answer needs `?audience=guest`).
3. **The 19 October runner change:** `ubuntu-latest` starts moving to Ubuntu 26.04 on 2026-10-19. Camera's `Verify` was run on `ubuntu-26.04` on 2026-10-12 and passed, so the workflow stays unpinned; the other four repos were not tried (a one-line throwaway pull request each); if a `Verify` fails for the image, pin `runs-on: ubuntu-24.04` until it is understood.
4. **Numbering:** every list and question sent to the owner is numbered from the continuous register; the owner answers by number.

## Status 2026-10-10 (v12.3.41)

- **Version 12.3.41 (fleet release 2026-10-10, owner answer 265):** camera, messmass, fanmass and try-on carry 12.3.41 (savetheworld has since 2026-10-05); everything since 12.3.40 is in `RELEASE_NOTES.md` under "v12.3.41" and the dated "Unreleased" entries below it. Marking the people at vetting is **on for every event and required before a first decision** (issue 542, answers 262 to 264 and 267), and the **camera mode** is a setting on the partner and on the event (issue 547, answer 253); no event has a camera choice stored, so none changed.

- **Public gallery permission (issue [#554](https://github.com/moldovancsaba/camera/issues/554), owner answer 283, replaces camera#429):** a setting, not a rule: the partner has a default (ask or not), the event follows or chooses (the consent page settings in the journey editor); when it asks, one optional unticked checkbox sits above Continue in the reframe step and only a ticked box puts the photo on the wall, kept as versioned evidence (`Submission.publicGalleryConsent`); the server decides from the event's setting. Standard: do not ask, so no event changed. The wording is the Dictionary texts `share.publicGalleryConsent` and `share.publicGalleryConsentHelp`; whoever can edit it validates it (answer 251).

- **Wave 1 of the execution order (2026-10-10; the order is the board's Order column and `docs/EXECUTION_ORDER.md`):**
  - **Analytics phase 1 is live** (issue 521, PRs 567 and 572): the event's Analytics tab and the all-events page `/admin/analytics`, on the data that exists; `docs/ANALYTICS.md` has every figure, its definition and source, and what is not measured (it waits for phase 2: journey recording and the photo IP change, after the match). The counters for messmass are prepared and OFF (setting `admin_settings.messmass-counters`, no caller, no screen, no messmass `photo-stats` route yet); the first real push is the owner's decision. Owner step: look at the Analytics tab of a real event (it needs a login).
  - **Try-on is removed from the camera app** (issue 557, PRs 564, 568, 574, 575 live; the guest-path phase is PR 576, green and held until after the match): `docs/TRYON_REMOVED.md`, the tag `tryon-integration-final`. `/admin/tryon/vetting` is now `/admin/vetting` and the old address and the messmass link redirect; nothing was deleted from the database. **Owner steps:** delete the 8 Vercel variables listed in `docs/TRYON_REMOVED.md` section 3.11 (`CRON_SECRET` stays); decide later about the stored try-on data, files, collections and indexes (section 5).
  - **Outbound timeouts and logs** (issue 178, PR 563) and **long links in e-mails** (issue 382, PR 565) are live. Owner decision pending: keep or drop the messmass login push, from the `messmass.session_push` counts in the runtime logs after a few days (RUNBOOK); the permission calls in `lib/auth/sso-permissions.ts` are still unbounded; the real-phone mail check of 382.
  - **The follow-up e-mail a week after the event is built and dormant** (issue 559, PR 570): no event has it on, and its daily cron (07:00 UTC) and the activity log's weekly cron both answer 403 until `CRON_SECRET` is set on the Vercel project (issue 529, important). To use it: switch it on in an event's or a partner's Emails page (the event needs a date), press "Count what would be sent" in Settings > Emails, then Send now or set `CRON_SECRET`. Owner decisions pending: an unsubscribe, a separate opt-in, the window (day 7 to day 21).
  - **Hungarian for the pages above the event** (issue 352, PR 573) and the closing of the cards the audit found delivered (answer 313).

- **Checkbox settings are live** (issue 558, owner answer 297; PRs 566, 569, 571): every kind of checkbox is shown or not and required or optional, set at the partner, the event and per checkbox; **no setting is stored anywhere, so no live event changed** (proven by tests that run the same inputs through the frozen old logic and the new, golden markup of the guest pages, and 70 + 44 browser checks; a read-only look at the MTK guest answer shows it unchanged). Setting something in the partner or event editor changes the guest pages at once, and "Required" is also enforced by the server. Owner decisions: the server also refusing the standard required checkboxes **after the match** (answer 349, issue 578, one switch `ENFORCE_STANDARD_REQUIREMENTS`, off now); validating the new Dictionary wording (`accept.optional`, `share.publicGalleryConsentRequired`, `share.publicGalleryConsentHelpRequired`, `err.consentRequired`, `err.galleryRequired`; answer 251). Page defaults 3a and 3b are done, 3f has no checkbox (step 2 stays deferred). Known: the partner editor overflows a phone width because of the long option texts of its Camera select (pre-existing).

- **Analytics phase 2 is live** (issue 521, owner answer 346 "now"; PRs 580, 582, 581): anonymous **journey recording** (the capture page, the camera, the share page and the download send small fire-and-forget records; no IP address, user agent, cookie or person; daily counts kept, raw rows 30 days) with the **Journey** tab and the seven journey counters (computed, still off for messmass); and **no IP address and no full user agent is stored with a photo any more** (decision 243; a coarse device class and a browser family instead; nothing stored was deleted). **Kill switch:** the Journey tab ("Switch the recording off", global admins) or `PATCH /api/admin/settings/journey-recording`; recording is ON by default; it takes effect within 30 s without a deploy. A read-only look after the deployment: the MTK guest answer carries `journeyRecording:true` and its journey, consent boxes and gallery setting are unchanged. **Owner steps:** run `npm run db:ensure-indexes` once (the 30-day retention index; the first write also creates it); decide what to do with the IP addresses and user agents of earlier photos (`scripts/count-stored-photo-addresses.ts` counts them, read-only); the privacy notice must match `docs/PRIVACY_DATA.md`; the first real iPhone run of the beacons. **Open:** which QR or poster a visit came from, plays by hour, sign-ins by provider, the fixed decline reasons, the messmass `photo-stats` route and the triggers and switch for the push (the counters stay off until the owner decides).
- **#476 slideshow freeze: complete on main** (the crossfade S4b off until seen, S8b reload every 3 hours, S7 screen pictures with the owner's backfill of 361, no partial index by owner answer 213 a). The function region is iad1 (from `x-vercel-id`; owner reads the Atlas and Blob regions). Caution: every save in the slideshow editor reloads open screens, and the screen reloads itself every 3 hours.

- **Parallel work in worktrees (2026-10-11):** use `npm run sync:main` before the last push; the generated `docs/_audit/*.json` are stable (no timestamp, commit or counts); a worktree under `.claude` is fine for `inventory:check`. The long story of what failed and why (including why `gh pr merge` failed: GitHub's up-to-date rule and the permission system) is `docs/PR_AND_MERGE_PLAYBOOK.md`; the short rules are CLAUDE.md sections 3, 5 and 10. **Open:** sync the scanner patch to messmass, fanmass, try-on and savetheworld as one coordinated change (issue 383 box 2); try-on's route `file` values carry line numbers (still a conflict source there).
- **Dependencies (2026-10-11):** audited and cleaned (`docs/DEPENDENCIES.md`): no production advisory in camera or messmass; owner decisions pending: the Vercel Node setting (issue 182) and the major updates listed there (ESLint 10, Next 16.4, Mantine 9, archiver 8, TypeScript 7), messmass on GDS 6.3.0.

## Status 2026-10-09

The board ([#24](https://github.com/users/moldovancsaba/projects/24)) is the single source of truth for open work and its status; this section only says where the decisions and the code are.

- **Marking the people at vetting (issue [#542](https://github.com/moldovancsaba/camera/issues/542), owner request 2026-10-10):** built: the big vetting view with Clicker, rectangle, the 16 emoji buttons and the decision (`docs/PHOTO_VETTING_PLAN.md`, section Marking the people), saved as `Submission.people`, counted on the Vetting tab. **On for every event** (owner answer 264; `markPeopleOn`: on unless `Event.markPeopleInVetting` is false, global admin switch) and **required before the first decision of a waiting photo** (answers 263 and 267): in the big view (a person, or Nobody in this photo), on the Waiting cards (one Review button that opens the big view at that photo; no quick Approve or Reject, no bulk approval) and on the server (the review route answers 409 without `peopleReview`). The Rejected list keeps its Approve. Merchandise: cap, scarf, jersey, flag (answer 262).
- **Sample selfies (issue [#540](https://github.com/moldovancsaba/camera/issues/540), owner request 2026-10-10, answers 255 to 260; the plan is `docs/WELCOME_SCREEN_PHOTO_PLAN.md`):** steps 1 to 5 of the plan are built: the library image tag, Libraries > Sample selfies, the `selfie` slot at partner and event (a global default set on top) with its routes, the partner's panel, and the welcome page screen's photo window taking the event's pick (`docs/LIBRARIES.md`, `docs/SCREEN_DESIGN.md`; the event card **Welcome page screen**). With no active global sample selfie nothing changes on any event; the event's own photos (a clean upload with the frame, an approved photo as it is) are the third choice on the card; steps 6 to 8 (the latest approved photo, the live stage's empty state, the guide) after the match.
- **Journey editor order (issue [#535](https://github.com/moldovancsaba/camera/issues/535), owner 2026-10-10):** step 1 delivered: the default pages (welcome, consent, Who-are-you) have up and down, their places are `Event.defaultPageOrders`; step 2 delivered: the checkbox **Submit is part of this page** on the Take Photo page; unticked, the pages between the photo and a Submit row run before the photo is saved (a login by the name and e-mail form, a CTA); nothing changes unless an editor unticks it. Open question to the owner: keeping the photo across a social sign-in (Google, Facebook) in that place.
- **Broken pictures everywhere (issue [#514](https://github.com/moldovancsaba/camera/issues/514), owner answer 229):** `lib/media/pictures.ts` + `picture_health` check logos, frames, page pictures, the screen overlay and the e-mail pictures like photos; the guest event API, the theme loader (e-mails, share page) and the playlist leave a gone one out; card on the Slideshows page; daily cron `/api/internal/pictures-scan` (needs `CRON_SECRET`, issue 529). Owner answers of 2026-10-10 ("yes to all" on 224-246) are in the issues; nothing in the live capture path changes before the match.
- **Screen and gallery feedback of 2026-10-09 (issues [#515](https://github.com/moldovancsaba/camera/issues/515), [#520](https://github.com/moldovancsaba/camera/issues/520), [#488](https://github.com/moldovancsaba/camera/issues/488)):** the address written under the photos is the event's own short address and one line that fills its box (`ScreenDesignText.fit`, which ignores the stored size; `lib/slideshow/screen-design.ts` `fitSize`), a refused slideshow save names the part that is wrong and is logged (`slideshow.save_refused`), every slideshow save reloads the open screens, the welcome page's giant screen is redrawn from the default slideshow on every save (also for an event that had none), and the gallery's no-frame banner is not cut off and its button confirms in the page, frames five at a time and shows progress and errors (`lib/gallery/frame-batches.ts`). **Queued by the owner, in order:** the activity log with a weekly CSV to the owner (issue #517, questions 233 to 236) and the analytics audit and rebuild (issue below, owner 2026-10-09). The owner's definition of done is in `CLAUDE.md` section 3.
- **Camera views (issue [#525](https://github.com/moldovancsaba/camera/issues/525), owner 2026-10-09):** portrait or landscape and wide or tight on the live view, opt-in with `?views=1` on the capture link (`lib/camera/view.ts`, `CameraCapture` `viewControls`), and since issue [#547](https://github.com/moldovancsaba/camera/issues/547) a **setting** with four ways (automatic, live with view buttons, live with a real sensor photo, live with the screen picture): a selector on the partner and on the event (`lib/camera/mode.ts`; the event's own, else the partner's, else automatic; owner answers 253 and 272). No event has a choice stored, so none changes until the owner chooses (RUNBOOK, "The four front-camera views").
- **Acceptance on the Who-are-you page (issue [#523](https://github.com/moldovancsaba/camera/issues/523), client feedback 2026-10-09):** the consent page as one small checkbox with the client's single sentence on the Who-are-you page, everything off until ticked, one setting (`Event.acceptanceOnWhoAreYou`) shown by both page editors; off until an editor turns it on (docs/JOURNEY_DEFAULT_PAGES.md). It also fixes consents lost across a Google/Facebook sign-in (`lib/capture/consent-memory.ts`). Not yet on any event: the owner turns it on for MTK and looks at it on the phone.
- **Activity log (issue [#517](https://github.com/moldovancsaba/camera/issues/517), owner 2026-10-09):** what the people who manage the service do and every refused or failed request, who and when (`lib/activity/*`, written by `withErrorHandler` on the production deployment), a weekly CSV mailed to moldovancsaba@gmail.com (cron Mondays 06:00 UTC, `/api/internal/activity-export`), the records of the previous export deleted after it (RUNBOOK). **Owner step: set `CRON_SECRET` on project 04_camera**; **Settings > Activity log** has Send now.
- **The brick model (epic [#412](https://github.com/moldovancsaba/camera/issues/412), owner decisions of 2026-10-09):** every element an event needs is one of five bricks (Words, Picture, Look, Link, Switch) or a composition of them, chosen **at the place of use**, the default by default; the options are use the default, upload, select from the parent's library, replace, add more; one item is used, several are picked at random; a level stores only what the editor set (no copies), the parent's value is the children's default, a new messmass logo replaces the imported default and goes down. Reference: `docs/BUILDING_BRICKS.md` (model, mandatory pages, recipes, editor re-organisation, the order of 139 in ten steps). The 477-element inventory it rests on: `docs/ELEMENT_INVENTORY.md` with the records in `docs/_research/element-inventory/`.
- **Logo on the slot model (step 4, issue #419), done 2026-10-09:** the logo pages on the slot panel, new events on the model, a new messmass logo replacing the earlier, the random pick, and the migration of the real data (190 partners collected, 213 events on the model, 100 events newly show their partner's logo, nothing lost; `docs/LIBRARIES.md`). Remaining: the owner's look, then the clean-up of the old fields.
- **Delivered:** the research (#413), the first form of the messmass logo default (#414, to be replaced by step 4), the repair of 213 undefined design tokens and a gate against them (#416, issue #415), the journey view in the page editor (#420, issue #378, described in `docs/JOURNEY_DEFAULT_PAGES.md`), the slot resolver `lib/slots/resolve.ts` (#422, issue #418).
- **Fail-safe gate (step 4b, issue #421), done so far:** an event on the slot model keeps a last-known-good snapshot of the logos it uses (`Event.slotSnapshots`, `lib/slots/snapshot.ts`), a logo the library lost is still served (marked `lost`) and shown in the editor with **Keep as own** and **Remove** (PRs #431, #436). Remaining: the same for frames and the partner's pages, archive instead of delete, the daily picture check, a backfill of snapshots (owner's go).
- **Default slideshow (step 7a, issues #326 and #327), done 2026-10-09:** every new event gets a generated default slideshow (stage layout `lib/screen/default-stage.ts`, picture in the event's colours, tracked "Giant screen" link as the QR code, a call to action from the dictionary, the written address; `lib/slideshow/default-slideshow.ts`, `Slideshow.isDefault`; "Create the default slideshow" and "Make default" on the slideshows list; `docs/SCREEN_DESIGN.md`). **Existing events get none until the owner says so.** I do 7 and 8 before 5 and 6 (`docs/BUILDING_BRICKS.md` section 8).
- **Welcome page screen (step 8, issue #327), done 2026-10-09 (PRs #433, #434):** the picture drawn from the default slideshow is `Event.welcomeScreen` (`lib/screen/welcome-screen*.ts`); the capture page shows it on any welcome page without its own picture; a default welcome page for events that get the journey defaults, have the picture and no own welcome page. **No existing event has the picture** (the dry run `backfill-default-dryrun` found 210 of 212 events with no welcome page, 4 of them upcoming), so a backfill needs the owner's go (question 180).
- **Contextual sidebar (issue #426, PR #435):** inside an event or partner the sidebar shows that item's menu (`lib/adminNavigation.ts`, `components/admin/AdminChrome.tsx`), Back to the main menu first; the event tab bar is gone; a test fails when a page of an event or partner is not in its menu.
- **Text levels (step 6, issue #353, `docs/TEXT_LEVELS.md`):** the Dictionary (global), a partner's Texts and an event's Texts give every default text another wording; nearest level wins; the capture app, the default pages, the public photo page, the approval and CTA texts read them. The partner has a default language an event with none follows. Not yet: the e-mails, the tour.
- **Layout and message selection at an event (epic [#444](https://github.com/moldovancsaba/camera/issues/444), mandatory for the MTK x Vasas match on 2026-10-16):** `docs/FRAME_LAYOUT_SELECTION_PLAN.md`. Segment S1 (#445) is the event setting `frameSelection` (layout and message, each *editor chooses / random / user chooses*; panel on the event's Frames page; `lib/frame/selection*.ts`); the message-only `frameChoice` of issue #329 is gone from the editor. S3 (#449, messages on several designs, table in the generated frame panel) and S2 (#446, the capture flow: design step, message step, Change design / Change message, a new draw at every photo; `lib/frame/choose.ts`) are built; S5 (#447, the dark area: `lib/frame/dark-area.ts`, one general method for every event since the owner's answer 193); the designs' dark area can be the mask of the generated frame (`FrameDesign.darkArea`, answers 194/195, chosen per event in the generated frame panel) and S4 (#448, previews of the layouts in the selection panel) are built; S6 and the rest follow after the match.
- **The e-mails to the user (epic [#463](https://github.com/moldovancsaba/camera/issues/463), client feedback 2026-10-09, the owner's next focus):** triaged in `docs/EMAIL_FORMAT_PLAN.md`: one rich format, one legal part with three levels (general, partner, event), an Emails menu, an editor, variables; segments E1 to E8 (#464 to #469, #473, #474) are built and merged except the follow-up job (owner answer 203: its text and switch existed, nothing sent it; the daily job was built later, issue 559, see the status of 2026-10-10 above): the five types (`lib/email/types.ts`), the format, variables, legal part with three levels, the toolbar editor and preview, the Emails pages (general, partner, event), welcome and arrived triggers, the test e-mail. The owner steps left: `npm run db:ensure-indexes` once (the `email_registrations` index), and the user guide in messmass. The e-mail **picture block** (a picture, optionally a link, as a paragraph of its own; the Picture button on the event's message; [#376](https://github.com/moldovancsaba/camera/issues/376)) is built. The social login buttons in the brand's look are built in a separate pull request ([#462](https://github.com/moldovancsaba/camera/issues/462)).
- **Slideshow freeze (issue [#476](https://github.com/moldovancsaba/camera/issues/476), client feedback 2026-10-09):** the investigation and research are in `docs/_research/SLIDESHOW_FREEZE_RESEARCH.md` (most likely cause: the refill appends copies of the next photo in fixed order; second: unbounded requests and a single-flight lock). Steps S1 to S8b are delivered (the entries below, newest first).
  - **CTA page picture (issue #491, owner report 209, 2026-10-09):** the picture fits the page keeping its aspect ratio, the title/text and the buttons can be hidden, the whole picture can be a link (`lib/capture/cta-layout.ts`, `CTAPage`, three checkboxes in the pages editor); the editor guide is written with the other guides in one messmass PR.
  - **Pinch zoom on the journey pages (issue #490, owner report 208, 2026-10-09):** the lock was only ever on the camera steps; the welcome, who-are-you, CTA and restart pages are now locked against zoom only (`lib/capture/page-lock.ts`, `AppShellLock zoomOnly`), the consent page stays zoomable. Needs the owner's phone check before the issue is closed.
  - **Default slideshow (issue #487, owner report 206, 2026-10-09; the call to action line of this entry was taken out again by issue 515 the same day: one address line, `docs/SCREEN_DESIGN.md`):** the call to action is now the big text under the photos with the address below it, the QR code sits alone and centred in its panel (`DEFAULT_STAGE`: `ctaText`, `urlText`, `qr`); double-click and F toggle full screen (the separate corner button added here was taken out again by PR 510: the player's own transparent control bar along the bottom has pause and Full screen). The existing default slideshow (a test event of 2026-10-09) keeps its old layout. The editor guide comes in the one messmass PR.
  - **Sign-in buttons in their brand colours (issue #462, client feedback 2026-10-09):** Google (white, thin grey border, the four-colour G) and Facebook (the Facebook blue, white f), large, side by side where there is room and stacked on a phone (`components/auth/BrandSignInButton.tsx`, tokens `SOCIAL_*` in `lib/gds/tokens/colors.ts`); the GDS `ProviderIdentityButton` is no longer used here. A phone check by the owner closes it.
  - **Event gallery (issue #488, owner report 207, 2026-10-09), first part:** its own **Gallery** page and menu entry, separate from the overview (`app/admin/events/[id]/gallery/page.tsx`), easy multiple selection (Shift+click range, dragged box, Select mode, Ctrl+A, Esc; `lib/gallery/selection.ts`) with the research in `docs/_research/GALLERY_MULTISELECT_RESEARCH.md`. **Second part (frames):** the option to add the event's frame when uploading and **Add the frame to N selected** for photos already there (`lib/gallery/frame.ts`, routes `gallery-upload` and `gallery-frame`); the guide in messmass is still to write.
  - **Step S7 (screen pictures) delivered 2026-10-09 (branch `feat/screen-pictures`, owner answer 211 b):** `lib/submissions/screen-picture.ts`, `Submission.screenImageUrl`, hooks at approval and at creation, the playlist prefers it, deleted with the submission; `scripts/backfill-screen-pictures.ts` (dry run by default). **The backfill of existing photos needs the owner's go** (dry run: 352 photos, 157.6 MB, samples at 14 % of the size).
  - **Step S4b (crossfade) delivered 2026-10-09 (branch `feat/slideshow-crossfade`, owner answer 210 a):** `Slideshow.crossfade`, **off by default**, the **Crossfade** checkbox in the slideshow editor; two picture layers, the next fades in over the one before. **Owner step: look at it on a test screen, then switch it on per slideshow.**
  - **Step S8b (reload every 3 hours + admin button) delivered 2026-10-09 (branch `feat/slideshow-reload`, owner answer 212):** `lib/slideshow/reload.ts`, `POST /api/slideshows/<id>/reload`, `Slideshow.reloadRequestedAt`, `reloadToken` in the playlist answer, the **Reload the screen** button on the slideshow card.
  - **Step S8a (the screen recovers by itself) delivered 2026-10-09 (branch `fix/slideshow-watchdog`):** stall -> next slide, a minute -> reload (full-screen page, 3 per 10 minutes), wake lock, operator checklist in `RUNBOOK.md`.
  - **Step S5 (faster start) delivered 2026-10-09 (branch `fix/slideshow-fast-start`):** the show starts on the first 2 slides and the screen design's picture (about 1.65 s instead of about 6.0 s on a modelled slow link), the rest of the first answer joins the queue as it loads; settings are set when the show starts (no slide counted as played during the loading screen).
  - **Step S4a (the preload is the request the screen uses) delivered 2026-10-09 (branch `fix/slideshow-same-request`):** no `crossOrigin` on the preload (a CORS preload made the browser fetch every picture twice; measured on Chrome 152), low priority in the background, the first 3 slides decoded ahead. S4b (the two-layer crossfade) followed, see above.
  - **Step S6 (cheaper playlist call) delivered 2026-10-09 (branch `fix/playlist-server-cost`):** the pool query keeps only the fields a slide needs before it sorts, the inactive-accounts list is cached for a minute, the per-slide log line is gone. Still needs the owner: the partial index, the function region.
  - **Step S3 (bounded waits) delivered 2026-10-09 (branch `fix/slideshow-bounded-waits`):** `lib/slideshow/resilience.ts` and `preload.ts`; no request or picture load waits without limit, a hung picture or playlist call no longer stops the refill, the start retries by itself.
  - **Step S1 (diagnostics) delivered 2026-10-09 (branch `feat/slideshow-diagnostics`):** the screen reports what it does to `/api/observability/slideshow-diagnostic` (logged as `camera.slideshow_diagnostic`), `?debug=1` shows a corner panel, the playlist route has `Server-Timing` and a slow-call warning; how to read it is in `RUNBOOK.md`.
  - **Step S2 (queue fix) delivered 2026-10-09 (branch `fix/slideshow-queue`):** `lib/slideshow/queue.ts` + `queue.test.ts`, the player sends `exclude` and appends only slides it does not hold, a full queue asks nothing.
- **Next, in order:** the e-mails reading the text levels, step 5 (pictures on slots, library tags, the sample selfies), #331 (toggles and positions on uploaded frames), the shared admin kit (#418) and the rest of the workspaces (#412 step 10), the clean-up of the old logo fields (owner's go).
- **Not done on purpose:** the clean-up of the old logo fields and routes (the owner's go); a backfill of default slideshows for existing events (the owner's go); the owner has not yet looked at the admin screens after the token repair or at the journey view on a real event (acceptance of #415 and #378).
- **Findings to remember:** the GDS role tokens declared with `light-dark()` (`--gds-border-card`, `--gds-text-meta`, `--gds-bg-*`) do not resolve in the production build (Lightning CSS turns them into variables nothing defines), so admin code uses `--mantine-*` tokens and `scripts/check-gds-boundaries.mjs` refuses an undefined `--gds-*` name or a `light-dark()` role token (`gds_fix_handover.md`, update of 2026-10-09). To be reported to GDS (not done: another repository).
- **Working rules that cost time:** a worktree directory must not be named `tokens` or `theme` (the GDS colour rule skips such paths, so a local run hides what CI reports; see `CLAUDE.md` section 5); issue numbers in script comments are written `issue 123`, not `#123`.

## Status 2026-10-06

- **`main`** is `fe43367`: CI `Verify` green and deployed to production.
  `package.json` is still 12.3.40; everything since is in `RELEASE_NOTES.md`
  under "Unreleased" and dated headings (strict share opt-in for savetheworld,
  bounded SSO revoke and messmass push, axios 1.20.0, operator-managed try-on
  prompt snapshots).
- **Where the work is tracked:** project board
  [#24](https://github.com/users/moldovancsaba/projects/24), rebuilt on
  2026-10-05. Open work is camera issues #177-#198 plus the image.direct and
  try-on issues placed on it. `TASKLIST.md` and `ROADMAP.md` now point to the
  board instead of duplicating it.
- **Licence:** MIT (`LICENSE`, #176), "Copyright (c) 2026 moldovancsaba". The
  vendored CatVTON licence question belongs to the try-on repo (try-on#51).
- **image.direct** (superseded 2026-10-10: removed with the try-on integration, issue 557; `docs/IMAGE_DIRECT_INTEGRATION.md` is a record) was being introduced as a second renderer next to try-on
  (owner decision 2026-10-05: alongside; try-on stays paused and is retired only
  after a consented canary and sign-off). Camera has the gated result callback,
  setup-owned prompts and immutable prompt snapshots; it does not yet have the
  dispatch/outbox, a per-event renderer setting, admission metadata
  (input hashes, sizes, consent record) or reconciliation and health. Every gate
  is off and nothing dispatches. Tracker camera#189; contract and current
  state: `docs/IMAGE_DIRECT_INTEGRATION.md`. try-on#52 tracks a precondition for
  any re-enable: the legacy worker's claim query has no `renderer` filter and
  would claim image.direct jobs.
- **Camera module overhaul (owner-approved 2026-10-06):** black photos about 25%
  of the time (rate differs by device and browser), only a slice of the camera
  view used, back camera first, no lens choice. Plan in `docs/CAMERA_MODULE_PLAN.md`,
  tracker camera#203 (diagnostics #204, harness #205, quick wins #206, constraints
  #207, full-frame capture #208, reframe step #209, storage #210, privacy #211,
  lenses #212, canary #213). Decisions: front camera is the global default;
  anonymous diagnostics approved; record the full frame, then crop to the frame
  in a second step; the owner tests on phones. Merged 2026-10-06: #204, #206,
  #207 (constraints), #208 (whole-frame capture), #209 (reframe step); #210
  (storage of the original and the reframe record) in review. Next: #211 privacy
  (file deletion, consent wording), #212 lenses, #205 test harness.
  (Superseded 2026-10-09, camera#257: touch devices use the device's own camera app, which has the lens choice; the full-size original is not stored; the file deletion of #211 is built. See the banners of `docs/CAMERA_MODULE_PLAN.md`.)
- **Frame slots (issue [#502](https://github.com/moldovancsaba/camera/issues/502), client request 2026-10-09, owner answer 218 "full delivery now", plan `docs/FRAME_SLOTS_PLAN.md`):** the generated frame can be composed from up to twelve optional slots (six text, six picture) per event on the Frames page; an event without slots is drawn exactly as before. Built: model, layout, drawing, save, preview, panel, and the default slots of a partner and of the general level (events follow them until they set their own; owner answer 220). Left: setting up the MTK frame from the client's strips (needs the owner's go; the MTK event already runs on two complete frames, which win over slots).
- **Generated default frame (owner-approved 2026-10-06, epic camera#231, plan `docs/DEFAULT_FRAME_PLAN.md`):** every
  event without an active frame of its own gets a frame built from messmass data (partner logo top right, teams text
  top left, theme-coloured bar with a random message per photo; 1920x1080). Merged: layout engine, messmass endpoint,
  snapshot and message list, server renderer, guest capture flow, event editor panel (`/admin/events/[id]/frames`),
  pairing-in-event-name split, placeholder rule, the rollout tool for existing events and try-on consistency
  (camera#238, `/admin/frames/generated`). The renderer has since run inside deployed functions (the production Blob store held about 1,000 generated frame
  images on 2026-10-09, `docs/STORAGE_ARCHITECTURE.md`; RUNBOOK "First check on Vercel"); whether the owner has made the rollout run of
  `/admin/frames/generated` for the existing events is not recorded here. Open: messmass#430, camera#237 (real save, accessibility audit).
- **Capture works the same way for every camera (owner decision 2026-10-06, camera#257):** the largest still, zoom and pan
  anywhere, "Continue" (which saves, camera#344; the "Love it" screen is gone), and only the frame-sized result is saved; the full-size original is no longer uploaded. Every touch
  device takes the photo with its own camera app (file input with `capture`); a desktop webcam keeps the live view and takes a
  real still where the browser can; `?capture=frame` is the way back. (Tried on real phones since: `LEARNINGS.md` FRONT-016 and FRONT-017.) Cleanup once no old page
  can be open: `POST /api/uploads/original`, the original claim handling in `POST /api/submissions`, `blob:orphans`.
- **GDS:** camera is on 6.8.0 (vendored). The audit and ordered plan are in
  `gds_fix_handover.md` (merged in #175): camera#183 done 2026-10-06 (official
  stylesheet imported, forked CSS deleted; Inter now loaded from the root
  layout, see `LEARNINGS.md` FRONT-009), camera#184 bumped 2026-10-10 (all five
  packages from 6.3.0 to 6.8.0; the issue said 6.7.0, but 6.8.0 was released on
  2026-10-06; the sidebar row height was measured on a render with the production
  CSS and is 40.8px before and after, the check on the deployed app, which needs an
  admin sign-in, is still open), work packages camera#185-#187 next, owner decisions camera#188.
- **messmass and sso:** nothing blocks camera. The 2026-09-30 decision (separate
  logins) stands; sso 5.41.1 and 5.42.0 need no camera change. A `CAMERA_` env
  prefix is an open owner decision (camera#195).
- **Auth and dependencies (2026-10-05):** axios raised to 1.20.0 (#199);
  Dependabot raised no alert for it and the cause is unexplained (camera#177).
  The SSO revoke and the messmass session push are bounded at 3000 ms (#200);
  camera#178 stays open for the keep-or-drop decision on the messmass push and
  the calls that are still unbounded (`pushPartnerToMessmass`, other fetches in
  `lib/auth/sso.ts`).

## Status 2026-09-28 (history through 2026-09-30)

- **Version** 12.3.40 (try-on cron removed; the v12.3.39 hardening batch is below). Fleet policy
  (messmass `docs/_audit/fleet-version-policy.md`) bumps messmass, fanmass,
  try-on and savetheworld to the same version in the same coordinated release;
  12.3.38 was a camera-only security release; 12.3.39 and 12.3.40 are fleet releases.
- **Production = git `main`.** Every push to `main` auto-deploys
  `narimato/04_camera` via the Vercel Git integration (verified 2026-09-28:
  latest READY production deployment `meta.githubCommitSha` = `ccd77d5` =
  `origin/main`). Vercel does not wait for GitHub Actions, so run
  `npm run inventory:check && npm run release:check` before pushing. Steps and
  post-deploy checks: `RUNBOOK.md`.
- **CI was red on `main` from `386d3fe` to `06f3029`** — `inventory:check`
  failed because the new publish-selfies route was never added to
  `docs/_audit/*.json`. Fixed in `ccd77d5` (12.3.37); `main` and the rebased
  Dependabot PRs are green again.
- **publish-selfies scoping fix (12.3.37).**
  `POST /api/internal/savetheworld/events/[eventId]/publish-selfies` built a
  filter whose second `$or` overwrote the event match, so it would have
  published non-tryon selfies across all events. Now `$and`-combined in
  `lib/savetheworld/publishSelfies.ts` with a unit test. The bug never
  triggered in production: an aggregate check on 2026-09-28 found 13 events,
  11 of them with zero visible submissions.
- **v12.3.39 hardening batch (2026-09-29).**
  - `upload-logo` and the two try-on setup routes no longer admit any SSO
    account.
  - The six shared-secret gates compare in constant time and return a generic
    403.
  - The try-on sync backstop is idempotent, and `?jobId=` works. A re-applied
    framed result is never replaced by the raw image, and the generic
    `DELETE /api/submissions/[id]` refuses try-on results (409).
  - `POST /api/internal/messmass/sso-session` answers 403, not 500, when SSO
    refuses the permission read (every messmass login today).
  - Setup reads no longer write.
  - `images.remotePatterns` is narrowed to camera's Blob store and `i.ibb.co`.
  - The dormant TypeScript try-on worker is deleted.
  - CI runs a gitleaks secret scan.
  - `.env.example`, `RUNBOOK.md` and the audit docs are brought up to date.

  Details: `RELEASE_NOTES.md` v12.3.39. Follow-ups: `docs/_audit/drift-register.md` §8.
- **Owner decisions 2026-09-30.**
  - Try-on is paused: the local worker is stopped and `tryOn.enabled` is off on
    every event (MotoGP Balaton Park 2026, Brain Bar 2026 x AUDI F1, FIBA 3X3 2026
    TRYON). Switching it off also removes approved try-on results from those
    events' slideshows, because the slideshow policy treats a disabled event as
    "originals only" (`lib/tryon/slideshow-policy.ts:28`; the file is gone since issue 557). The previous settings
    are kept outside the repo.
  - The `*/5` try-on sync cron is removed from `vercel.json` (v12.3.40);
    `CRON_SECRET` stays unset (the three crons of today want it). The try-on integration is removed (issue 557); there is nothing to restore.
  - messmass and camera keep separate logins for now: `client_credentials` is not
    enabled for their SSO clients and a messmass login mints no camera session
    (the 403 above is expected).
  - The fan-selfie consent question is closed with no change to behaviour.
  - Cleaned up: `fff.messmass.com` detached from the Vercel project,
    `camera.doneisbetter.com` kept (savetheworld reads camera through it); the
    unused `camera_MONGODB_URI` and `GITHUB_TOKEN` Vercel variables removed;
    GitHub Pages disabled; 30 merged remote branches (including five `claude/*`)
    and the stray `phase0-ux-bugs` worktree deleted; PR #88 and issue #117 closed.
  - Branch protection on `main` now applies to admins and blocks force-pushes
    (was `enforce_admins: false`), so a red `Verify` check blocks the merge.
- **Firewall (2026-09-30).** Vercel Firewall rule `fan-upload-flood-ceiling`
  rate-limits `POST /api/submissions` to 100 requests a minute per IP, globally
  (see `RUNBOOK.md` "Rate limits"). It is not in git. To recreate it:
  `npx --yes vercel@latest firewall rules add fan-upload-flood-ceiling --project 04_camera --scope narimato --action rate_limit --condition '{"type":"path","op":"eq","value":"/api/submissions"}' --condition '{"type":"method","op":"eq","value":"POST"}' --rate-limit-algo fixed_window --rate-limit-window 60 --rate-limit-requests 100 --rate-limit-keys ip --rate-limit-action rate_limit --yes`,
  then `firewall publish`. Verified live: of 130 rapid requests, 100 reached
  camera and 30 were stopped by the firewall. Upstash is not planned.
- **Dependabot**: 0 open alerts on 2026-09-29 (v12.3.38 updated `sharp`, `next`,
  the `postcss` override and the transitive packages). On 2026-10-05
  `npm audit --omit=dev` still reported a high finding: axios 1.18.1 sat inside
  twelve GitHub-reviewed advisories published 2026-09-30 (fixed in 1.20.0, now
  installed). Dependabot alerts are enabled (39 past alerts, all fixed) but
  none was ever raised for axios, and why is unexplained; do not treat "0 open
  alerts" as proof of a clean tree, run `npm audit --omit=dev` as well. Five
  dev-only highs remain (`eslint-config-next` pulling `braces`/`micromatch`);
  npm's only offered fix is a downgrade to 14.x, so they are left alone.
- **Design system**: GDS 6.8.0 installed from vendored release tarballs
  (`vendor/gds/*.tgz` via `file:` specs in `package.json`, since v12.3.29); no
  registry token needed.

## Open items

Each item has a board issue; see the board for current status.

- **Vercel Node setting** (camera#182). Project `04_camera` is set to Node 22.x;
  builds run on 24 because `package.json` `engines.node` (`>=24.0.0 <25.0.0`)
  overrides it. Set the dashboard to 24.x.
- **Secret scanning settings (owner)** (camera#182). Non-provider patterns and
  validity checks are off for this public repo (Settings > Code security). The CI
  gitleaks step covers the working tree only, not history.
- **`CameraCapture` `autoStart` unreliable under `next dev`** (FRONT-008, camera#191) —
  found, not fixed. A `useRef` double-invoke guard survives React StrictMode's
  dev-only mount→cleanup→remount cycle, but the `setTimeout(startCamera, 0)`
  it guards does not, so the first mount's cleanup cancels the pending timer
  and the real mount sees the ref already `true` and returns early —
  `autoStart` never fires under `next dev`. Not yet verified whether this
  reproduces in a production build. Likely fix: don't gate the timer's
  *scheduling* on a ref that survives remounts.
- **partner edit page** — still raw `FormSection` + inputs
  (`app/admin/partners/[id]/edit/page.tsx`), unlike its migrated `new`
  counterpart (`AdminCrudForm`). Covered by GDS work package A (camera#185,
  handover PRs 5 and 6). (The try-on garment edit page that was listed with it is gone, issue 557.)
- Two `react-hooks` advisory ESLint rules (`set-state-in-effect`,
  `preserve-manual-memoization`) still off in `eslint.config.mjs:78-79` —
  revisit under a React Compiler adoption (camera#194).

Older follow-ups from the 2026-08-17 handover:
- GDS `AdminResourceCard`/`MediaPreviewCard` workarounds. Re-checked 2026-10-06
  against the installed 6.3.0 (not measured again at 6.8.0): the forced "edit" label and the double-wrapped
  `Badge` are still present (upstream `sovereignsquad/general-design-system#755`,
  tracked in camera#187); the missing "omit the media block" option was fixed
  upstream in 3.10.0 (`hideWhenNoMedia`). Details:
  `docs/GDS_CAMERA_ADOPTION.md`.
- The E2E export suite (#84, closed 2026-07-08) should be run green against a
  MongoDB-backed environment before trusting that closure (camera#198).

## Branching

Single long-lived branch `main` (production), plus short-lived per-task branches
(`feature/*`, `fix/*`, `chore/*`, `dependabot/*`, …). There is no
`dev`/`preview` branch. Policy and current practice:
[docs/BRANCHING.md](docs/BRANCHING.md).

## Docs map

`README.md` · `ARCHITECTURE.md` · `TECH_STACK.md` · `RUNBOOK.md` · `RELEASE_NOTES.md` ·
`TASKLIST.md` · `ROADMAP.md` · `gds_fix_handover.md` · `docs/*` (index: `docs/DOCUMENTATION.md`). Project board: [#24](https://github.com/users/moldovancsaba/projects/24).
