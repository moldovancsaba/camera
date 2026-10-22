# Historical draft: using annotated photos to train automatic annotation

> **Superseded 2026-10-22.** Camera's standalone manual annotation workflow has been retired. Fanmass inference and Camera human corrections are not a model-training pipeline; no training export or automatic learning loop is authorized or implemented by this document. The content below is retained as a historical legal review draft only and must not be used as a description of current processing. Current per-photo workflow: [FANMASS_RESULTS_IN_CAMERA.md](FANMASS_RESULTS_IN_CAMERA.md).

**Status: draft for the owner and for legal review (owner answer 457, "yes", 2026-10-12). Nothing here is shown to any user.** **Owner information (answer 462, 2026-10-12): this use is managed in the terms every user accepts, as they were originally written.** I have not seen those terms (a linked document outside this repository), so I cannot check what they say; the draft therefore keeps a separate consent only as the option legal may still want, and the safeguards below apply either way. Nothing is exported until legal has confirmed that the terms' wording covers training on labelled pictures. The wordings are Dictionary texts (group "AI training consent (draft, not shown yet)"), editable at the global, partner and event levels like every other text (`docs/TEXT_LEVELS.md`).

## What the owner wants (2026-10-12)
The annotation the vetting person makes (people in the photo, their gender, age and expression, what they wear or hold, and why a photo is rejected) has two aims: **feed messmass analytics**, and **collect the picture together with its annotation so that, in the future, software can do the annotation automatically**.

## The two aims are not the same thing in law
- **Aim 1, analytics, is counts only** (owner decision 241: counters only, never a person). The annotation is read as totals per event (`camera_gender_female`, `camera_age_kid`, ...), nothing that identifies a person leaves camera. The terms the user already accepts are the basis, as for every other figure in the Analytics tab.
- **Aim 2, training, keeps the picture itself and its labels** and hands them to a model. That is a **different purpose** from showing the photo or counting it. It needs its own stated purpose in the notice and a lawful basis. My recommendation was a **separate, unticked consent**, as the marketing profile (`docs/PROFILE_PURPOSE_AND_CONSENT_DRAFT.md`, purpose C) has; the owner says the terms already manage it (answer 462). Then the basis is **the acceptance of those terms that is already stored with every photo** (`consents`, with the time it was given), and the question for legal is only whether the wording of the terms that user accepted really covers training on labelled pictures. **A photo whose user did not accept such terms is never put in a training set, however it was annotated.**

## What a training set would contain
| Included | Never included |
|---|---|
| the photo as the user saved it, before the frame (the unframed crop) | name, e-mail address, social identity, IP address, device, any account |
| the labels: a rectangle for each person (percent of the photo), gender, age group, expression, items worn or held, why the photo was rejected | the link to the user's photo page or the user's other photos |
| the event it came from (so the set can be weighed by event), the vocabulary version the labels were made with, a random training id | anything that says who the person is (no face recognition, no matching of people between photos) |

The labels are **what a reviewer saw, not facts about the person**: "gender", "age" and "expression" are the reviewer's reading of the picture, with "Not sure" and "Neutral" kept distinct from "not marked". A model trained on them learns that reading, and the consent sentence says so.

## Who may be in it, and what needs a decision from legal
Recommendations, to be confirmed by whoever advises the owner on data protection; I am not giving a legal opinion.
1. **Consent per photo, withdrawable.** A separate checkbox at the step where the photo is saved, not ticked by default, away from the terms checkbox; leaving it unticked changes nothing for the user. A withdrawal removes the user's photos from the set (and from the next training run; a model already trained cannot be un-trained, and the notice should say so).
2. **Children and young people.** The age bands include "Child" and "Young (13 to 24)", so minors are in the pictures, and some users who tick the box are minors. Whether and how a minor's consent (or a parent's) is valid is for legal. Until decided, photos with a person marked Child should be excluded from any export.
3. **Rejected photos.** The owner wants to learn from rejected photos (hand gestures, forbidden content, nudity, alcohol and so on). They are the most sensitive pictures in the service. A rejected photo is never shown to anyone but the vetting person; it can be in a training set only if its user gave the consent above, and a photo rejected for **nudity or sexual content** should be excluded from any export unless legal decides otherwise (it may be unlawful to keep or process some of it at all).
4. **What the trained software is for.** Counting people and reading gender, age group and expression from a picture can fall under rules for biometric categorisation and emotion recognition depending on where it is used. The purpose in the notice should say it is used to **help the vetting person and to count**, not to decide about, identify or profile a person.
5. **Who trains.** If a third-party provider trains or hosts the model, they are a processor, and the data has to be handed over under an agreement; the controller named in the consent has to be the right one.
6. **Retention.** Proposal for the owner to decide: the training copy is kept until the user withdraws or 24 months after the event, whichever is first, and then deleted.

## Where the pictures can live (the next 90 days, owner answer 459)
Today the unframed photo ends on ImgBB after approval: a **public third-party host** whose files anyone with the address can open and which may remove files without notice (`docs/PRIVACY_DATA.md`), with a 90 day retention planned. That is **not a place for a training set**. Before the first photo is collected for training, the set needs a private store we control (decision 295 names R2 as the planned primary store) and an export that is logged and restricted. Nothing in this draft builds that; the owner will design it in the next 90 days, using what exists now.

## What the vetting design already does for this aim
- **Stable meaning:** an option's key never changes (`female`, `scarf`, `nudity`); labels, order and visibility are the only things an editor changes (`docs/ANNOTATION_VOCABULARY.md`).
- **Which list was used:** each annotation records the version of the list of words it was made with (`peopleReview.vocabulary`), so annotations made with different lists can be told apart.
- **Not marked is not neutral, not sure is not unmarked:** "Not sure" (gender) and "Neutral" (expression) are real options; a blank stays blank.
- **Rejected photos are annotated too**, with at least one reason from a fixed list.
- **Reviewer:** who marked the people and when is kept (`peopleReview.by`, `.at`), so quality can be checked later.
- **Not yet there, needed for a good set:** a second reviewer on a sample to measure agreement, a way to correct the people of an approved photo, an "unsure about this one" mark, and the consent flag on the photo (`Submission.trainingConsent`) that the eligibility filter would read.

## What the build would be, once legal has validated the wording
1. **If legal says the terms are enough (the owner's information):** nothing new is asked of the user. The eligibility reads the acceptance stored with the photo. **If legal says they are not:** `Submission.trainingConsent = { version, grantedAt }`, written only when a separate box was ticked, as one more kind in the checkbox settings (`lib/events/checkbox-settings.ts`: shown or not, required or optional per partner, event and checkbox; standard: **not shown**, so no event changes until somebody chooses).
2. The eligibility filter: the basis above holds for the photo, not withdrawn, not removed, picture present, no excluded label (see 2 and 3 above), and a random training id instead of the submission id.
3. A restricted, logged export (images plus labels in a standard format such as COCO), global admins only; withdrawal and deletion flow; the privacy notice and `docs/PRIVACY_DATA.md` updated.
4. **The photos of the match on 2026-10-16** are annotated like any other. Whether they can enter a set depends on the same rule: the terms those users accepted, once legal has confirmed them. Nothing is exported before that, so the question does not need an answer before the match.

## Draft wordings (used only if legal asks for a separate consent)
Placeholders are in curly brackets. Dictionary keys: `training.consent` (`{organiser}`, `{link}`), `training.consent.link`, `training.notice`.

- **English:** "I agree that {organiser} uses my photo, without my name or e-mail address, together with the labels a reviewer gave it (for example how many people are in it, their apparent age group, gender and expression, what they wear or hold, and why a photo was not approved) to train and test software that can later do this automatically. I can withdraw this at any time at {link}."
- **Magyar:** "Hozzájárulok, hogy a(z) {organiser} a fotómat – a nevem és az e-mail-címem nélkül –, valamint a hozzá az ellenőrzés során rögzített címkéket (például hány személy látható rajta, a becsült korcsoportjuk, nemük és arckifejezésük, mit viselnek vagy tartanak a kezükben, illetve miért nem hagyták jóvá a fotót) olyan szoftver tanítására és tesztelésére használja fel, amely ezt később automatikusan el tudja végezni. A hozzájárulásomat bármikor visszavonhatom itt: {link}."
- **Notice under the checkbox, English:** "Leaving this unticked changes nothing about your photo or your link." **Magyar:** "Ha nem jelölöd be, az a fotódon és a linkeden semmit nem változtat."

No wording is final until the reviewers who can edit texts have validated it in the Dictionary (owner answer 251).
