# Camera translation review register

**Snapshot:** 2026-10-27  
**Catalog:** 253 message keys from `lib/i18n/messages.en.ts`  
**Locale variants:** 23 (`en`, `hu`, `de`, `it`, `pt-BR`, `pt-PT`, `es`, `fr`, `ru`, `zh-Hans`, `zh-Hant`, `ro`, `pl`, `sk`, `hr`, `sl`, `bg`, `tr`, `ar`, `hi`, `ka`, `sr-Cyrl`, `sr-Latn`)

## Provenance and status

- English is the source catalog. Hungarian was already present before this work.
- The other 21 catalogs were machine-translated as implementation drafts. They have not been reviewed by native speakers.
- Georgian (`ka`) intentionally retains English in these five long messages because the draft translation pass did not return reliable text: `email.notApprovedBody`, `email.followUpBody`, `email.underReviewBody`, `email.welcomeBody`, and `email.arrivedBody`.
- Placeholder parity, catalog key parity, and non-empty string checks are automated. Those checks detect structural defects; they do not establish translation accuracy, tone, cultural suitability, or legal validity.
- A machine translation must never be treated as approval for consent, privacy, safety, or legal text. Have a qualified translator and the responsible privacy/legal reviewer approve those strings for each launch jurisdiction.

## Launch readiness

**Not production-approved.** The locale registry and dictionaries are wired into runtime selection, so the draft text can appear to users whose browser requests those locales. Before promoting a locale, assign a native reviewer, record review status by key, verify link destinations and legal meaning, and complete the route, accessibility, RTL, font, and real-device checks in `LOCALIZATION_ACCESSIBILITY_DELIVERY_PLAN.md`.

## What is outside the catalog

The 253-key catalog is not an inventory of every visible string in Camera. Most admin, vetting, analysis, reporting, library, and some error/API surfaces still contain hard-coded English. These need a route/component inventory and explicit key migration before the application can claim all-screen translation coverage.
