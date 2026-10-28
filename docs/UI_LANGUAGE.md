# Camera UI language behavior

**Status (2026-10-28):** Device-first language negotiation and the shared message-catalog foundation are implemented. The root provider exposes a supported device language to every route; capture/share use partner and event fallbacks when no supported device language is available. Admin navigation/account labels and 111 shared admin phrases, 86 photo-review/Fanmass operation phrases, and 21 common admin control phrases have draft translations for all 23 registered locale variants. The image export labels also have a dedicated four-string catalog translated for all 23 variants. The list shell, dashboard, event inventory, sign-in, shared editor headings and catalog-backed fields/buttons/options, pager, event exports, vetting queue, one-photo review, and Fanmass result screens consume these strings. Camera semantic buttons resolve catalog-backed action labels in the active locale. Most page-specific admin copy, analytics/reporting screens, library forms, and operational messages remain hard-coded English when they do not match a catalog entry. The new locale text is machine-drafted and not cleared for production. This is broader partial coverage, not a claim that every Camera route or WCAG 2.2 AA is complete.

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

The `proxy.ts` forwards the request path while retaining Camera's admin-session gate, OAuth callback recovery, and short-link rewrites. The root layout uses that path to emit the resolved `<html lang>` and `<html dir>` for localized capture/share pages. Arabic sets `dir="rtl"`; other supported locales use `ltr`. The root `UiLanguageProvider` exposes the device locale to all client components. Until a route family is fully localized, its document remains `lang="en"`; localized regions such as the admin navigation set their own language and direction. Capture/share pages additionally use partner and event fallback settings when no supported device preference exists.

Email jobs have no browser preference; they use the partner default, then the event fallback, then English. Persisted UI settings use the same canonical locale union. Labels are translated at display time; API/database values remain canonical.

## Translation behavior and editing

The shared `translate(language, key, values, overrides)` function selects a catalog string and fills `{markers}`. Global, partner, and event text overrides remain separate per locale and preserve the existing explicit-empty behavior. `TextLevelEditor` and the email legal-text editor now accept every supported locale.

Date formatting uses the selected locale. The current share-date timezone behavior remains a separate concern: Hungarian explicitly uses `Europe/Budapest`; other locales use the runtime default. There is not yet an event timezone contract.

## Scope limits and release gate

The guest dictionaries cover the existing 253-key message catalog. Admin navigation/account labels are in `lib/i18n/admin-shell.ts`; shared admin page phrases are in `lib/i18n/admin-pages.ts`; review/Fanmass and common editor/control copy are in `lib/i18n/admin-operations.ts` and `lib/i18n/admin-common.ts`. Shared input wrappers and Camera semantic buttons translate exact catalog-backed control labels. Analytics/report pages, event/gallery management, QR libraries, many partner/event form labels/help strings, APIs/errors, and other page-specific copy remain outside the catalogs and need route/component migration. User-authored partner/event copy is not machine-translated.

No locale is linguistically approved by the generated files. Consent, privacy, e-mail, and other legal copy need qualified translation and legal review. Arabic RTL, all script/font coverage, screen-reader behavior, zoom/reflow, contrast, touch targets, and route-by-route WCAG 2.2 AA have not passed a full audit. Do not describe Camera as fully multilingual or accessibility-conformant until the release gates in [LOCALIZATION_ACCESSIBILITY_DELIVERY_PLAN.md](./LOCALIZATION_ACCESSIBILITY_DELIVERY_PLAN.md) are met.

The operational roadmap and acceptance criteria are in [LOCALIZATION_ACCESSIBILITY_DELIVERY_PLAN.md](./LOCALIZATION_ACCESSIBILITY_DELIVERY_PLAN.md); translation provenance is in [LOCALIZATION_TRANSLATION_REVIEW.md](./LOCALIZATION_TRANSLATION_REVIEW.md).
