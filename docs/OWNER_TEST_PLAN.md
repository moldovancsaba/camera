# Owner test and task plan: MTK x Vasas, Friday 16 October 2026

> Written on 11 and 12 October 2026 against version 12.3.42 of the app, for the owner. It is a list to follow and answer, not a description of the code. The same content feeds the interactive checklist page.

## How to report back

Write one line for every step, in this form, and paste the whole list into the chat:

```text
T05 PASS
T05 FAIL: one line, what you saw (a screenshot is welcome)
T05 SKIP: why (you could not do it yet; that is not a failure)
```

For a decision, write the step number and the answer the step asks for, for example T09 OPTION 1 or T42 START.

Some steps ask for a number or a word after PASS, for example T01 PASS: deleted 5 of 8. The steps of the match day are M1 to M4 and are answered the same way afterwards.

Do not leave a FAIL without its line: it cannot be fixed from a guess.

## Read this first

This is everything that is on you before the match on Friday 16 October, in the order to do it, with the exact buttons and words you will see. It was written on 11 and 12 October against version 12.3.42 of the app.

The capture path (the pages users go through), the live giant screen and the approver's screens are frozen from Wednesday 14 October: from then on only fixes for something the rehearsal found are allowed. So do sections A to F on Monday 12 and Tuesday 13 October, the rehearsal first, so that a defect it finds can still be fixed in time. Every step is small, says on which device to do it, and ends with the line you write back.

Where a button or screen of an outside service (Vercel, MongoDB Atlas, ImgBB, the sign-in) could not be checked from here because it needs your login, the step says so in one line. Every label of the app itself was checked in the code. If the screen and this plan disagree, the screen is right: write what you saw.

Inside an event or a partner the left menu shows only the pages of that event or partner; press **Back to the main menu** (the first item) to reach the other pages. You do not need a terminal for anything here. The database indexes (the command `npm run db:ensure-indexes`) are optional: the first journey record creates the 30-day index by itself, so skip it.

Before the match do not press: **Make for N events** (the welcome-screen backfill), **Make the screen pictures**, **Check the pictures** and **Check logos, frames and page pictures**, **Send now** in Follow-up e-mails, and do not tick **Send this e-mail** for the follow-up on any event. They change live data or what users see, and each has its place after the match. **Turn vetting off** is only a last resort on the day (section H).

The throw-away event of section C is the only event you may change. Never save a photo, a setting or a page on the match event (MTK Budapest x Vasas FC), on the savetheworld event or on any customer's event.

## Contents

- [A. Platform steps (computer)](#a-platform-steps-computer) : T01, T02, T03, T04, T05, T06, T07
  - [T01. Delete the eight unused Vercel variables](#t01-delete-the-eight-unused-vercel-variables), computer
  - [T02. Set the Vercel Node.js version to 24.x](#t02-set-the-vercel-nodejs-version-to-24x), computer
  - [T03. Look up the Vercel plan and how much the Blob store holds](#t03-look-up-the-vercel-plan-and-how-much-the-blob-store-holds), computer
  - [T04. Check that the MongoDB Atlas backups are on](#t04-check-that-the-mongodb-atlas-backups-are-on), computer
  - [T05. Look up the ImgBB plan and limits](#t05-look-up-the-imgbb-plan-and-limits), computer
  - [T06. Switch on Dependabot alerts for the savetheworld repository](#t06-switch-on-dependabot-alerts-for-the-savetheworld-repository), computer
  - [T07. Set CRON_SECRET on the Vercel project (after the match)](#t07-set-cronsecret-on-the-vercel-project-after-the-match), computer
- [B. Privacy (computer)](#b-privacy-computer) : T08, T09
  - [T08. Compare the public privacy notice with what the app stores](#t08-compare-the-public-privacy-notice-with-what-the-app-stores), computer
  - [T09. Decide what to do with the IP addresses and device strings of earlier photos](#t09-decide-what-to-do-with-the-ip-addresses-and-device-strings-of-earlier-photos), either
- [C. The approver and the rehearsal](#c-the-approver-and-the-rehearsal) : T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20
  - [T10. Add the MTK approver as a partner user](#t10-add-the-mtk-approver-as-a-partner-user), computer
  - [T11. Share the approver's guide and the Hungarian text review sheet with MTK](#t11-share-the-approvers-guide-and-the-hungarian-text-review-sheet-with-mtk), computer
  - [T12. Create the throw-away event under MTK Budapest](#t12-create-the-throw-away-event-under-mtk-budapest), computer
  - [T13. Take two test photos on a phone](#t13-take-two-test-photos-on-a-phone), phone
  - [T14. The approver finds the photos, and a third photo arrives by itself](#t14-the-approver-finds-the-photos-and-a-third-photo-arrives-by-itself), phone
  - [T15. Photo 1: mark one person and approve](#t15-photo-1-mark-one-person-and-approve), phone
  - [T16. Photo 2: say nobody is in it and reject with a reason](#t16-photo-2-say-nobody-is-in-it-and-reject-with-a-reason), phone
  - [T17. Photo 3: two people, remove one, skip, then approve](#t17-photo-3-two-people-remove-one-skip-then-approve), phone
  - [T18. The two e-mails arrive](#t18-the-two-e-mails-arrive), phone
  - [T19. Open the public photo page from the approved e-mail](#t19-open-the-public-photo-page-from-the-approved-e-mail), phone
  - [T20. First real upload on the Images pages](#t20-first-real-upload-on-the-images-pages), computer
- [D. Phone checks](#d-phone-checks) : T21, T22, T23, T24, T25, T26, T27, T28, T29, T30, T31, T32, T33
  - [T21. The one photo screen after the shutter](#t21-the-one-photo-screen-after-the-shutter), phone
  - [T22. Vetting on a phone: the counts follow without a reload](#t22-vetting-on-a-phone-the-counts-follow-without-a-reload), phone
  - [T23. Walk the real MTK event: the colours of the user flow](#t23-walk-the-real-mtk-event-the-colours-of-the-user-flow), phone
  - [T24. Walk the real MTK event: the Hungarian pages](#t24-walk-the-real-mtk-event-the-hungarian-pages), phone
  - [T25. Walk the real MTK event: the giant-screen picture above START](#t25-walk-the-real-mtk-event-the-giant-screen-picture-above-start), phone
  - [T26. Walk the real MTK event on an iPhone: no scroll, no zoom, no band](#t26-walk-the-real-mtk-event-on-an-iphone-no-scroll-no-zoom-no-band), phone
  - [T27. The default consent and login pages](#t27-the-default-consent-and-login-pages), phone
  - [T28. The guided tour switch](#t28-the-guided-tour-switch), either
  - [T29. The event editor pages open without a crash](#t29-the-event-editor-pages-open-without-a-crash), phone
  - [T30. The Brand Colors panel](#t30-the-brand-colors-panel), phone
  - [T31. The four camera ways, tried with the address](#t31-the-four-camera-ways-tried-with-the-address), phone
  - [T32. The camera way as a setting](#t32-the-camera-way-as-a-setting), either
  - [T33. Marking the people in the big view: on a computer and on a phone held sideways](#t33-marking-the-people-in-the-big-view-on-a-computer-and-on-a-phone-held-sideways), either
- [E. Look and confirm, then clean up](#e-look-and-confirm-then-clean-up) : T34, T35, T36, T37, T38, T39, T40, T41
  - [T34. The e-mail says “Visit your selfie”, in your phone's mail app](#t34-the-e-mail-says-visit-your-selfie-in-your-phones-mail-app), phone
  - [T35. Look at the slideshow crossfade](#t35-look-at-the-slideshow-crossfade), computer
  - [T36. The giant screen reloads when told to](#t36-the-giant-screen-reloads-when-told-to), computer
  - [T37. Does a “saved” notice show in the admin?](#t37-does-a-saved-notice-show-in-the-admin), computer
  - [T38. Pictures that cannot be shown are hidden, not shown as errors](#t38-pictures-that-cannot-be-shown-are-hidden-not-shown-as-errors), computer
  - [T39. The Analytics view of an event and of all events](#t39-the-analytics-view-of-an-event-and-of-all-events), computer
  - [T40. The Journey tab and the kill switch](#t40-the-journey-tab-and-the-kill-switch), computer
  - [T41. Delete the throw-away event](#t41-delete-the-throw-away-event), computer
- [F. Decisions waiting for you](#f-decisions-waiting-for-you) : T42, T43, T44, T45, T46, T47
  - [T42. The label of the MTK welcome button: START or INDÍTÁS](#t42-the-label-of-the-mtk-welcome-button-start-or-indítás), either
  - [T43. MTK's Hungarian suggestions: when do they have to arrive?](#t43-mtks-hungarian-suggestions-when-do-they-have-to-arrive), either
  - [T44. The welcome-screen backfill for existing events](#t44-the-welcome-screen-backfill-for-existing-events), either
  - [T45. Keep the unframed photo at approval: merge pull request 609, in one of two ways](#t45-keep-the-unframed-photo-at-approval-merge-pull-request-609-in-one-of-two-ways), either
  - [T46. The admin notices: build the fix?](#t46-the-admin-notices-build-the-fix), either
  - [T47. Report the two design-system findings to the GDS repository?](#t47-report-the-two-design-system-findings-to-the-gds-repository), either
- [Image safety card (issue 509)](#image-safety-card-issue-509) (pending)
- [Rate limits (issue 470) and the report partner template (issue 430)](#rate-limits-issue-470-and-the-report-partner-template-issue-430) : T48, T49, T50
  - [T48. Open a messmass report: it still loads under the new limits](#t48-open-a-messmass-report-it-still-loads-under-the-new-limits), computer
  - [T49. Know the messmass limits before a day with many people on one network](#t49-know-the-messmass-limits-before-a-day-with-many-people-on-one-network), either
  - [T50. The report of an event whose partner has a report template](#t50-the-report-of-an-event-whose-partner-has-a-report-template), computer
- [Dependency changes (what to watch after they are merged)](#dependency-changes-what-to-watch-after-they-are-merged) : T51
  - [T51. Download the images ZIP of the throw-away event](#t51-download-the-images-zip-of-the-throw-away-event), computer
- [H. The day of the match: run sheet](#h-the-day-of-the-match-run-sheet) : M1, M2, M3, M4
  - [M1. Before the doors](#m1-before-the-doors), either
  - [M2. During the match: what to watch](#m2-during-the-match-what-to-watch), either
  - [M3. If something goes wrong: one move for each risk](#m3-if-something-goes-wrong-one-move-for-each-risk), either
  - [M4. After the match](#m4-after-the-match), either

## A. Platform steps (computer)

**When:** Monday 12 October, about 40 minutes in all. T07 (`CRON_SECRET`) waits until after the match.

### T01. Delete the eight unused Vercel variables

**Device:** computer. **Why:** The try-on integration was taken out of the app (issue 557). Eight of its settings are still on the Vercel project and nothing reads them any more; some are secrets, so they should not stay. (The rebuild of try-on as a small add-on is planned in issue 607 and will set up its own.)

**Where:** vercel.com, team narimato, project 04_camera, Settings, Environment Variables (about 8 minutes)

**Steps**

1. Open vercel.com and sign in. Open the project 04_camera in the team narimato. Check the name at the top: it must be 04_camera, not the separate try-on project.
2. Open Settings, then Environment Variables.
3. Search for each of these eight names, one at a time, and remove the ones that exist (the three-dot menu at the end of the row, then Remove): `CAMERA_TRYON_INTERNAL_SECRET`, `TRYON_SETUP_SELECTION_SECRET`, `IMAGE_DIRECT_INTEGRATION_URL`, `IMAGE_DIRECT_INTEGRATION_TOKEN`, `CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN`, `CAMERA_IMAGE_DIRECT_CALLBACK_TOKEN_PREVIOUS`, `CAMERA_IMAGE_DIRECT_CALLBACK_ENABLED`, `IMAGE_DIRECT_RESULT_ALLOWED_HOSTS`.
4. Do not touch `CRON_SECRET` or any other variable. Do not press Redeploy; if Vercel offers one, decline.
5. Search each of the eight names once more.

**You should see**

- None of the eight names is found any more (some may never have been set: that is fine).
- Every other variable, `CRON_SECRET` included if it exists, is still in the list.

**Write back:** `T01 PASS: deleted N of 8 (the rest were not set)` or `T01 FAIL: one line, what you saw`

**If it fails:** If a name is marked Shared, if Vercel refuses, or if the page looks different from this description, stop and write the FAIL line with a screenshot of the list. Deleting nothing is safe: the step can be done any day, and the separate try-on project keeps its own copy of the shared secret, which you do not touch. Not verified: the Vercel page needs your login, so the button names are Vercel's usual ones.

### T02. Set the Vercel Node.js version to 24.x

**Device:** computer. **Why:** The project setting says Node 22.x while the app asks for Node 24; builds already run on 24 because the app's own file wins. The setting should say the same (issue 182).

**Where:** vercel.com, project 04_camera, Settings, General (about 3 minutes)

**Steps**

1. Open the project 04_camera, then Settings, then General.
2. Find Node.js Version. If it says 22.x, choose 24.x from the list.
3. Press Save next to it. Do not redeploy.
4. Reload the page and read the setting again.

**You should see**

- Node.js Version reads 24.x after the reload.

**Write back:** `T02 PASS` or `T02 PASS: it already said 24.x` or `T02 FAIL: what the list offers`

**If it fails:** If 24.x is not in the list, write which versions it offers. Nothing is lost either way: builds keep running on 24. Issue 182 also lists two GitHub settings (secret-scanning extras, delete branches after merge); they are not part of this plan. Not verified: the Vercel page needs your login.

### T03. Look up the Vercel plan and how much the Blob store holds

**Device:** computer. **Why:** On the free Hobby plan the Blob store (where waiting photos, generated frames and, once pull request 609 is merged, the unframed photo of every approval live) is limited to 1 GB and stops working when it is full, as Vercel's price page said on 9 October. Nobody has looked yet (answer 228). The decision T45 about pull request 609 depends on this number.

**Where:** vercel.com, team narimato, Settings, Billing; then project 04_camera, Storage, the Blob store, usage (about 5 minutes)

**Steps**

1. Click the team name narimato (top left), then Settings, then Billing. Read the name of the plan (Hobby, Pro or Enterprise).
2. Open the project 04_camera, then the Storage tab. Open the Blob store and look at its usage: the size it holds and the limit if one is shown.

**You should see**

- You can read a plan name and a used size.

**Write back:** `T03 PASS: plan <name>, used <size> of <limit>` or `T03 FAIL: which number you could not find`

**If it fails:** Do not buy, upgrade or delete anything. If the plan is Hobby and the store holds more than 600 MB, say so in the same line and answer 609 B in T45: the limit is 1 GB, and keeping the unframed photo adds about 0.43 MB per approved photo. Not verified: the Vercel pages need your login, so where the numbers are shown may differ a little.

### T04. Check that the MongoDB Atlas backups are on

**Device:** computer. **Why:** The whole database lives there. If a mistake or an outage damages it, a backup is the only way back (answer 228). Nobody has looked.

**Where:** cloud.mongodb.com, the project of the camera database, the cluster, Backup tab (about 5 minutes)

**Steps**

1. Sign in at cloud.mongodb.com and open the project that holds the camera database.
2. Open Database (the list of clusters). Read the tier name on the cluster card (for example M0, M10).
3. Open the cluster and then its Backup tab. Read whether cloud backups are on, how often a snapshot is taken and how long it is kept.

**You should see**

- The Backup tab says backups are on, with a snapshot schedule and a retention time.

**Write back:** `T04 PASS: backups on, snapshot every <hours>, kept <days>, tier <name>` or `T04 FAIL: backups off or not available, tier <name>`

**If it fails:** Do not switch anything on and do not change the tier yourself: a tier change costs money and restarts the cluster. Write what the tab says and the options will be listed for you. Not verified: Atlas needs your login; as far as known the free M0 tier has no backups.

### T05. Look up the ImgBB plan and limits

**Device:** computer. **Why:** Every approved photo is copied to ImgBB, and the unframed originals are meant to end up there (decision 295). The plan and its limits were only read from third-party pages (answer 228).

**Where:** imgbb.com, your account, the plan page (about 5 minutes)

**Steps**

1. Sign in at imgbb.com.
2. Open your account's plan page (imgbb.com/plan, or the Plan link in the menu under your name) and the account settings.
3. Read the plan name, the date it ends, the largest size of one picture, whether storage is unlimited or a number, and any limit on uploads or traffic that is shown.

**You should see**

- You can read the plan, its end date and the per-picture size.

**Write back:** `T05 PASS: plan <name> until <date>, <size> per picture, storage <unlimited or number>, other limits <none shown or which>` or `T05 FAIL: what is wrong`

**If it fails:** If the plan has ended or shows a limit, write it at once: a copy goes to ImgBB at every approval. Not verified: ImgBB needs your login, so the page names are from its public menu.

### T06. Switch on Dependabot alerts for the savetheworld repository

**Device:** computer. **Why:** GitHub's alerts about libraries with known security holes are switched off for the savetheworld repository, a live app. In the other four repositories they are on (camera, fanmass and try-on show none open; messmass shows one, read on 12 October). Without them nobody is told when a library of savetheworld becomes unsafe (issue 182).

**Where:** github.com, the repository savetheworld, Settings, Code security (about 3 minutes)

**Steps**

1. Open github.com/moldovancsaba/savetheworld and sign in (the repository is private). Open Settings.
2. In the list on the left open Code security (it may also be called Advanced Security or Code security and analysis).
3. Find Dependabot alerts and press Enable. Leave Dependabot security updates and version updates as they are.
4. Open the Security tab of the repository and its Dependabot page.

**You should see**

- Dependabot alerts reads Enabled. The Dependabot page opens and lists the open alerts (it may list some at first: GitHub scans the repository after the switch).

**Write back:** `T06 PASS: enabled, N alerts open` or `T06 FAIL: one line, what the page shows`

**If it fails:** If the switch is missing or greyed, write the words next to it. Do not merge any update on savetheworld because of an alert before the match. Checked read-only on 12 October: GitHub answers that Dependabot alerts are disabled for this repository. Not verified: where the switch sits in GitHub's settings today (the page needs your login).

### T07. Set CRON_SECRET on the Vercel project (after the match)

**Device:** computer. **Why:** Three scheduled jobs answer **403** and do nothing until this secret exists: the weekly activity log mail (Mondays), the daily follow-up e-mail (off for every event anyway) and the daily check for pictures that are gone (issue 529). Nothing breaks without it, the buttons in the admin do the same work by hand. Timing: the handover puts it after the match (from Saturday 17 October), because a redeploy and a new daily check would touch the frozen live path; do it earlier only if told.

**Where:** Your password manager, then vercel.com, project 04_camera, Settings, Environment Variables, Deployments (about 10 minutes)

**Steps**

1. Make the secret: in your password manager create a new random password of 40 or more characters, letters and digits only, and copy it. Do not type it and do not paste it into the chat, an e-mail or any document.
2. Open project 04_camera, then Settings, then Environment Variables, and press Add (or Create new).
3. Name: `CRON_SECRET`. Value: paste the secret. Environments: tick Production only. If a Sensitive switch is offered, turn it on. Save.
4. Open the Deployments tab, open the newest Production deployment, use its three-dot menu and choose Redeploy. Wait until it says Ready.
5. In the admin open Settings, then Emails (left menu), and in the card **Follow-up e-mails** read the line under the heading.

**You should see**

- The card says **The daily job runs by itself.** (before the secret it says the daily job cannot run by itself yet because `CRON_SECRET` is not set).
- The first Monday after that (06:00 UTC, which is 08:00 in Budapest until 25 October) the weekly activity log mail arrives at the address that receives it, with a CSV file attached.

**Write back:** `T07 PASS` or `T07 PASS: and the Monday mail arrived` or `T07 FAIL: one line, what the card says`

**If it fails:** If the card still says it is not set two minutes after the redeploy, reload once; if it still does, write the FAIL line with a screenshot of the variable list with the value hidden. If the redeploy itself fails, do nothing more and write at once. Never paste the secret anywhere. Not verified: the Vercel pages need your login.

## B. Privacy (computer)

**When:** Monday 12 or Tuesday 13 October, about 25 minutes. The decision T09 can be answered at any time; whatever you choose, nothing stored is touched before the match.

### T08. Compare the public privacy notice with what the app stores

**Device:** computer. **Why:** The notice every user agrees to must say what the app really keeps. The app changed on 10 and 11 October (no IP address and no full device string with new photos; an anonymous journey record), and thousands of users arrive on Friday. A wrong notice is a legal risk.

**Where:** The notice: seyuselfies.com/en/policies (Hungarian: seyuselfies.com/hu/policies), the page the consent box **I have read the Privacy policy** links to. The list to compare with is below; it is written from the file `docs/PRIVACY_DATA.md` of the repository (about 25 minutes)

**Steps**

1. Open seyuselfies.com/en/policies. On 11 October that page offers a document called **Privacy Policy** (a Word file whose name carries the date 25.08.2026, so it is older than the change of 10 and 11 October); the Hungarian page offers the same one. Only the page was read from here, not the document. Open the document and keep it beside this list. Each line below is one statement: tick it when the notice agrees or says nothing that contradicts it; note the line number when the notice is silent or says something else.
2. IP address of a photo: photos taken now store no IP address (since 11 October). The notice must not say an IP address is stored with a photo.
3. Device of a photo: only the kind of device (iPhone, Android, desktop, unknown) and the browser family (Safari, Chrome and so on) are stored, never the full device string.
4. Photos taken before that still hold their IP address and full device string until you decide (T09). The notice does not promise that no such data is kept.
5. Photos and retention: a photo is kept until it is removed (there is no automatic deletion today). The notice gives a retention period; answer 226 says unframed and original photos are kept 90 days after an event, then deleted on request (planned, not built; today the unframed crop is deleted at approval).
6. ImgBB: the notice says the finished photo is copied to ImgBB (an outside image service) and that the unframed original will end its life there (decision 295; planned, not built).
7. Name and e-mail are stored only if the user types them on the Who-are-you page or signs in; with a sign-in the account id is stored too.
8. Consent: for every box the user ticks, the app stores the page, the exact words, the link and the time; only acceptances exist. The public campaign wall permission is a separate, unticked, optional box.
9. Registration: the event, the e-mail, the name, the first and last time seen and whether the welcome e-mail went are kept until removed.
10. E-mail: the notice names the e-mails a user can get (the link to the photo, the **not approved** note, a welcome e-mail and a follow-up a week after the event when an event switches them on) and who sends them.
11. The anonymous journey record: counts and anonymous steps, no IP address, no device string, no cookie, no person; single records are kept 30 days, daily counts for good.
12. Visits to a QR code or tracked link: only a count per link, day and kind of phone (iPhone, Android, other); bots and link previews are not counted.
13. Logs: camera and screen diagnostics and page crashes are log lines (a random visit id, timings, the device string cut to 200 characters; no IP address, name, e-mail or picture), kept as long as the log service keeps them. The IP address is still seen by the rate limiter (kept only in the server's memory for up to an hour, or as a one-way hash) and by the hosting company's own request logs.
14. The people who manage the service (editors, the approver): their e-mail, role and every change they make are logged, mailed weekly to you and deleted after the next mailing.
15. Not in `PRIVACY_DATA`.md yet, check anyway: when an approver marks the people in a photo, a rectangle, a gender group, an age group, an emotion and merchandise are saved with the photo for the statistics. Does the notice cover this?
16. Who holds the data: hosting (Vercel), database (MongoDB Atlas), photo files (Vercel storage and the ImgBB copy), e-mail sending (Resend), sign-in (the single sign-on, and Google or Facebook if the user chooses them). This line comes from the architecture documents, not from `PRIVACY_DATA`.md.

**You should see**

- Every line from 2 to 16 is either ticked or written down as a difference.

**Write back:** `T08 PASS` or `T08 FAIL: lines 3, 5, 15 (the line numbers that differ or are missing)`

**If it fails:** Do not edit the notice yourself from this list without whoever advises you on privacy. Send the line numbers and you get, for each, the exact sentence the app guarantees (from `docs/PRIVACY_DATA.md`). The wording of the notice stays your or your adviser's decision.

### T09. Decide what to do with the IP addresses and device strings of earlier photos

**Device:** either. **Why:** Photos taken before 11 October still carry the IP address and the full device string of the person who took them. Nothing reads the IP address; the device string feeds one figure (Devices) in the Analytics. Nothing stored has been deleted, and nothing will be without your word.

**Where:** A decision, no screen (about 2 minutes). Answer by the option number.

**Steps**

1. Option 1 (the default): after the match, from Saturday 17 October, an admin button removes the IP addresses and the device strings of earlier photos. It runs a dry run first (it only shows the numbers), writes the device class into each photo before removing its string so the Devices figure keeps its numbers, and you press it.
2. Option 2: the same button removes only the IP addresses; the device strings stay because they feed the Devices figure.
3. Option 3: leave everything as it is, and the privacy notice says that photos before 11 October hold an IP address and a device string and for how long.

**You should see**

- Whatever you choose, nothing stored is touched before the match. If you do not answer, option 1 stays the plan.

**Write back:** `T09 OPTION 1` or `T09 OPTION 2` or `T09 OPTION 3` or `T09 OTHER: one line`

**If it fails:** If none of the options fits, write OTHER and the sentence. Removing is final, so there is no option to remove anything now.

## C. The approver and the rehearsal

**When:** T10 to T12 on Monday 12 October (about 25 minutes). The rehearsal T13 to T20 on Monday evening or on Tuesday 13 at the latest, with the approver on the line (about 90 minutes). The rehearsal comes first on purpose: what it finds can still be fixed before the freeze. The throw-away event is deleted last, in T41.

### T10. Add the MTK approver as a partner user

**Device:** computer. **Why:** Nobody from MTK can approve photos today: MTK Budapest has no partner user. Without this person only you can approve at the match (issue 403).

**Where:** camera.messmass.com/admin, Access, Partners, MTK Budapest (about 5 minutes)

**Steps**

1. Get from MTK the e-mail address the approver signs in with.
2. Sign in at camera.messmass.com/admin. In the left menu open Access, then Partners, then MTK Budapest (not MTK tippmix). Use the search box if you cannot find it.
3. Scroll to the box **Partner User Access**. Fill **User email** with the approver's address. **Display name** is optional. **App** is fixed to Events. For **Role** choose Manager (a Viewer cannot approve; Manager is enough, do not choose Admin).
4. Press **Add access**.
5. Tell the approver that what they do in the admin (approve, reject) is logged with their e-mail and the time.

**You should see**

- A message **Partner access updated: Partner access saved.** appears.
- The approver is listed in the box with the label Active, the app Events and the role Manager.

**Write back:** `T10 PASS` or `T10 FAIL: one line, what you saw`

**If it fails:** If **Add access** is greyed out the e-mail box is empty. If a red **Partner access failed** appears, write its words. Do not add the person to any other partner. Not verified: whether a person with no account on the single sign-on can sign up from the sign-in page; the first sign-in of the approver is tested in T14.

### T11. Share the approver's guide and the Hungarian text review sheet with MTK

**Device:** computer. **Why:** The approver needs the one-page guide in English and Hungarian, and MTK should check the 228 Hungarian texts the users read before the Wednesday freeze (issues 404 and 352).

**Where:** The two private pages, each with its own Share menu (about 5 minutes)

**Steps**

1. Open the approver's guide (English and Hungarian on one page). Its link is in issue 404 on the board. It is a private page: use the Share menu of that page to share it with the MTK approver. The same text is the guide **Approving photos at an event** in the messmass guides (https://www.messmass.com/admin/help/guides/approving-photos), which needs a messmass login.
2. Open the Hungarian text review sheet (228 texts; its link is in the same issue 404) and share it the same way with the MTK person who reviews the texts.
3. Tell the reviewer: each row has a box for a suggestion; words in curly brackets stay; the button at the top copies the suggestions as plain text; send them back by the deadline you choose in T43.
4. Ask both people to tell you that the page opens for them.

**You should see**

- Both people can open their page on their own phone or computer.

**Write back:** `T11 PASS: sent to the approver and to the reviewer on <day>` or `T11 FAIL: one line`

**If it fails:** If the Share menu does not let you share with a person, write what it offers. Do not post the links in public places: the pages are private on purpose. Not verified: the Share menu belongs to the page host and needs your login.

### T12. Create the throw-away event under MTK Budapest

**Device:** computer. **Why:** The rehearsal must not touch the match event or the savetheworld event (its wall is live). A new event under MTK Budapest that is not linked to messmass writes nothing to messmass (issue 405).

**Where:** Admin, Events, Add Event Instance (about 5 minutes)

**Steps**

1. In the left menu open Events and press **Add Event Instance**.
2. Under Partner choose MTK Budapest.
3. Event name: TEST approval rehearsal (delete me). Leave everything else as it is and press **Create event**.
4. On the event page find the box **Event Capture URL**. Copy its address (it ends with /capture/ and a long id) and send it to your phone (a message to yourself, or AirDrop). This is the throw-away address in the next steps.
5. Check that the top of the page has no **Open in messmass** button: that confirms the event is not linked to messmass.

**You should see**

- The event page opens with the name TEST approval rehearsal (delete me).
- The box **Vetting** has a button **Open Vetting**. There is no **Open in messmass** button.

**Write back:** `T12 PASS` or `T12 FAIL: one line, what you saw`

**If it fails:** If **Create event** shows a red error, write its words. If MTK Budapest is not in the list, say so. Never use the savetheworld event instead.

### T13. Take two test photos on a phone

**Device:** phone. **Why:** This is exactly what an MTK fan does. It also gives the approver photos to decide on (issue 405).

**Where:** Your phone, the throw-away address from T12. Use your own e-mail address, one you can read on this phone (about 10 minutes)

**Steps**

1. Open the throw-away address on the phone (an iPhone in Safari if you can). If a page with a big picture and **Start** appears, press **Start**.
2. On **Before we start** tick the three boxes and press **Continue**.
3. On **Who are you?** type a name and your own e-mail address in the form (do not press the Google or Facebook buttons) and press **Continue**.
4. Press **Take photo**, take a selfie with the phone's camera and press the phone's **Use Photo**. If a frame, design or message step appears, choose any.
5. On the photo screen press **Continue**.
6. Open the address again and repeat all the pages for photo 2. Look different in the two photos so you can tell them apart (photo 1: you alone; photo 2: you alone).

**You should see**

- After **Continue** you read **Thank you!** and **Your photo is waiting for approval. We will email you the link to it as soon as it is approved.** within a few seconds, both times.
- The photo screen carries the line **Your photo will get its frame after it has been approved.** above the buttons.

**Write back:** `T13 PASS: 2 photos saved at <time>` or `T13 FAIL: on which page you stopped and what it said`

**If it fails:** Write the page you stopped on, the words of any red message, the time and a screenshot. Do not retry more than twice: three failed tries are a finding, not bad luck.

### T14. The approver finds the photos, and a third photo arrives by itself

**Device:** phone. **Why:** This proves a partner Manager, not only a global admin, can open the Vetting tab, and that the Waiting list refreshes by itself every 10 seconds, so nobody has to reload at the match (issue 373).

**Where:** The approver's own phone (or your phone with your own login: then write **alone** in your report), plus a second phone to take photo 3 (about 10 minutes)

**Steps**

1. Approver: open camera.messmass.com/admin on the phone and sign in with the e-mail you gave in T10.
2. Open Events, then TEST approval rehearsal (delete me). In the box **Vetting** press **Open Vetting**.
3. Read the top of the page: **Photo vetting is on for this event** and **Marking the people is on for this event**, then the three links **Waiting (2)**, **Rejected (0)**, **Approved (0)**.
4. Look at the Waiting cards: each shows the picture, the e-mail, Taken, Frame, Wall and one button **Review**. There is no Approve or Reject button on a card, and a partner Manager has no **Turn vetting off** or **Turn marking off** button (a global admin sees them).
5. Leave this page open and do not reload it. On the other phone take photo 3 as in T13, with two people in it.
6. Watch the first phone for up to 30 seconds.

**You should see**

- The approver reaches the Vetting tab without a **no access** page.
- Within about 15 seconds the third card appears and the link reads **Waiting (3)**, without any reload.

**Write back:** `T14 PASS` or `T14 FAIL: one line, what you saw`

**If it fails:** If the approver gets **No access** or the event is missing in the Events list, the e-mail they signed in with is not the one added in T10: compare the two and write both first letters and the page text. If the third card does not appear within a minute, write the time you took the photo. Not verified: how a person who has never used the single sign-on gets an account.

### T15. Photo 1: mark one person and approve

**Device:** phone. **Why:** The marking of the people is required before any first decision of a waiting photo: it is what the approver does for every photo at the match, so it must work with a finger on a phone (issue 542).

**Where:** The approver's phone, Vetting tab, Waiting (about 8 minutes)

**Steps**

1. Press **Review** on the oldest card (photo 1). The photo opens big, under the heading **Mark the people**. The only buttons are **Clicker** and **Nobody in this photo**: there is no Approve yet.
2. Press **Clicker** and draw a rectangle around your face with a finger: press, drag, let go. A tap is not a rectangle. Press **Retry** once and draw it again.
3. Press **Next**. Sixteen buttons appear under the photo: two rows for who it is (women and girls, then men and boys; kid, young, adult, old), a row for emotion (sad, unamused, happy, angry) and a row for merchandise (cap, scarf, jersey, flag).
4. Choose one **who** button (required) and, if you like, one emotion and one merchandise button, then press **Done**. The person gets a coloured rectangle.
5. Press **Next**. The heading changes to **Approve or reject** and a line says 1 person is marked. Press **Back to the people**, then **Next** again.
6. Press **Approve**.

**You should see**

- A green box **Done: Photo approved. The user gets the link by email.** appears and the next photo opens at once.
- At every step all the buttons are inside the screen and the page does not scroll away from them while you draw.

**Write back:** `T15 PASS` or `T15 FAIL: one line, what you saw`

**If it fails:** Write at which step it went wrong, what you pressed and what the page said, with a screenshot. A rectangle that does not follow the finger, a button cut off by the screen edge, or an Approve button that appears before any marking are all findings.

### T16. Photo 2: say nobody is in it and reject with a reason

**Device:** phone. **Why:** The approver must be able to say a photo has nobody in it, and to reject it. The rejected user gets a short note and can take another photo.

**Where:** The approver's phone, the big view; photo 2 opens by itself after photo 1 (about 4 minutes)

**Steps**

1. Photo 2 is open under **Mark the people** (if you left the big view, press **Review one by one** on the Vetting tab). Press **Nobody in this photo**. The heading changes to **Approve or reject** and a line says nobody was marked.
2. Press **Reject**. A box **Reason (optional, for the record)** appears. Type a few words.
3. Press **Confirm reject**.

**You should see**

- A green box **Done: Photo rejected. The user gets a short note.** appears and photo 3 opens at once.

**Write back:** `T16 PASS` or `T16 FAIL: one line, what you saw`

**If it fails:** Write the step, the words of any red message and a screenshot.

### T17. Photo 3: two people, remove one, skip, then approve

**Device:** phone. **Why:** Real photos have several people and the approver will make mistakes while marking; Remove and Skip are how they recover (issue 542).

**Where:** The approver's phone, the big view of photo 3, then the Vetting tab (about 7 minutes)

**Steps**

1. Photo 3 is open (after T16). Mark the first person: **Clicker**, draw, **Next**, choose who, **Done**. Press **Clicker** again and mark the second person the same way.
2. Press **Remove**: the last rectangle goes. Mark that person again.
3. Press **Next**, then **Skip this photo**.
4. The page says **All the photos are decided** and offers **Back to the Vetting tab**. That is its wording when the last waiting photo is skipped, although this one is not decided; note it if it confuses you. Press the link.
5. On the Vetting tab the photo is still in **Waiting (1)**. Press **Review** on its card: the two people you marked are still there. Press **Next**, then **Approve**.
6. Back on the Vetting tab read the three links and the card **People marked in the photos**, then open **Rejected**: photo 2 is there with a button **Approve** (do not press it).

**You should see**

- After **Skip this photo** nothing is decided: the photo is still waiting and keeps its marked people.
- After **Approve** the links read **Waiting (0)**, **Rejected (1)**, **Approved (2)**, and the card says 3 people in 3 photos that were looked at (if you marked as in T15 to T17).

**Write back:** `T17 PASS` or `T17 FAIL: one line, what you saw`

**If it fails:** Write which button did not do what its name says and what happened instead.

### T18. The two e-mails arrive

**Device:** phone. **Why:** The user learns of the decision only by e-mail. If it is slow, missing or in the spam folder, users wait for nothing at the match.

**Where:** The phone's mail app, the inbox of the address you typed in T13 (about 5 minutes)

**Steps**

1. Open your mail app. Look in the inbox and in the spam folder for two mails about TEST approval rehearsal (delete me).
2. Open the approved one. Its subject starts **Your photo from**. Read it: it greets you by name, has a link line that reads **Visit your selfie** (not a long web address) and a button **See your photo**.
3. Open the other one. Its subject starts **About your photo from**. It says the photo could not be approved and has a button **Take another photo**.
4. Write down how long after the decision each mail arrived (a rough guess is enough).

**You should see**

- Both mails arrive in the inbox within a minute or two of the decision (note it if one is in the spam folder).
- The sender name and the texts are readable and in English.

**Write back:** `T18 PASS: approved after <time>, not approved after <time>` or `T18 FAIL: which mail is missing or late, or in spam`

**If it fails:** Write which mail is missing, the time of the decision and where you looked (inbox, spam, all mail). Check that the address typed in T13 has no typo. The approver's screen may have said **an email could not be sent**: write its words.

### T19. Open the public photo page from the approved e-mail

**Device:** phone. **Why:** This is the page the user sees and shares. It must show the finished photo with its frame and a working download.

**Where:** The phone's mail app, then the browser it opens (about 3 minutes)

**Steps**

1. In the approved e-mail press the button **See your photo** (or the text link in the message).
2. Look at the page: the photo with its frame, the buttons **Download** and **Create Your Own**.
3. Press **Download**.
4. Press **Create Your Own**: it returns to the start of the event.

**You should see**

- The photo is shown framed, not the shapes of the frame and not an error.
- Download saves the picture; **Create Your Own** opens the event's first page.
- The page has the look of the event (its colours), and no band of another colour at the bottom.

**Write back:** `T19 PASS` or `T19 FAIL: one line, what you saw`

**If it fails:** Write what the page showed and the address in the browser's bar, plus a screenshot.

### T20. First real upload on the Images pages

**Device:** computer. **Why:** The Images library is new and no real upload has run on it yet, so nobody has seen the file store and the database accept one (issue 407). It must not be tried first on the match event.

**Where:** Admin, the throw-away event, Images (about 5 minutes)

**Steps**

1. Open the throw-away event and press Images in the left menu. The page is called **Event images**.
2. In the box **Upload an image for this event** choose a small picture (PNG, JPEG, WebP or SVG, under 4 MB). Wait for its preview.
3. Type a name, for example Test upload, in the box **Image name** and press **Upload**.
4. Check that the picture appears in the box **Images of this event**, with its name and a button **Delete upload**.
5. Reload the page: the picture must still be there.
6. Press **Delete upload** and confirm in the box your browser shows.

**You should see**

- After Upload the picture is in the list at once and after the reload (it was really stored).
- After the delete it is gone from the list.

**Write back:** `T20 PASS` or `T20 FAIL: one line, what you saw`

**If it fails:** Write the words of any red box (**Upload failed**, **That did not work**) and the type and size of the file. If **Delete upload** seems to do nothing, say so: a browser can block its own confirm box, and that counts as a defect.

## D. Phone checks

**When:** Tuesday 13 October, about 90 minutes in all. T21 and T22 are looks you take during the rehearsal (T13 to T17) and cost no extra time; T23 to T26 are one walk through the real MTK event on your phone; the rest are separate runs on the throw-away event. A desktop cannot show these, so they are closed on your word only (issue 406).

### T21. The one photo screen after the shutter

**Device:** phone. **Why:** After the shutter there used to be two screens (move and zoom, then **Love it**). The client asked for one. You confirmed it on 8 October; this re-checks the current version (issue 344).

**Where:** Your phone, the throw-away address, during the first photo of T13 (about 3 minutes)

**Steps**

1. Take the photo as in T13 up to the screen where your photo sits in the frame.
2. Count the screens after the shutter: there is exactly one, with your photo in the frame, a **Zoom** control, the choice **Fill frame**, **Show everything**, **Custom**, and the buttons **Retake**, **Reset** and **Continue**.
3. Look for anything old: no screen called **Love it**, no button **Try again**, no tick box about showing the photo on a public pledge wall.
4. The line **Your photo will get its frame after it has been approved.** is above the buttons.
5. Try to scroll the page with one finger: it must not scroll. All three buttons are fully readable and none is cut off at the screen edge.
6. Press **Retake** once (you return to the camera and nothing is saved), take the photo again and press **Continue**: you go straight to **Thank you!**.

**You should see**

- One screen, three buttons, nothing old, no scrolling, and **Continue** saves the photo.

**Write back:** `T21 PASS` or `T21 FAIL: one line, what you saw`

**If it fails:** Write what you saw instead and attach a screenshot of the photo screen.

### T22. Vetting on a phone: the counts follow without a reload

**Device:** phone. **Why:** On 8 October approving was slow, every button locked and the page needed a reload; it was fixed and you confirmed it. The Waiting list has since got its own refresh and the marking, so this re-checks the counts on the current version (issue 342).

**Where:** The approver's phone, during T14 to T17 (no extra time)

**Steps**

1. Do not reload the page at any time during T14 to T17.
2. After the decisions of T15 to T17 open the Vetting tab and read the three links: they agree with what you decided.
3. Open **Approved (2)**: each card has a button **View photo** that opens the public photo page.
4. Think back: was any button greyed out for more than a few seconds, or did any decision need a reload to show?

**You should see**

- **Waiting (0)**, **Rejected (1)**, **Approved (2)** without a reload, and the lists show the right photos.
- No button stayed locked and no reload was needed.

**Write back:** `T22 PASS` or `T22 FAIL: one line, what you saw`

**If it fails:** Write which count was wrong or which button stayed locked, and how long you waited.

### T23. Walk the real MTK event: the colours of the user flow

**Device:** phone. **Why:** The club's own colours (bright blue page, navy buttons) were hard to read until 8 October; the fix was measured but never looked at on a phone (issue 336).

**Where:** Your phone, https://camera.messmass.com/capture/6ac636415fa8994cb2d3df85 (the real match event; about 6 minutes)

**Steps**

1. This is the real match event: LOOK ONLY. Never type your name or e-mail there and never press anything that continues past the Who-are-you page, because that registers a test user on the live event and adds to its real figures. Use this long address and not the short one on the giant screen (FANSELFIE.ME/MTK): a visit through the short address is counted and sent to messmass. Each visit here is one anonymous visit in that event's Journey figures.
2. Open the address in Safari. On the welcome page press the START button.
3. On the consent page tick the boxes the page shows and press its button (it reads **Tovább**).
4. You are now on the Who-are-you page (**Ki vagy te?**). Look at it and read it. Do not type anything, do not press the Google or Facebook buttons, do not press **Tovább**. Go back or close the tab.
5. The camera page and the photo screen are looked at on the throw-away event (T14), which takes its colours from the partner MTK Budapest. If its colours are not the same as the real event's, say so in your answer.
6. On every page look at the colours of the text, the buttons, the boxes and the small grey lines.

**You should see**

- Every word is easy to read at arm's length: dark text on the bright blue page, readable labels on the buttons.
- The buttons are navy with a lighter blue ring (T30 shows the same colours in the admin) and no label is cut off: **Újra**, **Alaphelyzet** and **Tovább** are fully visible.
- No control is in a colour that does not belong to the event: no purple box, no faint grey description text.
- On a narrow phone the Google and Facebook buttons stand one under the other and are not clipped.

**Write back:** `T23 PASS` or `T23 FAIL: the page, the control and what its colour was`

**If it fails:** Write the page, the control and its colour, with a screenshot. Colour reports without a screenshot cannot be acted on.

### T24. Walk the real MTK event: the Hungarian pages

**Device:** phone. **Why:** The whole user flow must be in Hungarian for MTK. The pages were checked in a browser and by counting texts, never on a phone, and MTK has not reviewed the wording yet (issue 352).

**Where:** The same walk as T23 (do both at once; about 5 extra minutes)

**Steps**

1. On the walk of T23 read every word on every page, including buttons, small grey lines and the messages under the boxes (try an empty name or a wrong e-mail once to see the messages).
2. The words you should meet include **Mielőtt elkezdjük**, **Ki vagy te?**, **Fotó készítése**, **Újra**, **Alaphelyzet**, **Tovább**.
3. The welcome button reads START. That is the text stored on that page by an editor, not a Hungarian word; the decision about it is T42.
4. Write down every English word, every Hungarian word that sounds wrong, and every text that does not fit its box.

**You should see**

- No English text except names (Google, Facebook, the event's own name). No text is cut off at the edge of its box or runs outside the screen.
- This walk stops before the photo is saved, so the waiting page, the public photo page and the Hungarian e-mail are not reached here; the Hungarian e-mail is checked in T34.

**Write back:** `T24 PASS` or `T24 FAIL: the page and the wrong or English text`

**If it fails:** Write the page and the exact words (a screenshot is best). Wrong words are collected together with MTK's own suggestions (T43).

### T25. Walk the real MTK event: the giant-screen picture above START

**Device:** phone. **Why:** The welcome page shows a picture of the giant screen, drawn from the slideshow. On 9 October a phone showed an empty space with a question mark instead; that was fixed, and you have not looked since (issue 520).

**Where:** The same walk as T23, on its first page (about 2 minutes)

**Steps**

1. Open the real MTK address on your phone and stay on the first page.
2. Look above the START button.
3. Turn the phone sideways and back.

**You should see**

- A picture of the giant screen with a QR code, the line FANSELFIE.ME/MTK and the words SZKENNELJ BE! sits above START.
- The whole picture is visible (not cut off); no empty space, no question mark, no broken-picture icon. A stand-in silhouette in its photo window is normal (the sample selfie is not built yet).

**Write back:** `T25 PASS` or `T25 FAIL: one line, what you saw`

**If it fails:** Write what is above START instead and attach a screenshot.

### T26. Walk the real MTK event on an iPhone: no scroll, no zoom, no band

**Device:** phone. **Why:** An iPhone with the floating bottom bar showed a white band under the pages twice, and each fix was first declared done from a desktop check. Only a real iPhone can close this (owner rule of 7 October).

**Where:** An iPhone in Safari, the same walk as T23 (about 6 minutes)

**Steps**

1. Start the walk of T23 on an iPhone in Safari, with the address bar and the bottom bar showing as usual.
2. Do the pages in this order: welcome, consent and Who-are-you on the real MTK address (look only, as in T23), then the camera page and the photo screen on the throw-away address.
3. On the welcome page, the Who-are-you page and the camera page: try to scroll with one finger. The page must not move.
4. On the welcome and Who-are-you pages: pinch with two fingers. The page must not zoom. (The consent page may zoom: that is on purpose.)
5. On the photo screen: pinch on the photo. The photo zooms inside its frame (wanted); the page itself does not zoom.
6. On every page look at the strip between the page and Safari's bottom bar, and at the strip at the top. It must be the event's blue (the page colour), never white or grey. Look hardest at the consent page and the photo screen.
7. Turn the phone sideways on the camera page and on the photo screen, then back: the colour stays, nothing is cut off, the buttons stay reachable.

**You should see**

- No scrolling and no page zoom on the pages named, the consent page excepted.
- No white or grey band at the top or bottom of any page, in either orientation.

**Write back:** `T26 PASS` or `T26 FAIL: the page, what you saw, the phone model`

**If it fails:** A desktop cannot show this. Write the page, the phone model, the iOS version if you know it, and a screenshot that includes Safari's bottom bar.

### T27. The default consent and login pages

**Device:** phone. **Why:** Every new event gets a consent page with three required boxes and a Who-are-you page. They were built from tests and a browser, and the list editor behind them was never used by a person (issue 330).

**Where:** Your phone, the throw-away address (about 5 minutes)

**Steps**

1. Open the throw-away address and press **Start**.
2. Read the consent page: the heading **Before we start**, the line **Please accept all of the following to continue.**, and three boxes with links: **I accept the Terms and conditions**, **I accept cookies**, **I have read the Privacy policy**.
3. Tick two of the three and press **Continue**: it must not let you through.
4. Press the link of one box: it opens a page of seyuselfies.com in a new tab, and when you come back the consent page still has your ticks.
5. Tick the third box and press **Continue**.
6. On **Who are you?** read: the sign-in buttons for Google and Facebook, then **Or use your email**, the boxes **Your name** and **Your email** and **Continue**. Press **Continue** with the boxes empty: the messages **Name is required** and **Email is required** appear. Do not press Google or Facebook.

**You should see**

- **Continue** waits for all three boxes (a line **You must accept to continue** may appear).
- The links open the terms, cookie and privacy pages without losing the page you were on.
- The Who-are-you page shows both ways in and the two messages for empty boxes.

**Write back:** `T27 PASS` or `T27 FAIL: one line, what you saw`

**If it fails:** Write the step number and what the page did instead, with a screenshot.

### T28. The guided tour switch

**Device:** either. **Why:** MTK asked for the tour to be off by design, with a switch an editor can turn on. The switch was never seen in the live editor (issues 356 and 362).

**Where:** The admin on a computer for the switch, your phone for the look (about 8 minutes)

**Steps**

1. Open the throw-away event, press **Edit Event**, find **Customization** and the box **Show the guided tour**. It must be unticked. Do not change it yet.
2. On your phone open the throw-away address in a new private tab and go as far as the camera page. There are no tips, no overlay and no **Show tour** link anywhere.
3. In the admin tick **Show the guided tour** and press **Save changes** at the bottom.
4. On the phone open the address in another new private tab and go to the camera page: a tip appears (for example **Take your photo**) with **Next** or **Skip**, and a link **Show tour** is on the page. Press **Skip**, then **Show tour**: the tip comes again.
5. In the admin untick the box and press **Save changes**. A new private tab on the phone shows no tips again.

**You should see**

- Off: no tips and no **Show tour** link. On: tips on the first visit of a step, and the link that replays them. Off again: gone.

**Write back:** `T28 PASS` or `T28 FAIL: one line, what you saw`

**If it fails:** Write the state of the box, whether the tab was private, and what the phone showed. A tab that is not private may remember an earlier visit and show no tip: that is not a failure.

### T29. The event editor pages open without a crash

**Device:** phone. **Why:** On 8 October the event editor crashed (**Unknown semantic action**) for an event with no pages, because buttons were added without being registered. A scan now prevents it, but no person has used these pages since (issues 359 and 330).

**Where:** The admin on your phone (or the computer if the phone is too awkward; say which), the throw-away event (about 6 minutes)

**Steps**

1. Open the throw-away event and press **Edit Event**. The page must open.
2. Scroll to the box **Pages of the user journey**. It lists the journey in order, with built-in steps marked **Built in** and default pages marked **Default**.
3. Press **Add welcome page**: a window opens to write the page. Press **Cancel page**. Do not press **Save all**.
4. On the default consent page's row press **Customise**: the window shows the checkboxes with the switches Shown and Required and the buttons **Add checkbox** and **Remove checkbox**. Press **Cancel page**.
5. Open the left menu, Settings, then Journey defaults: the page opens with the box **Apply the journey defaults to existing events** and a **Save** button. Do not press Save.
6. On a phone: nothing runs off the right edge of any of these pages, so you never have to scroll sideways.

**You should see**

- Every page opens, every window opens and closes, and no page says **Oops! Something went wrong**.

**Write back:** `T29 PASS: on a phone or computer` or `T29 FAIL: the page and what you saw`

**If it fails:** Write the page, the button you pressed and the words of the error, with a screenshot. If something runs off the edge on a phone, name the section.

### T30. The Brand Colors panel

**Device:** phone. **Why:** The event editor used to stamp a default blue (#3B82F6) as the event's own colour when you saved anything, switching off the colours from messmass. It was fixed and the stuck blue was cleared on 4 events; nobody has looked at the panel on the live site since (issue 380).

**Where:** The admin, first the real MTK event (read only) then the throw-away event (about 6 minutes)

**Steps**

1. Open Events, search **Vasas** and open MTK Budapest x Vasas FC. Do not press anything that saves. Find the box **Brand Colors**.
2. Read the two colours (**Primary Color**, **Border/Accent Color**), the sentence under them and the **Color Preview** buttons. Do not press **Edit colors**.
3. Open the throw-away event and read its Brand Colors box. Then press **Edit Event**, find **Brand colors**: the box **Use the colours of the messmass style** is ticked and the two colour boxes are greyed. Press **Save changes** without touching anything.
4. Open the throw-away event again and read the Brand Colors box: it must not now say the colours are the event's own.

**You should see**

- MTK: neither colour is the stuck blue #3B82F6. The sentence reads **The colours of the Start button on the welcome page: they come first and give every button of the flow its look.** The preview buttons are navy with a lighter blue ring.
- Throw-away event: the sentence says the system default look is used (it has no messmass style). After the empty save it still says the same.

**Write back:** `T30 PASS` or `T30 FAIL: the event, the colours and the sentence you read`

**If it fails:** Write the two colour codes and the sentence, with a screenshot. If MTK shows the stuck blue, do not try to fix it yourself.

### T31. The four camera ways, tried with the address

**Device:** phone. **Why:** An event can take the photo in four ways, and each phone behaves differently. This tries all four on your phone without changing any setting (issue 547).

**Where:** Your phone, the throw-away address with an ending added (about 8 minutes)

**Steps**

1. Automatic: open the plain throw-away address, go to the camera page and press **Take photo**. The phone's own camera app opens. Take the photo, press **Use Photo**, then on the photo screen press **Retake**.
2. Live camera with view buttons: add `?views=1` at the very end of the address. At the camera page tap the big card (it normally reads **Ready to capture?**) and allow the camera when the phone asks. The live picture shows four buttons: **Portrait**, **Landscape**, **Wide**, **Tight**. Press each: the shape or the closeness changes at once. A small line under the picture says what the phone gave and what was asked. Press **Take**, then **Retake**.
3. Live camera, a real photo from the sensor: use `?capture=still` instead. The live picture shows with no view buttons. Press **Take**. (Safari cannot take a sensor photo and uses the picture on the screen; either is fine.) Then **Retake**.
4. Live camera, the picture as shown on the screen: use `?capture=frame` instead. Same: live picture, no view buttons, **Take**, **Retake**.

**You should see**

- In all four the button takes a photo and you reach the move-and-zoom screen with your picture; no black screen; the camera permission is asked at most once per page load.
- Nothing is saved in this step (you leave with **Retake** each time), so no photo is added to the Waiting list.

**Write back:** `T31 PASS` or `T31 FAIL: which of the four and what happened`

**If it fails:** Write which of the four failed, what you saw (black picture, no button, error text), the phone model and the iOS version.

### T32. The camera way as a setting

**Device:** either. **Why:** The same four ways can be chosen for a whole event in the editor. No event has a choice stored, so none has changed; this proves the setting reaches the phone (issue 547).

**Where:** The admin on a computer, then your phone (about 6 minutes)

**Steps**

1. Open the throw-away event, press **Edit Event**, find **Customization** and the select **Camera**. It reads **Same as the partner (Automatic: the phone's own camera app on phones, the live camera on computers (standard))**.
2. Choose **The live camera with view buttons (portrait or landscape, wide or tight)** and press **Save changes**.
3. On the phone open the plain throw-away address (no ending) and go to the camera page: the live camera with the four view buttons shows.
4. In the admin choose **Same as the partner** again and press **Save changes**. Open the plain address once more on the phone: the phone's own camera app opens again.

**You should see**

- The saved choice changes what the phone shows at once; choosing **Same as the partner** again brings back the phone's own camera app.

**Write back:** `T32 PASS` or `T32 FAIL: one line, what you saw`

**If it fails:** Write the choice you saved and what the phone showed. Do not change the Camera setting of the match event for any reason.

### T33. Marking the people in the big view: on a computer and on a phone held sideways

**Device:** either. **Why:** T15 to T17 tried the marking with a finger on an upright phone. Approvers will also use a computer with a mouse and a phone held sideways, and the sixteen buttons sit in different places (issue 542).

**Where:** A computer and the approver's phone, the throw-away event (about 10 minutes)

**Steps**

1. Take two more photos on the throw-away address as in T13 (photo 4 alone, photo 5 with two people).
2. Computer: open the throw-away event, Vetting, press **Review one by one**. Photo 4 opens big. Press **Clicker**, draw a rectangle with the mouse, press **Next**: the sixteen buttons appear over the photo. Choose who, press **Done**, then **Next** and **Approve**.
3. Phone: open the Vetting tab and press **Review** on photo 5. Hold the phone sideways. The photo is big and all the buttons are reachable without the page moving away. Mark both people, press **Next** and **Approve**.
4. While a photo is waiting, check once more that there is no way to approve without marking: before **Next** (or **Nobody in this photo**) there is no **Approve** button.

**You should see**

- On the computer the sixteen buttons are over the photo; on the phone upright they are under it; held sideways the photo stays big and nothing is cut off.
- Both photos end up in **Approved**.

**Write back:** `T33 PASS` or `T33 FAIL: the device and what you saw`

**If it fails:** Write the device, the orientation, the step and a screenshot.

## E. Look and confirm, then clean up

**When:** Tuesday 13 October, about 60 minutes; the clean-up T41 last, at the latest on Wednesday morning. These steps only look at things (and use the throw-away event), so they are allowed during the freeze too.

### T34. The e-mail says “Visit your selfie”, in your phone's mail app

**Device:** phone. **Why:** A long link made the e-mail wider than a phone, so users scrolled sideways. The link now reads **Visit your selfie** instead of the whole address. It was measured in a browser, not in a real mail app (issue 382; the change itself is merged and live since 11 October, pull request 606).

**Where:** The admin on a computer, then the mail app on your phone (about 8 minutes)

**Steps**

1. On the computer open the throw-away event and Emails in the event menu. The page is called **Emails: TEST approval rehearsal (delete me)**.
2. In the box **Approved** press **Send me a test e-mail** under the preview. A note says **Sent to** your address.
3. On the phone open the real mail app (Apple Mail or Gmail, not a web page) and find the mail whose subject starts with [Test].
4. Look at the link line: it reads **Visit your selfie** as a link, not a long web address. The button reads **See your photo**.
5. Check the width: the mail fits the screen, you cannot scroll it sideways and nothing is cut at the right edge. Rotate the phone and look again.
6. Press **Visit your selfie**. A test mail has no real photo, so it opens the event's first page.
7. Optional stress test: in the box **Approved**, in **Message**, add a line with a very long web address (for example https://camera.messmass.com/share/ followed by 150 random letters), press **Send me a test e-mail** again and check the width again. Do not save the page.
8. Hungarian: press **Edit Event**, set **User interface language** to **Magyar (Hungarian)**, press **Save changes**, open Emails again and press **Send me a test e-mail** in **Approved**. The mail is in Hungarian and the link reads **Nézd meg a szelfidet**.

**You should see**

- The label shows, the mail fits the screen in the real mail app, and the link opens the event's first page.
- The Hungarian mail reads **Nézd meg a szelfidet** and also fits.

**Write back:** `T34 PASS: label shows, fits the screen, link opens the event page` or `T34 FAIL: which of the three is wrong`

**If it fails:** Write the mail app, the phone model, which of the three things is wrong and a screenshot of the mail.

### T35. Look at the slideshow crossfade

**Device:** computer. **Why:** The crossfade (the next picture fades in over the old one) is built and off for every slideshow. You decided that it goes live only after you have seen it (answer 210). Opening the screen with an ending shows it without saving anything.

**Where:** A spare browser tab on a computer, the throw-away event's slideshow (about 5 minutes)

**Steps**

1. Open the throw-away event, press Slideshows in the event menu (it jumps to the box **Event Slideshows**). If the event has no slideshow, press **Create the default slideshow**.
2. On the card of the default slideshow (marked Default) press **Open slideshow**. The giant screen opens in a new tab and starts with the approved photos of the event (you need at least two: T15 to T17 gave you two).
3. In that tab add `?crossfade=1` at the very end of the address and press Enter. Watch for a minute: when one picture changes into the next, the new one fades in over the old one and both are visible half-way; there is no black or white flash between them.
4. Change the ending to `?crossfade=0` and watch again: the picture is replaced the old way, with a short fade. Compare the two.
5. Leave the tab open for T36. Nothing is saved by this step.

**You should see**

- With `?crossfade=1` the change is smooth with no flash and no jump; with `?crossfade=0` it looks like before.

**Write back:** `T35 PASS: the crossfade looks good` or `T35 FAIL: what looks wrong (flash, jump, flicker)`

**If it fails:** Write what you saw and when, in which browser, and a short screen recording if you can make one. The crossfade stays off for every slideshow; nothing else depends on it.

### T36. The giant screen reloads when told to

**Device:** computer. **Why:** A screen that is already open must pick up a change without anybody walking to it. **Reload the screen** and every save of the slideshow do that, and the screen also reloads itself every 3 hours. It was tested with fakes, not on a real open screen (issues 476 and 520).

**Where:** The same two tabs: the admin and the open screen from T35 (about 6 minutes)

**Steps**

1. Remove the ending from the address of the open screen and let it run.
2. In the admin, on the slideshow's card press **Reload the screen**. Note the time.
3. Watch the open screen: within about 30 seconds, at its next picture, the page reloads by itself (a short blank, then the show starts again).
4. Press **Edit slideshow**, change nothing, press **Save changes**. Watch the open screen again: it reloads at its next picture too.

**You should see**

- The open screen reloads within about 30 seconds after the button and again after the save, then shows pictures normally without any error page.

**Write back:** `T36 PASS` or `T36 FAIL: what happened and after how long`

**If it fails:** Write the time you pressed and what the screen showed after a minute. The screen reloads itself every 3 hours as a safety net.

### T37. Does a “saved” notice show in the admin?

**Device:** computer. **Why:** About 50 notices of the admin (**saved**, **deleted**, **failed**) are probably only read out to screen readers and invisible to everybody else. Nobody has looked, so the fix waits for your answer (issue 229).

**Where:** The admin on a computer, the throw-away event (about 3 minutes)

**Steps**

1. Open the throw-away event, press **Edit Event** and scroll to the box **Pages of the user journey**.
2. Press the button at the top right of that box without changing anything. It reads **Save all**; the text above it calls it Save Pages.
3. Watch the whole screen for five seconds, the corners included.

**You should see**

- A visible notice **Pages saved: Custom page flow updated successfully.** appears for a few seconds.

**Write back:** `T37 PASS: a visible notice appeared` or `T37 FAIL: nothing visible appeared`

**If it fails:** Nothing visible is the bug the issue describes, and the answer is useful: write the browser you used. The fix is one small helper that shows the notices, done after the match.

### T38. Pictures that cannot be shown are hidden, not shown as errors

**Device:** computer. **Why:** A picture whose host lost the file must never show up as an **image not found** tile on a screen, a gallery, a share page or in an e-mail. Seven photos of the AS Roma events are known to be gone (issue 514).

**Where:** The admin on a computer (about 8 minutes). Read only: do not press **Check the pictures** before the match

**Steps**

1. Open the left menu, Libraries, Slideshows, and find the card **Broken pictures**. Read the line **N photos are hidden because their pictures are gone. M photos have not been checked this week.** and the part **Logos, frames, page pictures and e-mail pictures**. Press none of its buttons.
2. Open Events and search **Lupetto**, then **Roma**. Open AS Roma - Lupetto Day, AS Roma x Udine and Lupetto Day one after the other and press **Open the gallery** on each.
3. On the gallery read the blue notice at the top (for example **5 photos are hidden**) and look through the pictures.
4. If the event has a slideshow, open it (**Open slideshow**) and watch for two minutes.

**You should see**

- The card says about 7 photos are hidden (the number can only change when a check is run).
- The gallery notice says that those pictures are gone from their host, are not shown anywhere, and that nothing was deleted.
- Pass rule: you see no grey **image not found** tile, no broken-picture icon and no empty frame in the gallery or on the slideshow; the hidden photos are simply missing and the notice counts them.

**Write back:** `T38 PASS: N hidden on the card` or `T38 FAIL: where you saw an error tile or a broken picture`

**If it fails:** Write where (gallery, slideshow, card) and attach a screenshot. The share page and the e-mail of a hidden photo cannot be reached from a screen; they were checked from the code and with read-only requests on 9 October (the share page of a gone photo answers **not found**), so they are not part of your test.

### T39. The Analytics view of an event and of all events

**Device:** computer. **Why:** After the match this is where the first real figures are read. It must load fast and agree with what you did (issue 521).

**Where:** The admin on a computer, the throw-away event, then Operations, Analytics (about 6 minutes)

**Steps**

1. Open the throw-away event and Analytics in the event menu. The line above the tabs says what is counted.
2. On the tab **Overview** read **Users**, **Approval rate**, **Photo link e-mails sent** and **People marked**.
3. Open the tab **Vetting and people** and read **Waiting now**, **Approved** and **Declined**.
4. Open the left menu, Operations, Analytics: the throw-away event is a row in the table, and its name opens its tab.
5. Change the days or the clock (Budapest or UTC): the numbers change and the browser address changes too, so a report can be shared as a link.

**You should see**

- The page opens in a few seconds with no error. Users reads 1 (you used one e-mail address).
- **Waiting now** 0, and **Approved** plus **Declined** add up to the number of photos you saved (5 if you did T13, T14 and T33).
- **Approved** matches the e-mails sent (**Photo link e-mails sent**), and **People marked** matches the rectangles you kept in T15 to T17 and T33.

**Write back:** `T39 PASS` or `T39 FAIL: the figure and what it says against what you did`

**If it fails:** Write the figure, the number shown, the number you expected and the days chosen.

### T40. The Journey tab and the kill switch

**Device:** computer. **Why:** The anonymous journey recording is on for every event. You must see that it counts a real phone, and you must be able to switch it off and on again within seconds if anything looks wrong at the match (issue 521).

**Where:** The admin on a computer and your phone, the throw-away event (about 10 minutes). Do not leave the recording off

**Steps**

1. Open the throw-away event, Analytics, tab **Journey**. The box at the top says **The journey recording is on for every event**.
2. Read **Visits**, **Saved a photo**, **Steps reached**, **Devices and time** and **Camera, photos and saving**.
3. Write down the number of Visits. Press **Switch the recording off**, then **Confirm: switch it off**. The box now says the recording is off. Wait 40 seconds.
4. On the phone open the throw-away address and reach the Who-are-you page, then close it. Reload the Journey tab: Visits has not grown.
5. Press **Switch the recording on**. The box says it is on again. Wait 40 seconds, open the address on the phone again and go to the Who-are-you page. Reload the Journey tab: Visits has grown by one.

**You should see**

- Visits is at least 1, **Saved a photo** at least 1, the devices include **iPhone or iPad** if you used one, and **Photos taken** counts **The device's own camera**. A count can be a little lower than what you did (a record can be lost, never invented).
- Off: Visits does not grow. On again: it grows. The box tells the state each time.

**Write back:** `T40 PASS: recording is ON again` or `T40 FAIL: one line, what you saw`

**If it fails:** If the recording is off when you finish, press **Switch the recording on** first, then write the FAIL line. It is global: it covers every event, the match event included, so never leave it off. The switch asks you inside the page, never in a browser box.

### T41. Delete the throw-away event

**Device:** computer. **Why:** The test event, its slideshow and its photos must not linger under MTK Budapest (issue 405). Do this last, when T41 is the only step left.

**Where:** The admin on a computer (about 3 minutes)

**Steps**

1. Open the throw-away event page. Check the name: TEST approval rehearsal (delete me).
2. Press the red **Delete** button next to **Edit Event**. A box **Delete event** shows the event's name and asks you to confirm. Press **Delete** in the box.
3. You land on the Events list. Search **TEST approval**: the event is gone.
4. If in T10 you used a second e-mail address of your own as a stand-in approver, remove it: Partners, MTK Budapest, box **Partner User Access**, **Remove**. Do not remove the real approver.

**You should see**

- The event is no longer in the list. Its test photos stay stored but hidden, because deleting an event removes only the event itself, not its photos, slideshows or files.

**Write back:** `T41 PASS: deleted TEST approval rehearsal (delete me)` or `T41 FAIL: one line`

**If it fails:** Write the words of any error. Do not delete any other event. Name the deleted event in your report so its leftover test photos can be cleaned up later.

## F. Decisions waiting for you

**When:** Answer by Tuesday 13 October evening, so anything that has to change on the live event can be done before the freeze. The decision about the old IP addresses is T09 in section B. T45 depends on T03 and T46 on T37.

### T42. The label of the MTK welcome button: START or INDÍTÁS

**Device:** either. **Why:** The button of the MTK welcome page reads START, the text an editor stored on that page. The Hungarian dictionary's own word is Indítás. Both are understood (issue 409).

**Where:** A decision, no screen (about 1 minute)

**Steps**

1. START (the default): leave it as it is. Nothing changes on the live event.
2. INDÍTÁS: the label field of the MTK welcome page is changed to INDÍTÁS, one field of the live event, done only after your word here and before Wednesday.

**You should see**

- If you do not answer, START stays.

**Write back:** `T42 START` or `T42 INDÍTÁS`

**If it fails:** If you cannot decide, say so: START stays. If you want to see both on the phone first, say so; the change is one field and can be undone in a minute.

### T43. MTK's Hungarian suggestions: when do they have to arrive?

**Device:** either. **Why:** MTK reviews the 228 Hungarian texts (T11). The texts users read are frozen from Wednesday, so a suggestion that arrives late cannot go in before the match (issue 410).

**Where:** A decision, no screen (about 1 minute)

**Steps**

1. TUESDAY (the proposal): ask MTK to send their suggestions by Tuesday 13 October at noon. They are applied in one pull request that lists the dictionary keys; you approve the merge. Anything that arrives later waits until after the match.
2. AFTER: all suggestions wait until after the match, so nothing in the user flow changes before Friday.

**You should see**

- If you do not answer, TUESDAY stays the proposal and MTK is told the deadline.

**Write back:** `T43 TUESDAY` or `T43 AFTER`

**If it fails:** If MTK cannot meet Tuesday, answer AFTER.

### T44. The welcome-screen backfill for existing events

**Device:** either. **Why:** Only new events get the giant-screen picture on their welcome page and a default slideshow. A card on the Slideshows page can make them for existing events; it is never run by itself, and it changes what users of those events see (issues 326 and 327).

**Where:** A decision, no screen (about 1 minute)

**Steps**

1. LATER (the default): after the match. On Saturday 17 October the team presses **Count what would be made (dry run)** on the Slideshows page, you read the list, and you tick the events yourself before anything is made.
2. NEVER: existing events keep no welcome-screen picture; only new events get one.

**You should see**

- Whatever you choose, nothing is made before the match.

**Write back:** `T44 LATER` or `T44 NEVER`

**If it fails:** If you are unsure, answer LATER: nothing is lost by waiting.

### T45. Keep the unframed photo at approval: merge pull request 609, in one of two ways

**Device:** either. **Why:** Today the approval deletes the unframed crop of a photo, so the framed picture is then the only copy. Pull request 609 keeps the crop, copies it to ImgBB and records every copy of a photo (issue 509, decision 295). It changes the approval path and writes new fields on live photos, so it is merged only when you name it, and it has to be live by Tuesday 13 October because the approval path is frozen from Wednesday. A second pull request (612) adds the Image safety card to the Slideshows page; it follows 609, is admin only, and is merged by me after 609.

**Where:** A decision, in the chat (about 2 minutes). Read T03 first

**Steps**

1. merge 609: the unframed crop is kept in our Vercel Blob store AND copied to ImgBB. Choose it only if T03 shows the Blob store has room (a Pro plan, or a Hobby store far below 1 GB): each approved photo adds about 0.43 MB to the store, and a full store stops every picture read and write.
2. 609 B: the same, but once the ImgBB copy of the crop is verified, the crop is deleted from our Blob store. Nothing is ever without a verified copy and the Blob store does not grow. Choose it if T03 shows a Hobby plan close to its limit, or if you are unsure.

**You should see**

- If you do not answer by Tuesday 13 October at noon, I merge the 609 B way, because it keeps every photo safe and cannot fill the store. Write the answer in the chat in these words: merge 609, or 609 B.

**Write back:** `T45 merge 609` or `T45 609 B`

**If it fails:** If T03 shows a Hobby plan with the store above about 600 MB, answer 609 B, or upgrade the plan first and then answer merge 609.

### T46. The admin notices: build the fix?

**Device:** either. **Why:** T37 shows whether the **saved**, **deleted** and **failed** notices of the admin are visible. If they are not, the fix is one small helper that draws them, used in 12 admin files, with a test that stops the old way from coming back (issue 229). It touches the admin only, not the capture path, the giant screen or the decisions on the Vetting tab.

**Where:** A decision, after T37 (about 1 minute)

**Steps**

1. GO (the default when T37 says nothing is visible): the fix is built and merged before Wednesday after the full checks, and you look again at the same step. If T37 says the notice is visible, there is nothing to build.
2. AFTER: the fix is built after the match; until then the admin gives no visible feedback after a save or a delete.

**You should see**

- If T37 passed, nothing is built whatever you answer.

**Write back:** `T46 GO` or `T46 AFTER`

**If it fails:** If you want to see what the notice would look like first, say so.

### T47. Report the two design-system findings to the GDS repository?

**Device:** either. **Why:** Two findings made in the camera app belong to the design system, which is another repository. The colour roles declared with light-dark() do not resolve in a production build, so cards lose their border and texts their colour; and the list of notices has no place on the screen, which is why the admin notices may be invisible (T37). Nothing has been reported there yet (handover of 9 October).

**Where:** A decision, in the chat (about 1 minute)

**Steps**

1. YES (the default): one issue for each finding is written in the GDS repository (sovereignsquad/general-design-system) with the measurements; you read the text before it is posted.
2. NO: nothing is reported; the camera app keeps its own workaround (its check refuses the unsafe colour roles) and the notice helper of T46.

**You should see**

- If you do not answer, nothing is posted anywhere.

**Write back:** `T47 YES` or `T47 NO`

**If it fails:** If you want a different wording or a different place to report, say so.

## Image safety card (issue 509)

PENDING: filled in when the pull request is merged.

## Rate limits (issue 470) and the report partner template (issue 430)

**When:** Any day before Friday, about 15 minutes. These are changes in messmass (pull requests 474 and 475), merged and live since the evening of 11 October. The image safety card and the dependency changes are still pending.

### T48. Open a messmass report: it still loads under the new limits

**Device:** computer. **Why:** On 11 October the read limit of messmass went from 500 to 120 a minute for each internet address and path, and the report pages became their own class of 60 page loads a minute from one address (pull request 475, issue 470). A normal visit uses far less, but the limit is new and a refusal on a report page would be seen by clients.

**Where:** Any computer, messmass.com (about 5 minutes)

**Steps**

1. Open the messmass admin (messmass.com/admin), then Events, and open the report of the match event, MTK Budapest x Vasas FC. A report address looks like messmass.com/report/ followed by the event's slug.
2. Wait until all the charts have loaded. Then reload the page five times, one after the other.
3. Open the report of one more event, any.
4. Look for the words **Too many requests** or a Retry button.

**You should see**

- Every load shows the full report: no refused request and no Retry button. The limit would be reached only after 60 page loads in one minute from the same network.

**Write back:** `T48 PASS` or `T48 FAIL: the page, the words you saw and the time`

**If it fails:** Write the page, the words, the time and whether you were on a shared network. A refusal lasts at most a minute. Not verified: where exactly the report link sits in the messmass admin (the address pattern was checked in the code).

### T49. Know the messmass limits before a day with many people on one network

**Device:** either. **Why:** The limits count per internet address, and a stadium network is one address for everybody on it (pull request 475).

**Where:** A read, no screen (about 3 minutes)

**Steps**

1. Report pages: 60 page loads a minute from one address. Ten people with three tabs each, all opening in the same minute, reach about half of it.
2. All other reads: 120 a minute from one address and path.
3. Signing in to messmass: 5 sign-ins in 15 minutes from one address. If more than five of your people sign in to messmass from the stadium network within a quarter of an hour, the sixth is refused.
4. A refused request waits at most 60 seconds, and the report page then has a Retry button.
5. So: sign in to messmass before the doors, and let anybody who needs messmass during the match use mobile data instead of the stadium network.

**You should see**

- You know the three numbers and who needs messmass at the stadium.

**Write back:** `T49 PASS: nobody signs in to messmass at the stadium` or `T49 PASS: N people will, and they have another way` or `T49 FAIL: more than five sign in from the stadium network and I have no other way`

**If it fails:** Write how many people and when, and what other network they can use. Nothing is lost by waiting a minute after a refusal.

### T50. The report of an event whose partner has a report template

**Device:** computer. **Why:** Until 11 October a messmass report looked for the partner of its event only in an old field, so events saved the current way showed the default template and colours. Pull request 474 (issue 430) fixes that: an event whose partner has a report template or style, and has none of its own, now shows the partner's. That is the documented order (the event, then the partner, then the default), but it changes how those reports look, and nobody counted which events change.

**Where:** Any computer, messmass.com (about 5 minutes)

**Steps**

1. Open the messmass report of the match event (as in T48) and look at the whole page: colours, logos, the figures.
2. Ask: is this the look you showed MTK (their template and colours), or the plain default look?
3. Open the report of one event of another partner that has its own report style (for example the last event you showed a customer) and ask the same.

**You should see**

- Each report shows the look of its partner or its own style; nothing is broken or empty.

**Write back:** `T50 PASS` or `T50 FAIL: the event and what looks different`

**If it fails:** Write the event, what the page looks like and what it should look like. Do not change anything yourself; a revert is possible for the whole change.

## Dependency changes (what to watch after they are merged)

**When:** Tuesday 13 October, 5 minutes, after the rehearsal photos exist. Camera pull requests 610, 611 and 613 are merged: the zip maker for the image export was replaced (archiver 7 to 8), the lint chain and about 9 unused files and 13 old one-off scripts were removed. Nothing the users or the approver see changed; the image export is the one place a person can notice.

### T51. Download the images ZIP of the throw-away event

**Device:** computer. **Why:** The export that builds the ZIP now uses the next major version of its library (pull request 610). It was tested with an independent reader and a real-fetch harness, but never by a person on the live admin. It is admin only; no user and no approver touches it.

**Where:** The admin on a computer, the throw-away event after the rehearsal photos were approved (about 5 minutes)

**Steps**

1. Open the admin, then the throw-away event (Events, the event's name). Scroll to the card **Images** (it says **Originals and finals**).
2. Press **ZIP**. Your browser downloads a file ending in .zip.
3. Open the file (double-click it). Look at the list of files inside.
4. Open two of the pictures.

**You should see**

- The ZIP opens without a message that it is damaged. It holds one picture for every photo of the event that was approved in the rehearsal, with names you can read.
- The pictures open and look like the photos you took. There is no file called _errors.txt (if there is one, it names the picture that could not be fetched).

**Write back:** `T51 PASS` or `T51 FAIL: what the browser said or what the ZIP held`

**If it fails:** Write what the download did (nothing, an error page, a damaged file) and how many files the ZIP held. Do not retry more than twice. This does not block the match.

## H. The day of the match: run sheet

**When:** Friday 16 October. One page: before the doors, during, if something goes wrong, after. Nothing here changes the match event on the way in; only M3 does, and only when something goes wrong. From Wednesday the capture path, the screen and the approver's screens are frozen: do not change them, report.

### M1. Before the doors

**Device:** either. **Why:** Most match-day problems are set-up problems found too late. These checks are made in this order on Friday morning, at least 90 minutes before the doors.

**Where:** The computer at the giant screen, your phone and the approver's phone

**Steps**

1. Giant screen computer: wired network if there is any; display sleep and screen saver off; nothing else on top of the browser and no pop-up notifications; no browser update scheduled.
2. On that computer open the screen with `?debug=1` added at the end of its address (event page, box **Event Slideshows**, the card **Main screen (MTK x Vasas design)**, **Open slideshow**). A small panel in the corner lists lines. Watch it for one minute: lines **slide_shown** keep coming, a heartbeat every 10 seconds, no stall and no error.
3. Remove `?debug=1` and reload. Make the page full screen: double-click the picture, or press F, or use the Full screen button at the right end of the bar along the bottom. Nothing may lie over it.
4. Approver: signs in on their phone (camera.messmass.com/admin, Events, the match event, **Open Vetting**). The three links Waiting, Rejected, Approved show. A second approver, or you on your computer as global admin, is signed in too.
5. Both phones: charged, power saver off, auto-lock on Never while approving.
6. On the Vetting tab read **Photo vetting is on for this event** and **Marking the people is on for this event**.
7. Analytics, tab **Journey** of the match event: **The journey recording is on for every event**.
8. Do not scan the QR code yourself before the doors open: a scan is counted and sent to messmass as a real figure. After the doors open, the first fan's scan is the proof that the link counting works; look at the link's count in the event's Short links once, a few minutes in.

**You should see**

- Every line holds. The giant screen shows pictures and the QR code, the approver sees the three links, and both switches read **on**.

**Write back:** `M1 PASS` or `M1 FAIL: the line number and what you saw`

**If it fails:** Write the line number and what you saw at once. Do not change settings on the match event yourself.

### M2. During the match: what to watch

**Device:** either. **Why:** Four places tell you early whether the evening goes well. Look at them every ten minutes; it takes one minute.

**Where:** Your phone or computer, signed in as global admin

**Steps**

1. Vetting tab of the match event, **Waiting**: the oldest waiting photo should be a few minutes old at most. The list refreshes by itself every 10 seconds.
2. The giant screen: new approved photos appear, pictures change every few seconds, and there is never an **image not found** tile or a frozen picture.
3. Analytics, tab **Journey**: **Visits** and **Saved a photo** grow; **Camera denied** and **Save failed** stay small.
4. Ask the approver about red messages (**not approved**, **an email could not be sent**, **No answer arrived from the server**). Each one is written down with the time and the name on the card.
5. Optional, the Vercel project 04_camera, Logs: filter slideshow_diagnostic and look for the words stall and reload held. If you see many in a row, write to the chat.
6. Anything wrong: write to the chat at once: M2 FAIL, what you see, since when, on which page or device, and a screenshot. For the approver, add the words of the red message.

**You should see**

- The waiting list stays short, the screen keeps moving, the journey figures grow.

**Write back:** `M2 PASS: no problems` or `M2 FAIL: what, since when, where`

**If it fails:** Section M3 lists what you can do yourself at once. For anything else, write to the chat before you touch a setting.

### M3. If something goes wrong: one move for each risk

**Device:** either. **Why:** Each move is one action you can take alone, can be undone, and does not delete anything.

**Where:** The admin, signed in as global admin

**Steps**

1. The journey figures look wrong, or you suspect the recording of slowing anything: Analytics, tab **Journey**, **Switch the recording off**, then **Confirm: switch it off**. It takes effect within 30 seconds, photos and everything else carry on, and what was recorded stays. To undo: **Switch the recording on**.
2. The giant screen is frozen, blank or shows an error: on the event page, in the box **Event Slideshows**, press **Reload the screen** on its card (the open screen reloads at its next picture); if it is stuck, reload the browser tab (Command+R or F5) and make it full screen again. The screen also reloads itself every 3 hours and recovers by itself after a stall.
3. The approver cannot approve (signed out, phone dead, page not loading): sign in again with the same e-mail, or hand over to the second approver, or approve yourself on your computer (Vetting tab, **Review**). Waiting photos lose nothing; they wait.
4. Approving is too slow because of the marking: Vetting tab, **Turn marking off** (global admin). The quick **Approve** and **Reject** buttons and **Approve selected** come back. To undo: **Turn marking on**.
5. Last resort only, when nobody can approve at all and the screen would stay empty: Vetting tab, **Turn vetting off**, then **Confirm turn off**. New photos then appear on the screen and are e-mailed with no check; photos already waiting can still be approved. Turn vetting on again afterwards.
6. Users say the camera does not open: do not change the Camera setting during the match. Write to the chat at once with the phone model and a screenshot.

**You should see**

- After each action the page shows the new state in words (for example **The journey recording is off for every event**).

**Write back:** `M3 PASS: not needed` or `M3 DONE: which move, at what time, and what happened`

**If it fails:** If a button does nothing, reload the page once and press it again; if it still does nothing, write to the chat.

### M4. After the match

**Device:** either. **Why:** The first live vetted event is the proof that the whole chain works (issue 271). The figures of this evening are the first real ones.

**Where:** The admin, as soon as the last users have left

**Steps**

1. Change nothing: no switch off, no **Check the pictures**, no backfill. The after-match list starts on Saturday 17 October.
2. Vetting tab of the match event: **Waiting** should be 0. Take a screenshot of the three links.
3. Analytics, tabs **Overview** and **Journey**: take a screenshot of each.
4. The first-live-event list: a photo that was waiting was not on the screen or on the public photo page; an approved photo appeared on the screen; an approved user got the e-mail with the link (ask two users, or read **Photo link e-mails sent**).
5. Write down every problem with the time and what you saw.

**You should see**

- Waiting is 0 and the list holds.

**Write back:** `M4 PASS: the list holds` or `M4 FAIL: which point failed`

**If it fails:** Write the point and what you saw. Nothing is undone in a hurry: the match photos and their records are safe.
