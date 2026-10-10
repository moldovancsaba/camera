# Profiles across events: purpose and consent (owner decisions 2026-10-10)

**Status: decided by the owner on 2026-10-10 (questions 248 to 251, below); the profile itself is not built yet, and nothing user-visible ships before the match on 2026-10-16.** Owner answer to decision 242 of `docs/ANALYTICS_AUDIT.md` ("yes" to a person-level profile, "the largest KYC"). The condition was a stated purpose, a lawful basis and its own consent text before any code; the purposes are decided here and the wording below is the **default text**: the owner's reviewers validate and change it in the Dictionary (it is an ordinary editable text with the three levels, global, partner and event, in English and Hungarian), so what I deliver is the text and its place, not the final legal wording.

## What "a profile" would be
One record per **person** (the same verified e-mail address or the same social login), linking what is today spread over single photos and events: the events they joined, the photos they took and shared, the consents they gave, their activity (steps, retakes, shares). Today none of this is linked: every photo stands alone with the name and e-mail typed for it (`docs/ANALYTICS_AUDIT.md`, section 7.1, level 2).

## The decision: what is it for?
The purpose decides what is lawful and what the consent sentence says. Three candidates, from smallest to largest:

| Purpose | What the user gets or the organiser does | Basis | Risk | My recommendation |
|---|---|---|---|---|
| **A. My photos** | the user sees and downloads all their photos from every event in one place, and can delete them | performance of the service they asked for; the existing acceptance covers it, a short notice line is enough | low | **yes, this first** |
| **B. Events and partner insight** | the organiser knows which events a person came to and how they used the service, shown as counts and groups, not as a named list | legitimate interest for counts; a named list needs consent | medium | counts only, with level 1 of the audit; no named list |
| **C. Marketing profile** | the organiser (or a partner) contacts the person by e-mail about other events, or builds an audience from the profile | **explicit, separate consent**, unticked by default, one named controller, withdrawable at any time | high | only if the owner names the purpose and the partner; never bundled with the acceptance of the terms |

I would build **A** and the counts of **B**, and treat **C** as its own later project with its own checkbox. If the owner means something else by "the largest KYC", this is the place to say it.

## Rules for any profile (all purposes)
- **Opt-in for C, notice for A and B.** The terms checkbox (`consent.combined`) is never used for C.
- **The user can see, export and delete the profile**, and withdrawing C does not remove their photos.
- **Retention:** the profile lives as long as the person keeps an account of ours or asks to delete it; the raw interaction rows stay 30 days (audit section 7.1); a profile with no activity for 24 months is deleted. (Proposal; the owner decides the numbers.)
- **No special categories** (health, origin, beliefs) and nothing inferred from the photo itself (no face recognition, age or mood guess).
- **Written down:** the purpose, the controller (the organiser or the operator of this service: to be named), the retention and the way to withdraw are in the privacy notice, in both languages.

## Draft consent sentence for C (only if the owner wants it)
Placeholders are in square brackets; the Hungarian follows the tone of the existing sentence (`consent.combined`).

- **English:** "I agree that [organiser] links my photos, my e-mail address and my activity at its events into one profile and uses it to [purpose, e.g. send me news about its next events by e-mail] until I withdraw this. I can withdraw at any time at [link]."
- **Magyar:** "Hozzájárulok, hogy a(z) [szervező] az eseményein készült fotóimat, az e-mail-címemet és a tevékenységemet egyetlen profilba kapcsolja össze, és azt [cél, pl. a következő eseményeiről szóló hírek e-mailben való elküldése] céljából használja, amíg a hozzájárulásomat vissza nem vonom. A hozzájárulásomat bármikor visszavonhatom itt: [hivatkozás]."

Shown as its own checkbox, **not ticked**, away from the terms checkbox; a user who leaves it unticked loses nothing.

## Draft notice line for A (the user's own photos across events)
- **English:** "Photos you take at our events are kept under your e-mail address so you can find, download and delete them in one place."
- **Magyar:** "Az eseményeinken készített fotóidat az e-mail-címed alatt tároljuk, hogy egy helyen megtalálhasd, letölthesd és törölhesd őket."

## Owner decisions (2026-10-10)
- **248, purpose: all three, A, B and C.** A (the user's own photos in one place), B (counts for the organiser and the partners) and C (e-mails and an audience from the profile) are all wanted. C keeps the conditions of the table: its **own checkbox, not ticked by default, away from the terms checkbox, one named controller, withdrawable at any time**; a user who leaves it unticked loses nothing. A and B need the notice line only.
- **249, controller: as it is now, and the text is customisable.** The party named in the sentences is the one the journey names today in its terms and privacy notice; nothing new is invented. The consent sentence and the notice line are **ordinary texts like every other**: keys in the Dictionary (English and Hungarian defaults below), changeable at the global, partner and event levels (`docs/TEXT_LEVELS.md`).
- **250, retention: delete the profile, keep the images.** The profile is deleted when the user asks and after 24 months without activity. **The photos stay**: the user transferred the rights of the photos by accepting the terms, so deleting the profile or withdrawing C never removes the photos (the existing erase flow for a single photo is unchanged).
- **251, who validates the wording: whoever can edit it.** The Admin, the editor, the event manager, anybody with the right to edit texts. They validate and update every wording; the part that is mine is to **deliver the texts and make them editable**, not to validate them.

## What this means for the build (after the match)
1. The two wordings below become **Dictionary keys** (one for the C consent sentence, one for the A/B notice line) with the English and Hungarian defaults, so they can be validated and edited before any page shows them.
2. The profile (link of a user's photos, events, consents and activity by verified e-mail or social login), the C checkbox, the user's page to see, export and delete it, and the 24-month deletion job come with step F of the audit's plan, after the vetting and photo tabs, and after the match.
3. No wording is final until the reviewers have validated it in the Dictionary.
