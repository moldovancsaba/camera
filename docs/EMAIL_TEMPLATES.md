# Email template verification

> The format, the legal part, the editor and the variables are being redesigned: see `docs/EMAIL_FORMAT_PLAN.md` (epic #463). What follows describes the e-mails as they are today.

Event result email setups support three delivery modes:

- `after_save`: send immediately when the saved result is ready.
- `after_related`: send when the share page has the configured related photos available.
- `after_tryon_resubmission_approved`: send an update after an admin-approved try-on rerun result.

Supported variables (`lib/email/variables.ts`; a variable with no value for the event is left out of the e-mail, never sent as `{name}`):

- `{name}`: participant display name.
- `{event}`: event name.
- `{link}`: public share page URL.
- `{terms}`: event terms and conditions URL.
- `{eventlink}`: the link to the event: its own short link when the editor set a URL slug (the default), else its capture page.
- `{partner}`: the partner (club or organiser); `{home}`, `{visitor}`, `{teams}`: the two sides of the match (`{partner1}`, `{partner2}` are other names for the first two); `{date}`: the date of the event in the language of the event; `{location}`: the place of the event.

### Format of the words (`lib/email/rich.ts`)

Paragraphs are separated by a blank line. A paragraph that starts with `# ` is a title, `-# ` is small text, `+# ` is large text. Inside a paragraph: `**bold**`, `*italic*`, `[label](https://address)` (a link, bold and underlined; the address may be `{link}` or `{terms}`), a bare web address (a link). A paragraph that is only `![what it shows](https://picture)` is a **picture** (centred, as wide as the e-mail at most), and `[![what it shows](https://picture)](https://address)` is a picture that is a link; the address behind it may be `{link}`, `{terms}` or `{eventlink}`. The picture must be in the app's own storage (the Blob store, the logo storage or imgbb): any other address is left out of the e-mail and the preview says so. The plain-text part names it by its description (and the address when it is a link). The editor's **Picture** button chooses or uploads one from the event's image library (PNG or JPEG: e-mail apps do not all draw WebP or SVG). A backslash writes the next sign as it is (`\*`). Nothing else is markup and raw HTML is always escaped. A text with none of these is drawn exactly as plain text always was.

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

`Emails` in the event menu (`/admin/events/<id>/emails`) holds everything an editor sets about the e-mails of one event: for each of the five types a switch (shown as On or Off and whether it is the default or a choice; "Use the default" takes the choice away), the subject and the message in the toolbar editor with the preview beside it, the sender display name and the link to the terms, the two older try-on e-mails for an event that uses try-on, and the legal part of the event. A switch and a text that are the default are not stored: the event follows the default. `GET`/`PUT /api/admin/events/<id>/emails`. The footer picture of the e-mails stays with the other pictures (Edit and pages, and the partner's Pictures).

## The five e-mail types (epic 463, `lib/email/types.ts`)

| Type | When | On by default | Stored |
|---|---|---|---|
| welcome | when somebody registers (gives name and e-mail, or signs in, before the photo) | no | `notifications.types.welcome` |
| arrived | when somebody submits a photo (later other media) | no | `types.arrived` |
| approved | when the photo is approved, with the links: at once for an event without vetting, by a moderator with it | **yes** | `types.approved`; the old "after save" pair is the same e-mail |
| declined | when a moderator declines the photo | **yes** | `types.declined` |
| follow up | one week after the event, to users with an approved photo | no | `types.follow up` (`followUp`); **not sent yet**: the daily job is added later |

Each type has `enabled` (a switch), `subject` and `body` (the event's own, in the format above). **A stored choice wins; an event with none follows the default** (owner, answer 204: "on" means every event, including ones that never turned e-mails on). The old fields keep their meaning: `submissionResultEmailEnabled: false` stored by an editor still turns the old switches off, the three modes' own subject/body stay, the two try-on e-mails (`after related photos`, `after approved resubmission`) are unchanged. For a vetted photo the approved e-mail is how the user gets the link, so only the new switch `types.approved.enabled = false` stops it. The default texts are the dictionary keys `email.welcomeSubject/Body`, `email.arrivedSubject/Body`, `email.followUpSubject/Body` (English and Hungarian, with the standard terms line, which a legal part replaces) and the existing `email.subject/body` (approved) and `email.notApprovedSubject/Body` (declined). `PATCH /api/events/<id>` stores only what the editor chose (`lib/email/notification-settings.ts`), nothing is filled in with a default.


## When the e-mails are sent (epic 463, `lib/email/triggers.ts`)

- **approved**: at once when a photo of an event without vetting is saved (the finalize call), and when a moderator approves a photo of a vetted event.
- **declined**: when a moderator declines a photo.
- **arrived**: when a photo is submitted (`POST /api/submissions`, after the answer is sent; and at the finalize call when the address is known only then), once for each photo (`metadata.arrivedEmailSentAt`), with no button because there is nothing to link to yet.
- **welcome**: when the user is identified. The capture page calls `POST /api/events/<id or URL slug>/register` with the name and e-mail once the user typed them on the "Who are you" step or signed in, and only when the event has welcome on (`welcomeEmailEnabled` in the event answer). The server keeps one row for each event and address in `email_registrations`, claims it before the send and gives the claim back when the send fails, so the e-mail goes once. The address is not verified, so the e-mail is the welcome note and the link to the event (its short link when it has a URL slug); the answer never says whether an e-mail went.
- **follow up**: not sent. The text and the switch exist; the daily job is added later (owner answer 203).
