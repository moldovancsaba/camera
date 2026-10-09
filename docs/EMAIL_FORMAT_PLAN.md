# The e-mails to the user: one format, one legal part, an editor, variables (client feedback 2026-10-09)

Tracker: epic [#463](https://github.com/moldovancsaba/camera/issues/463) on board [#24](https://github.com/users/moldovancsaba/projects/24); segments E1 [#464](https://github.com/moldovancsaba/camera/issues/464), E2 [#465](https://github.com/moldovancsaba/camera/issues/465), E3 [#466](https://github.com/moldovancsaba/camera/issues/466), E4 [#467](https://github.com/moldovancsaba/camera/issues/467), E5 [#468](https://github.com/moldovancsaba/camera/issues/468), E6 [#469](https://github.com/moldovancsaba/camera/issues/469). Separate request: the social login buttons, [#462](https://github.com/moldovancsaba/camera/issues/462). Status: **answered by the owner 2026-10-09 (section 7), delivery before the match on Friday 2026-10-16**; segment status in section 8. No e-mail changes until an editor changes it.

## 1. The client feedback (verbatim, two screenshots of the MTK x Vasas e-mail, 2026-10-09)

> Ez az also resz az altalanos szerzodesei feltetelek meg legyen sokkal kisebb. Tehat lehessen szovegmeretet is modositani

> Meg az emailben is lehessen kihangsulyozni linkeket meg mittudomen hogy felkoverrel legyen irva.

In English: the bottom part (the general terms) should be much smaller, so the text size must be changeable; links should be emphasised in the e-mail, in bold and so on. The screenshots show the e-mail as one run of equal text: the greeting, the club's own paragraph with two Facebook links and the photo link, then a long legal paragraph in the same size, then the button.

A third remark came with them and is **not part of this epic** ([#462](https://github.com/moldovancsaba/camera/issues/462), Backlog): the Google and Facebook sign-in buttons of the "Ki vagy te?" page should stand out, perhaps in their own colours; the owner says the buttons should represent their brand.

## 2. The owner's four points (2026-10-09)

1. The legal part of every e-mail at an event is always the same: **one legal part**, set for the event, **inherited by design from the partner**, which inherits **from the general e-mail legal part**; what the partner changes is the default of its events.
2. The e-mail settings get **their own menu** in the navigation.
3. An **editor** for what the clients need: bold, italic, title, whatever.
4. **Variables**: the name of the team, the name of the event, the date and so on.

## 3. What exists today (read from the code)

| Topic | Today | Where |
|---|---|---|
| Which e-mails a user gets | the result e-mail in three modes (after the photo is saved, after the related photos are ready, after an approved try-on rerun), and for a vetted photo "approved" (the link) and "not approved" (a short note) | `lib/email/submission-result-email.ts`, `lib/photo-vetting/emails.ts` |
| How one is made | a subject and a **plain-text** body with four placeholders `{name}`, `{event}`, `{link}`, `{terms}`; the HTML is made from the text: paragraphs, web addresses turned into links, **one button** (open the photo), in the colours, font and logo of the event, an optional footer picture. Nothing can be bold, italic, a title or a different size | `lib/email/submission-notification.ts`, `lib/email/themed-html.ts` |
| Where an editor sets it | the long **event editor form**, event level only: three pairs of subject and body, the sender name, the terms link, the switches; a preview that checks a template without sending | `app/admin/events/[id]/edit`, `POST /api/admin/events/<id>/email-preview` |
| Defaults and levels | the standard wording is the dictionary's `email.*` texts (English and Hungarian) with the **text levels**: general, partner, event, **plain text, at most 500 characters per text**; so a partner can change the default wording today, but not the legal part on its own, and the legal paragraph of the screenshot is longer than 500 characters | `lib/i18n/overrides.ts`, `docs/TEXT_LEVELS.md` |
| The legal part | not a thing of its own: the default ends with "Policies and General Terms and Conditions: {terms}"; the MTK paragraph is typed inside the body of that event | `email.body` and the event's own body |
| Menu | none: the e-mail fields are one section of "Edit and pages"; the menus have Texts (the text levels) | `lib/adminNavigation.ts` |
| Editor library | Tiptap core, React and the two menus are in `package.json` but **used nowhere**, and none of the formatting extensions (bold, italic, heading, link) is installed | `package.json` |

## 4. Triage

| What | Source | Goes to | Notes |
|---|---|---|---|
| The legal text much smaller, size changeable | client | **E1** (size in the format), **E2** (small print by default), **E4** (the control) | |
| Links and words emphasised, bold and so on | client | **E1**, **E4** | links already become links; they need to stand out |
| One legal part, three levels | owner 1 | **E2** | the same rule as the text levels |
| Own menu for the e-mail settings | owner 2 | **E3** | general, partner and event |
| An editor | owner 3 | **E4** (on **E1**) | |
| Variables | owner 4 | **E5** | |
| A test e-mail and a phone-width preview | mine, so the owner can see it before a user does | **E6** | |
| Social buttons in the brand's look | client, separate | #462 Backlog | probably also a GDS change |

## 5. The unified solution

**An e-mail is a composition** (the brick model, `docs/BUILDING_BRICKS.md` section 6.4): a **subject** (Words), a **message** (rich Words), a **button** (a label and the photo link), a **legal part** (rich Words, its own slot), a **footer picture** (Picture, the partner's default already applies) and the **look** (the event's theme, as today). The user's e-mails all use the same parts; they differ only in the words.

- **One format for rich words.** A small markup that is safe by construction: **bold, italic, one level of title, links, small, normal and large text, line breaks**; no colours, no pictures, no raw HTML (the look comes from the event's theme, so an editor cannot break the brand, and e-mail clients show it the same). Stored as that markup, checked when saved and again when sent, rendered to the themed HTML and, from the same source, to the plain-text part. A link may point to an `https` or `mailto` address or be a variable (`{link}`, `{terms}`).
- **Existing e-mails keep working untouched.** A plain-text body that exists today is a valid text in the new format (paragraphs and web addresses, as now); the four placeholders keep their names; nothing stored is rewritten. The legal paragraph typed inside an existing body stays there until an editor moves it into the legal part.
- **The legal part is a slot with three levels and one language each** (general, partner, event): the event follows its partner and the partner follows the general one each time it is read; what a level sets is **its own** and the default of the levels below; an own value is never overridden by a later change above. It is shown as **small print under the message and the button**; the standard text of today is the code default.
- **Variables** come from one catalogue (section 6, E5), appear in an insert menu with a sample value, and a variable the event has no value for (no teams) never reaches a user as `{name}`: it is left out and the editor is warned in the preview.
- **Menus.** The general level goes under Settings next to the Dictionary, the partner level in the partner menu, the event level in the event menu: one **Emails** page at each, with the same content: the switches (when each e-mail is sent), the sender name, the subject and message of each e-mail, the legal part, the footer picture, the preview. The long event editor form keeps no e-mail fields, only a pointer.
- **The editor.** A toolbar (bold, italic, title, link, text size, insert a variable) over the text, with the e-mail drawn next to it in the colours and font of the event, per language.

## 6. Segments

Each ships alone, changes no e-mail until an editor changes it, is tested, documented and checked in a browser, and the board is updated with it.

| # | Segment | Reuses | What the owner sees | Risk |
|---|---|---|---|---|
| **E1** | The format: safe markup, sanitizer, the two renderers (themed HTML, plain text), variables filled in | `themed-html.ts`, the placeholders | nothing yet (tests only) | low |
| **E2** | The legal part: slot, three levels, per language, resolution, small print in the e-mail; the code default | text levels, `admin_settings`, partner and event documents | a legal part that can be set at three levels (page comes with E3) | medium: the sending path |
| **E5** | The variables: catalogue, sample values, the event date in the language, behaviour of a missing value | `messageTokens` of the frame messages (same names for the teams) | a list of variables | low |
| **E4** | The editor: toolbar, variables menu, live preview in the event's look | the event theme, the preview endpoint | the editor | medium: a new screen, possibly a new library |
| **E3** | The Emails menu at three levels; the e-mail fields leave the event form | `lib/adminNavigation.ts`, the Texts pages as a pattern | a menu entry in each place | medium: moving fields |
| **E6** | A test e-mail to the editor's own address, and a phone-width preview | the sender, the preview endpoint | a button | low |

**Suggested order:** E1, E2, E5, E4, E3, E6. The sending path changes in E2 only, and only for an event whose legal part someone sets.

## 7. The owner's answers (2026-10-09)

| # | Question | Answer |
|---|---|---|
| 196 | When? | **Everything before the match** (Friday 2026-10-16): E1 to E6. |
| 197 | Which editor? | **A toolbar over the text with the live preview next to it** (no new library). |
| 198 | Where does the legal part sit? | **Small print after the button**, in a muted colour. |
| 199 | A variable with no value for the event | **Left out of the e-mail; the editor is warned in the preview.** |
| 200 | Which e-mails go into the Emails menu? | Not answered; I proceed with the recommended: **all of the user's e-mails** (the three result e-mails, approved, not approved). |

**Added by the owner, 2026-10-09 (the "not approved" e-mail screenshot):** *"In the emails, when we have slug, we always need to use those links set it in the editor as the default behaviour."* So whenever an e-mail links to the event itself (the "take another photo" link of the not-approved e-mail, the new variable `{eventlink}`), it uses the **event's own short link** (`<go origin>/<URL slug>`, the URL slug field of the event editor, counted as a link visit) when the event has a slug, and the capture page only when it has none (`lib/email/event-link.ts`). The photo link `{link}` is the share page of that photo and has no slug.

Later, with your go (a production data write): move the long legal paragraph out of the MTK x Vasas body into the legal part of the MTK partner, once E2 exists.

## 8. The five e-mail types (owner, 2026-10-09)

*"We need the following email types: welcome, when somebody registers (off default); arrived, when somebody submits a photo or later other media (off default); approved, when we approve, with the links (on default); declined, when we decline (on default); follow up, one week after the event to look back at the memory (off default)."*

| Type | When | Default | What exists today | What is built (segment) |
|---|---|---|---|---|
| **welcome** | when the user identifies: gives name and e-mail on the "Who are you" step, or signs in, before the photo (answer 201) | off | nothing | E7 the type and its texts, E8 the trigger (built: the capture page tells the server who registered, only when the event has welcome on; once for each event and address) |
| **arrived** | when a photo is submitted (later other media) | off | nothing: the "after save" e-mail is the link, sent when the photo is ready | E7, E8 |
| **approved** | when the photo is approved, with the links | **on** | the "after save" e-mail (events without vetting) and the "photo approved" e-mail (vetted events) | E7 unifies them |
| **declined** | when the photo is declined | **on** | the "not approved" e-mail, fixed wording | E7 makes it editable |
| **follow up** | seven days after the event, to look back at the memory; to users with an approved photo (answer 202) | off | nothing | E7 the type, texts and switch; **no job yet** (answer 203): nothing is sent until the daily job is added |

"On by default" (answer 204) means **every event, including ones that never turned e-mails on**: an event with no stored choice follows the default, a choice stored in its notifications wins. The two
try-on e-mails of today (related photos ready, approved resubmission) stay as extra types for events that use try-on.

## 9. Segment status

| Segment | Status |
|---|---|
| E1 #464 format | merged (#471) |
| E5 #468 variables | catalogue, values, missing-value rule and the slug link merged (#471); the insert menu and the preview warnings are in E4 (this pull request) |
| E2 #465 legal part | merged (#472) |
| E4 #467 editor | built (this pull request): `lib/email/compose.ts`, `POST /api/admin/emails/preview`, the toolbar editor and the preview, the legal part editor |
| E3 #466 Emails menu | built: the general and partner pages (merged #475) and the **event page** with the five types, the sender and terms, the try-on e-mails and the legal part (this pull request); the e-mail fields left the long event form and the new-event form |
| E7 #473 the five types | merged (#477): `lib/email/types.ts`, the policy reads `notifications.types`, the new defaults, the sanitizer `lib/email/notification-settings.ts`; welcome, arrived and follow up have their texts and switches but are not sent until E8 (and the daily job); the event page that edits them is E3 |
| E8 #474 the triggers | merged (#479): welcome (`POST /api/events/<id>/register`, `lib/email/triggers.ts`) and arrived (when a photo is submitted); **follow up has no trigger and no job** (answer 203) |
| #376 picture block | built (this pull request): `![alt](https://picture)` and `[![alt](https://picture)](address)` as a paragraph of its own (`lib/email/rich.ts`), only from the app's own storage (`allowedImage`; others are left out and shown in the preview's warnings), the **Picture** button of the editor on the event's message |
| E6 #469 test e-mail | built (this pull request): `POST /api/admin/emails/test` and the button **Send me a test e-mail** in every preview |
