# Email template verification

> The format, the legal part, the editor and the variables are being redesigned: see `docs/EMAIL_FORMAT_PLAN.md` (epic #463). What follows describes the e-mails as they are today.

Event result email setups have one delivery mode, `after_save`: send immediately when the saved result is ready (the approved e-mail). The two older modes of the removed try-on integration, `after_related` (the related photos are ready) and `after_tryon_resubmission_approved` (an update after an approved try-on rerun), are gone (issue 557, `docs/TRYON_REMOVED.md`); an event's stored fields for them are ignored, and saving the Emails page drops them.

Supported variables (`lib/email/variables.ts`; a variable with no value for the event is left out of the e-mail, never sent as `{name}`):

- `{name}`: participant display name.
- `{event}`: event name.
- `{link}`: public share page URL.
- `{terms}`: event terms and conditions URL.
- `{eventlink}`: the link to the event: its own short link when the editor set a URL slug (the default), else its capture page.
- `{partner}`: the partner (club or organiser); `{home}`, `{visitor}`, `{teams}`: the two sides of the match (`{partner1}`, `{partner2}` are other names for the first two); `{date}`: the date of the event in the language of the event; `{location}`: the place of the event.

### Format of the words (`lib/email/rich.ts`)

Paragraphs are separated by a blank line. A paragraph that starts with `# ` is a title, `-# ` is small text, `+# ` is large text. Inside a paragraph: `**bold**`, `*italic*`, `[label](https://address)` (a link, bold and underlined; the address may be `{link}` or `{terms}`), a bare web address (a link). A paragraph that is only `![what it shows](https://picture)` is a **picture** (centred, as wide as the e-mail at most), and `[![what it shows](https://picture)](https://address)` is a picture that is a link; the address behind it may be `{link}`, `{terms}` or `{eventlink}`. The picture must be in the app's own storage (the Blob store, the logo storage or imgbb): any other address is left out of the e-mail and the preview says so. The plain-text part names it by its description (and the address when it is a link). The editor's **Picture** button chooses or uploads one from the event's image library (PNG or JPEG: e-mail apps do not all draw WebP or SVG). A backslash writes the next sign as it is (`\*`). Nothing else is markup and raw HTML is always escaped. A text with none of these is drawn exactly as plain text always was.

### Long links and narrow screens (issue 382)

A long share link used to make the e-mail wider than a phone screen, so the user had to scroll sideways. Now nothing in an e-mail is wider than the screen:

- **The tables have a fixed layout** (`table-layout:fixed`), so a cell is never wider than the table, and the page has a viewport line.
- **Every element that holds words or a link** (the paragraphs, the text links, the header, the event name, the card, the legal part, the button) carries `EMAIL_WRAP_STYLE` (`lib/email/rich.ts`): `overflow-wrap:anywhere` and, for older mail clients, `word-wrap:break-word` and `word-break:break-word`. A long word, a long name or a long address breaks inside the e-mail.
- **A web address in the text** is written out whole up to `MAX_SHOWN_ADDRESS` (64 characters, so a share link of about 60 is whole). A longer one is shown as its first part and an ellipsis; the link behind it is always the whole address, and the plain-text part keeps the whole address. A long address also gets soft break points (`wbr`, not part of the copied text) after its slashes, query signs and ampersands, so it wraps where it should even in a client that ignores `overflow-wrap`.
- The button may be narrower than its label (`max-width:100%`), and its label wraps.
- Short addresses and ordinary text look exactly as before.

Checked with the rendered e-mails (English and Hungarian, themed and plain layout, a 100-character token in the link) in a browser at 320, 360, 375 and 430 px: none is wider than the screen; before the change every one was about 1100 px wide.

### Canonical body style

Template bodies should use the exact grammar and ordering below. This is the standard enforced in onboarding/validation flows:

```text
Hi {name},

Thank you for enjoying the {event} experience.

Your photo is ready. Don't forget to share it on your social media!
{link}

AI is fun, but it can make mistakes. If you want to make a new image, feel free to come back to us.

Wishing you an unforgettable time at {event}.

Policies and General Terms and Conditions:
{terms}
```

For rerun-approved updates, the default subject and body are:

```text
Hi {name},

Thank you for enjoying the {event} experience.

Your updated photo is ready. Don't forget to share it on your social media!
{link}

AI is fun, but it can make mistakes. If you want to make a new image, feel free to come back to us.

Wishing you an unforgettable time at {event}.

Policies and General Terms and Conditions:
{terms}
```

The phrase "your event" in legacy templates is intentionally normalized to `{event}` for consistency.

Use `POST /api/admin/events/{eventMongoId}/email-preview` to render and validate templates without sending email. Omit `templateType` to validate the full matrix, or pass one of the delivery modes above. Optionally pass `sampleSubmissionId` to preview with a real submission context.

The preview endpoint returns `validations[]` with `missingPlaceholders`, `missingValues`, `warnings`, `renderedSubject`, and `renderedBodyPreview`. It never calls the email provider and never mutates submission email flags.
### Supported placeholders


## The editor and the preview (epic 463, segment E4)

The words of an e-mail and the legal part are written with a toolbar editor (`components/admin/kit/EmailTextEditor.tsx`): bold, italic, title, large and small text, a link (the address must be https, http or mailto, or `{link}`, `{terms}`, `{eventlink}`) and a menu of variables; next to it the preview (`EmailPreview.tsx`) draws the e-mail at the width of a phone in the look of the event, from the text as typed (saved or not), and says which variables it could not fill. The preview is `POST /api/admin/emails/preview`, which calls the same composer as the sender (`lib/email/compose.ts`), so it is what a user gets. Pages: `Emails` under Settings (the general legal part) and `Emails` in the partner menu (the partner's).

## The legal part (epic 463, `lib/email/legal-rules.ts` and `lib/email/legal.ts`)

The legal part is the same at every e-mail of an event, so it is one slot with three levels, written once per language in the format above: the **general** one (a global admin), the **partner's** and the **event's**. An event follows its partner and the partner follows the general one each time it is read; what a level sets is its own and the default of the levels below; a later change above never overrides an own value. It is drawn as **small print under the message and the button**, in the muted colour of the card, and appended to the plain-text part. Where no level has a legal part for the event's language, nothing is added. When there is one, the standard last paragraph of the default e-mails ("Policies and General Terms and Conditions: {terms}") is left out of the message so the terms are not written twice; a legal paragraph an editor wrote in their own words stays in the message until it is moved. Stored as `admin_settings` `email-legal`, `Partner.emailLegal`, `Event.emailLegal`; routes `GET`/`PUT /api/admin/emails/legal`, `/api/partners/<id>/email-legal`, `/api/events/<id>/email-legal`.


## Test e-mail (epic 463, segment E6)

Every preview has **Send me a test e-mail**: the e-mail as drawn is made and sent by the same code a user's e-mail goes through (`POST /api/admin/emails/test`) to **the e-mail address of the signed-in editor and nobody else** (a recipient in the request is ignored), with `[Test]` in front of the subject, in the look and with the data of the event when the preview is of an event (manager access). Nothing is stored. A server without the e-mail key or sender address answers 503 with that reason, a provider failure 502 with its reason.

## The Emails page of an event (epic 463)

`Emails` in the event menu (`/admin/events/<id>/emails`) holds everything an editor sets about the e-mails of one event: for each of the five types a switch (shown as On or Off and whether it is the default or a choice; "Use the default" takes the choice away), the subject and the message in the toolbar editor with the preview beside it, the sender display name and the link to the terms, and the legal part of the event. A switch and a text that are the default are not stored: the event follows the default. `GET`/`PUT /api/admin/events/<id>/emails`. The footer picture of the e-mails stays with the other pictures (Edit and pages, and the partner's Pictures).

## The five e-mail types (epic 463, `lib/email/types.ts`)

| Type | When | On by default | Stored |
|---|---|---|---|
| welcome | when somebody registers (gives name and e-mail, or signs in, before the photo) | no | `notifications.types.welcome` |
| arrived | when somebody submits a photo (later other media) | no | `types.arrived` |
| approved | when the photo is approved, with the links: at once for an event without vetting, by a moderator with it | **yes** | `types.approved`; the old "after save" pair is the same e-mail |
| declined | when a moderator declines the photo | **yes** | `types.declined` |
| follow up | one week after the event, to users with an approved photo | no | `types.followUp`; sent by the daily job (below); the partner can set the default of its events (`Partner.followUpEmail`) |

Each type has `enabled` (a switch), `subject` and `body` (the event's own, in the format above). **A stored choice wins; an event with none follows the default** (owner, answer 204: "on" means every event, including ones that never turned e-mails on). The old fields keep their meaning: `submissionResultEmailEnabled: false` stored by an editor still turns the old switches off, the three modes' own subject/body stay, the two try-on e-mails (`after related photos`, `after approved resubmission`) are unchanged. For a vetted photo the approved e-mail is how the user gets the link, so only the new switch `types.approved.enabled = false` stops it. The default texts are the dictionary keys `email.welcomeSubject/Body`, `email.arrivedSubject/Body`, `email.followUpSubject/Body` (English and Hungarian, with the standard terms line, which a legal part replaces) and the existing `email.subject/body` (approved) and `email.notApprovedSubject/Body` (declined). `PATCH /api/events/<id>` stores only what the editor chose (`lib/email/notification-settings.ts`), nothing is filled in with a default.


## When the e-mails are sent (epic 463, `lib/email/triggers.ts`)

- **approved**: at once when a photo of an event without vetting is saved (the finalize call), and when a moderator approves a photo of a vetted event.
- **declined**: when a moderator declines a photo.
- **arrived**: when a photo is submitted (`POST /api/submissions`, after the answer is sent; and at the finalize call when the address is known only then), once for each photo (`metadata.arrivedEmailSentAt`), with no button because there is nothing to link to yet.
- **welcome**: when the user is identified. The capture page calls `POST /api/events/<id or URL slug>/register` with the name and e-mail once the user typed them on the "Who are you" step or signed in, and only when the event has welcome on (`welcomeEmailEnabled` in the event answer). The server keeps one row for each event and address in `email_registrations`, claims it before the send and gives the claim back when the send fails, so the e-mail goes once. The address is not verified, so the e-mail is the welcome note and the link to the event (its short link when it has a URL slug); the answer never says whether an e-mail went.
- **follow up** (issue 559, owner answer 296: "asap"): sent by the **daily job** (`GET /api/internal/follow-up-emails`, `lib/email/follow-up.ts`), not by a trigger. The rules, all in `lib/email/follow-up-rules.ts`:
  - **Which event.** It has the follow up **on**: **the event's own choice, else its partner's default, else off** (the brick rule; nothing is copied into the event, so a change of the partner's default reaches every event that never chose). The partner sets its default in its **Emails** page (`Partner.followUpEmail`, `GET`/`PUT /api/partners/<id>/email-defaults`); the event chooses in its Emails page as for any e-mail (`notifications.types.followUp.enabled`). The event must have a **date** (`Event.eventDate`); with none it sends nothing, and the event's Emails page says so.
  - **When.** From the **7th day after the day of the event** (a calendar day in Europe/Budapest, as `{date}`), and, if a run was missed, until `FOLLOW_UP_MAX_AGE_DAYS` after it (default **21**, a whole number from 8 to 120): a job that did not run for a few days catches up, an event from months ago is never mailed because somebody switched it on late.
  - **Which user.** Gave an e-mail address (not a placeholder), has a **publicly visible photo** at the event (approved or never vetted, not archived, not hidden, not gone; not a try-on result: `publiclyVisibleClauses`) and **agreed to the terms**: one of those photos carries an accepted consent record (`Submission.consents`: the consent page, or the one sentence of the Who are you page). A user without an accepted consent record is counted and left out. **One e-mail for each address and event**, whatever the number of photos; `{link}` and the button lead to the **newest** of the user's photos (its share token).
  - **Never twice.** Each e-mail is claimed first in `email_follow_ups` (`_id` = `followup:<event>:<hash of the address>`, so the row holds no address, and the id is unique in MongoDB whatever indexes exist): only the run that wins the claim sends, so the job is safe to run twice and at the same time. A send that fails gives the claim back, adds an attempt and keeps a short reason code (`send_failed`, `missing_api_key`, ...; never the provider's words) and is tried again on the next run, up to **3 attempts**. A claim with no answer (a run stopped in between) is never taken over, because the e-mail may have gone: it is counted as *held*.
  - **Limits.** A run sends at most **120** e-mails and stops starting new ones after 40 seconds; what is left (`remaining`) is sent by the next run or the next press of the button.
  - **Text, legal part, look.** The same as every other e-mail of the event: the editable subject and message of the type (the event's own or the default in its language), the legal part of the event, the sender and terms link, the event's look and footer picture (`lib/email/typed-email.ts` prepares it once per event). The default text is `email.followUpSubject` and `email.followUpBody` (the Dictionary, editable at every level).
  - **By hand.** **Settings > Emails > Follow-up e-mails** (global admins; `POST /api/admin/follow-up-emails`): **Count what would be sent (dry run)** reads and counts and writes and sends nothing (it is also what a request that does not say otherwise does); **Send now** is offered after a count and asks a second time with the number. The card also says whether `CRON_SECRET` is set, so whether the daily job can run by itself.
  - **The cron** is in `vercel.json` (daily 07:00 UTC) like the other two. **It does nothing until `CRON_SECRET` is set on the Vercel project** (issue 529): without it the route answers 403. Everything defaults to off, so nothing is sent for any event until somebody switches the e-mail on.
