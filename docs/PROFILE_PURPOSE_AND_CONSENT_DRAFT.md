# Profiles across events: purpose and consent (DRAFT for the owner's approval)

**Status: draft, nothing is designed or built.** Owner answer 2026-10-10 to decision 242 of `docs/ANALYTICS_AUDIT.md` ("yes" to a person-level profile, "the largest KYC"). That decision had a condition: a profile needs a stated purpose, a lawful basis and its own consent text before any code. This file proposes them. The wording below is a draft for the owner and for the data protection contact of the organiser; **it is not legal advice and must be reviewed before it is shown to a user.**

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

## Questions for the owner (plain words)
- **248, purpose:** is it A (the user's own photos in one place), B (counts for you and the partners), C (e-mails about other events), or something else? *Recommended: A and B now, C later with its own project.*
- **249, controller:** who is named in the sentence: the organiser of each event, or the operator of this service? *To be decided with the data protection contact.*
- **250, retention:** 24 months without activity, then delete. *Recommended: yes.*
- **251, review:** who reviews the final wording before a user sees it? *Recommended: the client's data protection contact.*

Nothing is built for any of this before the match on 2026-10-16, and nothing user-visible ships without these answers.
