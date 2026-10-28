# Camera UI language behavior

**Status (2026-10-27):** Device-first language negotiation and the shared message-catalog foundation are implemented for the capture journey, public photo share page, error copy, email defaults, and text editors. The extra locale dictionaries are machine-translated drafts and are not cleared for a production launch. This document describes current code, not a claim that every Camera route or WCAG 2.2 AA has been completed.

## Supported locale identifiers

`lib/i18n/index.ts` is the canonical registry. It currently contains `en`, `hu`, `de`, `it`, `pt-BR`, `pt-PT`, `es`, `fr`, `ru`, `zh-Hans`, `zh-Hant`, `ro`, `pl`, `sk`, `hr`, `sl`, `bg`, `tr`, `ar`, `hi`, `ka`, `sr-Cyrl`, and `sr-Latn`. Native-language labels are in `UI_LANGUAGE_LABELS`.

The English catalog in `lib/i18n/messages.en.ts` defines 253 typed message keys. Each registered locale has a dictionary with the same keys. The 21 dictionaries beyond English and Hungarian are machine-generated first drafts. Georgian currently uses English for five long e-mail body keys. See [LOCALIZATION_TRANSLATION_REVIEW.md](./LOCALIZATION_TRANSLATION_REVIEW.md) before enabling this content for real users.

## Locale selection

For `/capture/:eventId` and `/share/:id`, the server and client use the same order:

1. First supported browser preference from `Accept-Language`, ordered by quality (`q`) and then header order.
2. Partner default language.
3. Event language if the partner has not configured one.
4. English.

Chinese matching respects writing system (`zh-TW` and `zh-HK` to `zh-Hant`; other Chinese preferences to `zh-Hans`). Serbian matching respects script (`sr-Latn` or `sr-Cyrl`). Portuguese uses `pt-PT` for Portugal and `pt-BR` otherwise. The rules live in `lib/i18n/locale-negotiation.ts` and are covered by unit tests.

The `proxy.ts` forwards the request path while retaining Camera's admin-session gate, OAuth callback recovery, and short-link rewrites. The root layout uses that path to emit the guest page's correct `<html lang>` and `<html dir>` on the server. Arabic sets `dir="rtl"`; other supported locales use `ltr`. The guest `UiLanguageProvider` keeps document language and direction in sync. Pages outside the localized capture/share routes retain English document metadata until those page families are migrated.

Email jobs have no browser preference; they use the partner default, then the event fallback, then English. Persisted UI settings use the same canonical locale union. Labels are translated at display time; API/database values remain canonical.

## Translation behavior and editing

The shared `translate(language, key, values, overrides)` function selects a catalog string and fills `{markers}`. Global, partner, and event text overrides remain separate per locale and preserve the existing explicit-empty behavior. `TextLevelEditor` and the email legal-text editor now accept every supported locale.

Date formatting uses the selected locale. The current share-date timezone behavior remains a separate concern: Hungarian explicitly uses `Europe/Budapest`; other locales use the runtime default. There is not yet an event timezone contract.

## Scope limits and release gate

The new dictionaries cover the existing 253-key message catalog; they do **not** translate every hard-coded label in Camera administration, gallery, vetting, analysis, reports, QR library, or every operational UI. Those surfaces remain an implementation gap. User-authored partner/event copy is also not machine-translated.

No locale is linguistically approved by the generated files. Consent, privacy, e-mail, and other legal copy need qualified translation and legal review. Arabic RTL, all script/font coverage, screen-reader behavior, zoom/reflow, contrast, touch targets, and route-by-route WCAG 2.2 AA have not passed a full audit. Do not describe Camera as fully multilingual or accessibility-conformant until the release gates in [LOCALIZATION_ACCESSIBILITY_DELIVERY_PLAN.md](./LOCALIZATION_ACCESSIBILITY_DELIVERY_PLAN.md) are met.

The operational roadmap and acceptance criteria are in [LOCALIZATION_ACCESSIBILITY_DELIVERY_PLAN.md](./LOCALIZATION_ACCESSIBILITY_DELIVERY_PLAN.md); translation provenance is in [LOCALIZATION_TRANSLATION_REVIEW.md](./LOCALIZATION_TRANSLATION_REVIEW.md).
