# Camera localization and accessibility delivery plan

**Status:** Localization foundation, admin navigation/account shell, 111 shared admin page phrases, 86 review/Fanmass phrases, and 21 common admin controls implemented as machine-drafted copy on 2026-10-28. Vetting/Fanmass review, shared editor controls, pager, and event export surfaces are connected. Full route migration, native review, legal approval, and WCAG 2.2 AA evidence remain open. See [UI_LANGUAGE.md](./UI_LANGUAGE.md) and [LOCALIZATION_TRANSLATION_REVIEW.md](./LOCALIZATION_TRANSLATION_REVIEW.md) for exact coverage and translation provenance.
**Scope:** Camera guest journeys, public/share surfaces, partner/event setup, and Camera administration, including user-visible status, analytics, error, and notification copy.
**Quality target:** WCAG 2.2 Level AA across supported routes, locales, and responsive layouts.

## 1. Product outcome

Camera renders each public capture/share screen in the visitor's preferred supported device language. When that language is not available, it uses the partner's default language; if the partner has no default, it may use an explicitly configured event fallback, then English as the final application fallback. Public visitors do not yet have an in-flow language selector. Signed-in admin users have a separate personal language preference in the admin header and Account settings; it does not change guest language settings.

Every string a person can see or hear must be covered: headings, labels, helper text, buttons, consent copy, enum/status labels, errors, loading and empty states, notifications, date/number formatting, accessible names, image alternatives, and document metadata. Dynamic values such as partner/event names, participant-provided names, and counts stay data; the surrounding words and formatting are localized. Stable API and database values remain language-neutral.

The application will use one locale-resolution and message-formatting contract on server and client. A screen must not render one language and then switch after hydration. Screen-reader language metadata and text direction must agree with the rendered copy from the first response.

## 2. Current-state audit

### Implemented foundation (not a complete release)

- `lib/i18n/index.ts` now registers the requested locales, both Chinese scripts, both Portuguese regions, and both Serbian scripts. The English source catalog has 253 keys; each locale catalog has matching typed keys.
- `lib/i18n/locale-negotiation.ts` parses weighted `Accept-Language` preferences and matches BCP 47 region/script variants. Capture and public share resolve a supported device language first, then partner default, then event fallback, then English.
- `app/layout.tsx` resolves the initial interface locale before rendering. Capture/share pages use the supported device locale, then partner/event fallback and English; authenticated admin pages use the saved per-user preference, then supported device locale and English. Other unlocalized routes retain English document metadata. `proxy.ts` continues to preserve the existing auth, OAuth, and short-link behaviors while forwarding the pathname. Localized regions set their own `lang` and `dir`.
- The shared admin navigation/account shell, shared admin list/dashboard vocabulary, vetting/Fanmass operations vocabulary, and common editor-control vocabulary have drafts in all 23 registered locale variants. Review pages, common fields/buttons/options, pagination, and event exports use these catalogs. This improves selected routes but does not translate all admin page bodies or operational copy.
- Admin guided-tour descriptions now follow the selected admin UI locale; page titles reuse the shared admin and account catalogs. The tour wording is machine-drafted and still needs native review.
- Partner/event `uiLanguage` schemas and API validators use the shared registry. The text and email legal editors can select the supported locale set; date and email-preview formatting use the selected locale.
- Structural tests check locale/key parity, nonempty strings, interpolation marker parity, locale matching, and language-setting API acceptance.

### Remaining gaps and risk

- The 21 new dictionaries are machine-translated drafts, not native-reviewed copy. Georgian retains English in five long e-mail bodies. Legal, consent, privacy, and safety copy has no qualified translation approval; see `docs/LOCALIZATION_TRANSLATION_REVIEW.md`.
- The guest catalog contains 253 keys and shared admin catalogs contain 218 phrases; neither is a complete inventory of every visible string in Camera. Analytics/report pages, many event/gallery/library forms, page-specific descriptions, API/error copy, and other admin surfaces still contain hard-coded English. A route/component inventory and migration are still required.
- No full WCAG 2.2 AA or route-by-route axe audit was completed. Arabic RTL layout, font glyph/shaping coverage, screen-reader pronunciation, keyboard/touch, zoom/reflow, contrast, focus behavior, and real-device checks remain unverified.
- Public visitors do not yet have a language picker or persisted language preference. Signed-in admin users do have a separate persisted personal preference; it does not change guest language settings. Public event language resolution is device-first, with partner/event settings as fallbacks.
- Timezone behavior is not fully independent yet: Hungarian share timestamps explicitly use Budapest, while other locales use the runtime default. Events have no canonical timezone field.
- Locale-specific staged flags and a verified per-locale emergency-disable mechanism are not implemented.

### What is explicitly not solved by this plan

This plan does not assert that translations, screen-reader behavior, legal copy, or all route states are currently correct. It defines the work and release evidence required to make those claims. It also does not translate user-generated event/partner content automatically or change business data/API enum values into localized strings.

## 3. Locale inventory and language decisions

The requested list has 19 entries, and the requirement explicitly describes Serbian device users even though Serbian is absent from the list. Treat Serbian as required, making at least 20 language/script configurations. Normalize the spelling in product and engineering documents as follows:

| Display name | Recommended BCP 47 tag(s) | Notes |
|---|---|---|
| English | `en` | Final application fallback. |
| Hungarian | `hu` | |
| German | `de` | |
| Italian | `it` | |
| Portuguese | `pt-BR`, `pt-PT` | Decide whether both regional variants ship. A generic `pt` bundle alone can be ambiguous. |
| Spanish | `es` | Add regional variants only if content/legal requirements need them. |
| French | `fr` | |
| Russian | `ru` | |
| Chinese | `zh-Hans`, `zh-Hant` | “Chinese” needs a script choice; matching a Traditional-Chinese device to Simplified-only text is not an acceptable silent substitution. |
| Romanian | `ro` | |
| Polish | `pl` | |
| Slovak | `sk` | |
| Croatian | `hr` | |
| Slovenian | `sl` | Corrects “Slovanian”. |
| Bulgarian | `bg` | |
| Turkish | `tr` | |
| Arabic | `ar` | Requires RTL layout and script/font verification. |
| Hindi | `hi` | Corrects “Hindu”; Devanagari font and shaping need verification. |
| Georgian | `ka` | |
| Serbian | `sr-Cyrl`, `sr-Latn` | Required by the example. Support the script requested by device settings; decide if both bundles are in the first release. |

**Recommended scope decision:** ship both Chinese scripts and both Serbian scripts; ship both Portuguese regional bundles if events can serve both markets. This is 23 catalog variants rather than 20. If translation cost requires a phased launch, the product owner must confirm a smaller explicitly supported set and define which devices receive the partner-language fallback; do not label an untranslated language as supported.

Every UI language must have a translated display name or use the standardized native name (for example, العربية, हिन्दी, ქართული). Store and exchange BCP 47 tags consistently; do not persist ad hoc labels such as “Chinese” or “Serbian Latin”.

## 4. Target locale and text-fallback contract

### 4.1 Locale selection for a page

Use this precedence for a public event journey:

1. First supported match from the browser/device preference list, in preference order. On the server, parse `Accept-Language` with quality weights; in browser-only surfaces, use `navigator.languages` and then `navigator.language`. Do not inspect only the first item.
2. Partner default language.
3. Explicit event UI language, only when the partner has no default language.
4. English application fallback.

For non-event pages that know the partner but not an event, use steps 1, 2, 3, and 5. For global pages with no event or partner context, use steps 1, 2, and 5. Admin users may select their own preferred admin language; it must not mutate the event guest language.

This intentionally changes the existing event-first behavior: a supported device language wins, then partner default, then an event fallback only if the partner has none. Preserve saved settings during migration. If product owners instead want an event to force one language for all visitors, that is a separate explicit “force language” feature with UX and business approval; it must not be conflated with a default-language field.

### 4.2 Matching device language

Implement one pure, shared matcher used by server and browser. Normalize casing and separators, match exact supported tags first, then supported script/region variants by explicit rules, and only then a base language when its script is compatible. Respect browser preference order and `q` values. Never map across writing systems merely because the base language is the same. Examples:

- `hu-HU` -> `hu`.
- `sr-Latn-RS` -> `sr-Latn`; `sr-Cyrl-RS` -> `sr-Cyrl`.
- `zh-TW` -> `zh-Hant`; `zh-CN` -> `zh-Hans`.
- A supported `pt-BR` device preference must not silently receive `pt-PT` if both are shipped.
- An unsupported device language uses the partner default, then an event fallback only if no partner default exists, then English.

The implementation must document the alias and variant map and test it. Do not hand-roll a simplistic `startsWith()` language detector.

### 4.3 Per-message fallback

Locale choice selects the page language. Individual messages then resolve consistently:

1. An intentionally set event text override in the selected locale.
2. A partner text override in the selected locale.
3. A global text override in the selected locale.
4. The selected locale's reviewed dictionary message.
5. The equivalent event/partner/global override or dictionary message in the configured fallback locale.
6. The English dictionary.

Preserve the existing semantic distinction between a missing override and an intentionally empty override: empty can mean “hide this text” and must not fall through. For mixed-language fallback during rollout, set `lang` on fallback fragments where practical so assistive technology can pronounce them correctly. In a published locale release, missing dictionary keys are a release failure, not a normal fallback path.

## 5. Architecture and data rules

### 5.1 Locale identifiers and persistence

- Use one canonical BCP 47 registry/type for `UiLanguage`, API validators, database schema, language settings, dictionaries, and tests.
- Persist only supported canonical tags. Reject unsupported values at write APIs with a stable error code and safe localized UI message.
- Keep `Partner.uiLanguage` as the primary configured fallback. Preserve `Event.uiLanguage` as a fallback only when the partner has no default; a supported device language still wins. Missing both resolves to English after device negotiation.
- Avoid adding locale to photo/media records or Fanmass analytics payloads unless a particular user-visible text must be reproduced for audit purposes. Analytics categories and system contracts remain language-neutral.

### 5.2 Server and client agreement

- Resolve locale before rendering every public page. The initial HTML must have matching `<html lang>` and, for Arabic, `<html dir="rtl">` before hydration.
- The locale resolver must receive only the minimal context it needs: supported request preference, event configuration, and partner default. Avoid duplicate lookups and ensure cache keys vary by the inputs that can change output (at minimum locale and event/partner text-version where overrides affect content).
- Preserve current public URLs and QR/share links unless a separate migration is approved. A locale route prefix is not required for this work; a request cookie and server locale resolution may be used if that is compatible with current Next App Router constraints. The architecture spike must verify the chosen strategy for Next.js 16 App Router, static metadata, error/not-found boundaries, PWA, and cache behavior before rollout.
- Do not rely on a client-only effect to fix `lang` or direction after server HTML has already been exposed to assistive technology.
- Every API response that returns displayable enums should return canonical value plus enough stable meaning for the client to translate (`status: "approved"`, not a persisted translated label). Prefer dictionary keys or typed codes for visible errors; never infer a code by parsing English prose.

### 5.3 Message catalogs and interpolation

- Keep a canonical English source catalog with stable namespaced keys and descriptions/context for translators. All other catalogs must be structurally complete and have the same interpolation variables.
- Use a typed ICU-capable formatter or a well-defined equivalent for plural, select, date, and number formatting. Avoid concatenating sentence fragments or pluralizing in components.
- Format dates/numbers with `Intl` using the resolved UI locale and an explicit event/partner timezone. Language must not silently change event timezone semantics.
- Localize all system-provided visible values: role/status/action names, analytics labels, reasons, units, validation copy, accessibility labels, and empty/error/loading states. Keep user-defined partner/event copy as authored unless that content has an explicit translation field.
- Keep safe HTML policy for translated legal links and rich text. Prefer structured message segments/known links to arbitrary translator-provided HTML.
- Add a development/telemetry missing-key sentinel that logs the key and locale without logging user PII. Production UI must use the defined fallback and must not show raw keys.

### 5.4 Accessible RTL and typography

- Use CSS logical properties (`margin-inline`, `padding-inline`, `inset-inline`, `text-align: start/end`) throughout RTL-capable components. Audit GDS components and custom CSS for left/right assumptions.
- Use `dir="rtl"` for Arabic content and preserve LTR direction for email addresses, URLs, numeric IDs, and camera/canvas coordinate systems where appropriate, with explicit `dir="ltr"` wrappers.
- Verify bidirectional punctuation, mixed Arabic/Latin names, numbers, email addresses, links, and form validation text.
- Select fonts with glyph and shaping support for Latin diacritics, Cyrillic, Han, Arabic, Devanagari, and Georgian. Test actual bundled/served files and offline/PWA behavior; do not assume a font fallback is legible.
- Ensure zoom/reflow, text scaling, long translated labels, and wrapped consent text do not clip, overlap controls, or obscure focus.

## 6. Accessibility standard and audit coverage

Target **WCAG 2.2 AA** for every supported route/state. Accessibility is part of each delivery phase, not a final polish pass.

Required behaviors include:

- Semantic headings/landmarks, accessible labels and descriptions, correctly grouped consent controls, keyboard operation, visible and unobscured focus, logical focus order, and focus restoration after dialogs/route transitions.
- Pointer alternatives for camera/reframe/drag interactions; all actions work by keyboard and touch. Meet WCAG target-size criteria and use larger touch targets where practical for public capture.
- Error and state changes announced with appropriate live regions without repeatedly interrupting screen readers. Loading, camera permission denial, upload failure, review status, and submission completion need accessible names and recovery instructions.
- Contrast, non-color status cues, zoom/reflow at 200% and 400%, orientation flexibility, reduced motion, and no text clipping in long translations.
- Correct page language and language changes for inline fallback text; correct direction for Arabic; translated accessible names and alternatives; language picker operable without a pointer and announced with a clear selected value.
- Camera permission and file-selection flows must communicate what is needed, allow retry/fallback, and not trap keyboard focus. No color-only, drag-only, or hover-only controls.
- Consent/legal copy must remain understandable, link destinations and names must be localized, required and optional consent must be semantically and visually distinguishable, and keyboard/screen-reader activation must match pointer activation.

Automated scanning is necessary but insufficient. Pair axe checks with keyboard-only, screen reader, mobile touch, zoom/reflow, camera permission, Arabic RTL, and real-device language-setting checks.

## 7. Delivery work packages and order

### P0 — Product and content decisions; inventory and baseline

**Dependencies:** None.
**Outputs:** Approved locale manifest; route/string inventory; baseline accessibility results; decisions on variant bundles and fallback precedence.

- Inventory all route families and user-visible strings from source/rendered UI. Include public capture, consent, login, camera, reframe, wait/share, custom journey pages, emails/notifications, partner/event editors, admin, gallery, vetting, analysis, reports, landing/error/not-found states, metadata, and ARIA/alt text.
- Classify each value as app-owned copy, localized enum, user-authored content, partner/event override, server error, or data value with locale formatting.
- Confirm support for both Chinese scripts, both Serbian scripts, and Portuguese regions. This plan recommends all variants.
- Define locale precedence and the explicit meaning of event language versus partner fallback; migrate old event-first assumptions in copy and code comments.
- Run an initial route-by-route WCAG 2.2 AA review and capture reproducible findings, including existing GDS components and the GDS exception process.

**Acceptance:** A reviewed locale registry and route matrix exist; every visible-string category has an owner and test strategy; existing unsupported/hard-coded surfaces are tracked; no route is declared complete based only on a source search.

### P1 — Shared locale registry, negotiation, and SSR foundation

**Dependencies:** P0 decisions.
**Runtime flow:** Request arrives -> parse supported device language preferences -> resolve event/partner fallback -> select canonical locale -> render HTML, messages, metadata, and direction together.

- Replace `en | hu` assumptions across types, API validation, database schemas, partner/event forms, date/error helpers, and language labels with the canonical locale registry.
- Implement a pure deterministic BCP 47 matcher for weighted `Accept-Language` and `navigator.languages`, with exact/script/base matching rules and tests.
- Resolve locale for event routes using supported device choice first, then partner default, then explicit event fallback only if the partner has no default, and English. Resolve global routes without event/partner context. Preserve existing event/partner settings and override content.
- Implement a server-rendered locale context so `<html lang>` and `dir` are correct in the first response. Verify Next 16 caching, metadata, error boundaries, not-found, redirects, PWA/service worker, and QR links.
- Add a single typed locale resolution result carrying selected locale, source (`device`, `event`, `partner`, `app-default`), direction, and fallback locale. Do not expose device language lists in logs.

**Failure/recovery:** Unsupported/malformed header values are ignored; resolution falls through deterministically. If event/partner lookup fails, return a controlled page/error with English metadata and log the failure; never render an unhandled mismatch. No change to URLs is required. Keep a feature flag to revert to the existing configured event/partner language resolver during rollout.

**Observability:** Aggregate selected locale and source by route family; count unsupported device preferences and fallback use. Never log full `Accept-Language`, names, or emails.

**Acceptance:** Server and browser use the same matching rules; first HTML has correct language/direction; event/partner fallbacks work; all API writes reject unknown locale tags safely.

### P2 — Catalog governance, formatters, and visible-value localization

**Dependencies:** P1 registry.
**Runtime flow:** Component requests stable message key + typed values -> selected locale catalog formats message -> missing key emits safe fallback and non-PII diagnostic.

- Build message-catalog schema and extraction/inventory process; migrate hard-coded app-owned strings into stable keys in owned route batches.
- Cover validation, network/server errors, loading and empty states, toasts, statuses/reasons, aria labels, alt text, metadata, and format strings—not only prominent page headings.
- Replace English-prose substring error translation with stable error codes and typed interpolation data from API to UI.
- Standardize plural/select/date/number/time formatting and explicit timezone inputs.
- Implement catalog completeness, placeholder parity, valid markup/link structure, and missing-key checks in CI. No raw key or English-only surprise may reach production silently.
- Document override precedence and preserve intentionally blank event/partner text; include language tags for mixed-language fallback segments when practical.

**Recovery:** If a locale catalog cannot load, use its declared fallback catalog and record a bounded diagnostic. If a message key is absent, never crash the journey; show English fallback in development with a visible diagnostic and fail CI for shipped catalogs.

**Acceptance:** Every app-owned catalog message has a stable key/context; all dictionaries have complete, type-safe placeholders and plural forms; all API/client errors use stable codes; no untranslated new copy can merge without an explicit allowlist entry and owner.

### P3 — Guest capture, consent, camera, and submission journeys

**Dependencies:** P1 and P2 foundations.
**Runtime flow:** Device language is negotiated before page render -> localized consent/login/camera journey -> localized upload/error/status -> language-neutral submission and consent records.

- Migrate all guest-facing capture steps and any selectable partner/event journey page to the catalogs, including optional/required consent, camera permission prompts, photo/reframe, upload, wait, email, and completion states.
- Ensure consent values saved to the database remain canonical and auditable; localize only the wording presented. Required consent blocks only the related action; optional marketing consent never blocks the flow.
- Ensure participant input is retained and validated independently from translated labels and fallback language.
- Add keyboard/touch alternatives, accessible camera/file upload recovery, focus and live status behavior, text scaling, and larger touch target checks.
- Review link destinations, legal documents, and translation approvals separately from ordinary marketing/product copy.

**Acceptance:** Each public capture state is localized in every launched locale; camera denial, upload failure, retry, and success are accessible; consent choices and stored values do not vary with locale; device and partner fallback paths are covered end-to-end.

### P4 — Public share, email, metadata, and public-facing pages

**Dependencies:** P1 and P2; P3 for shared guest message components.
**Runtime flow:** Share/email rendering uses the same resolved locale contract and locale-aware formatters; machine-readable status and links remain canonical.

- Localize public share/download surfaces, global capture entry, error/not-found pages, metadata and link previews, email subjects/bodies/buttons, and email/legal previews.
- Ensure emails use the appropriate saved submission/event language policy, with correct UTF-8 and script rendering. Do not change recipient, consent, or delivery semantics as a side effect.
- Define locale/time-zone behavior for timestamps. Event timezone is explicit and independent of UI language; include timezone in visible output when ambiguity matters.
- Localize image alternative text and document language metadata; never translate user-generated labels without explicit translated content.

**Acceptance:** Share pages and email previews match selected/configured locale, language tags, script, links, and timezone; email failures remain observable/retryable by existing notification workflow; fallback behavior is tested without sending live mail.

### P5 — Partner/event configuration and admin/vetting/analysis surfaces

**Dependencies:** P1 and P2.
**Runtime flow:** Admin's own locale controls admin chrome; event/partner guest-language settings control guest fallback and custom content, independently.

- Localize partner/event creation/editing, language-setting labels and help, journey/text editors, galleries, vetting, analysis, reports, exports UI, and admin feedback/errors.
- Separate “admin interface language” from the partner/event guest default language. Display supported languages by native name and explain device-first behavior and fallback.
- Localize enum labels and accessible controls while retaining canonical stored values and API payloads.
- Audit RTL administration layouts and data tables; keep identifiers, email, and technical tokens readable LTR where appropriate.
- Make export field language explicit: canonical export values by default; localized presentation labels only where the export format asks for them.

**Acceptance:** Admin language and guest language settings are independent; no localized enum string is written to the database; administrators can configure any supported guest fallback; all operational review/analysis states are translated and accessible.

### P6 — RTL, typography, scripts, and visual resilience

**Dependencies:** P1 and initial P3/P5 component migrations; must be tested continuously as catalog translations land.
**Runtime flow:** Locale supplies `lang` and `dir`; logical layout and script-capable fonts render the same controls without clipping or reversed technical values.

- Audit GDS and application components for RTL support; use logical CSS and document permitted LTR subregions.
- Choose script-capable bundled/fallback fonts, check legal redistribution/licensing, and verify PWA/offline use. Avoid downloading large font subsets unnecessarily; use subset/font-display strategy with measurable loading budgets.
- Test long/wide strings, diacritics, combining marks, shaping, line breaks, punctuation, mixed-direction content, and numerals across all scripts.
- Add visual checks for common breakpoints, mobile safe areas, desktop, high zoom, text spacing overrides, and capture-screen overlays.

**Failure/recovery:** Missing font glyphs must fall through to a verified system font without tofu boxes. RTL problems are release blockers for Arabic. A locale-specific visual defect can be rolled back by disabling that locale while retaining English/partner fallback; do not force another script variant.

**Acceptance:** No clipped/overlapping visible copy; Arabic flows are right-to-left where required and technical values remain readable; all scripts render correctly on supported browser/OS combinations and PWA offline mode.

### P7 — Translation production, locale QA, and controlled rollout

**Dependencies:** P0-P6; translation begins against frozen, contextualized catalogs and can run in parallel with code migration after P2 schema stabilizes.
**Runtime flow:** Source key approved -> professional translation -> native linguistic review -> legal review where applicable -> catalog validation -> locale-specific QA -> staged enablement.

- Prepare translator context, screenshots, character limits, glossary, tone, placeholders, component limitations, and prohibited changes for each string.
- Use professional/native translators and a reviewer per language. Machine translation may help as a draft only; it is not final copy. Consent/privacy/legal and safety copy require qualified legal/privacy review in each launch jurisdiction.
- Run locale-specific functional, linguistic, accessibility, screenshot, and real-device QA. Include people who use assistive technologies and Arabic RTL review.
- Release locales behind per-locale flags. Enable a locale only when catalog coverage and route acceptance gates are met. Capture fallback-source metrics and missing-key alerts; do not enable partially translated locale bundles.
- Maintain an emergency disable path per locale, with English and event/partner fallback available without data migration.

**Acceptance:** 100% of app-owned visible keys are reviewed for each enabled locale; all interpolation/markup checks pass; legal copy is approved; locale test matrix passes; rollback procedure is rehearsed; support/operations have language fallback guidance.

## 8. Cross-cutting implementation requirements

Each work package must include:

- **Architecture/contracts:** shared canonical locale types, translation keys, stable API error codes, canonical enum values, locale-source metadata, and explicit timezone inputs.
- **Runtime flow:** deterministic server/client resolution and message rendering; no client-side language flash.
- **UX states:** selected, loading, empty, permission-denied, validation-error, network-error, retry, success, and fallback states in each applicable route.
- **Accessibility:** keyboard, touch, screen reader, contrast, focus, zoom/reflow, motion, language metadata, and direction requirements on acceptance criteria.
- **Observability:** route family + selected locale + resolution source + fallback/missing-key/error code counts; no raw user language header, photo, or contact data in logs.
- **Timeouts/retries:** translation dictionaries should be local/static assets, not a runtime translation service dependency. A locale fetch/load failure uses a known local fallback; route data failures use existing bounded retry behavior and clear retry UI.
- **Rollback/recovery:** feature-flag per locale; preserve stored partner/event settings and override content; invalid language falls back deterministically; never rewrite user records to localized values.
- **Testing:** pure negotiation unit tests, API/schema tests, route/locale rendering tests, catalog completeness tests, axe automation, keyboard/screen-reader/manual checks, screenshot review, RTL, and PWA/offline checks as relevant.
- **Documentation:** update `docs/UI_LANGUAGE.md`, API/data dictionaries, admin/user guide, translation glossary, support fallback guide, and release notes in the same delivery sequence.

## 9. Release gates

A locale is not “supported” until all of these pass:

1. Its canonical locale tag, script/region match rules, and fallback are in the approved registry.
2. Every app-owned visible string and accessible name on every in-scope route has reviewed copy; catalog key coverage is 100% with placeholder/plural parity.
3. No untranslated app-owned literal remains outside the audited allowlist (user content, technical identifiers, and proper names are categorized rather than translated).
4. Server output has correct `<html lang>` and `dir`; no locale flash after hydration; all error/not-found/metadata paths have deterministic language behavior.
5. Automated accessibility scans have no unresolved critical/serious findings; WCAG 2.2 AA manual checks pass for keyboard, screen reader, camera/touch, zoom/reflow, and RTL where applicable.
6. All primary route states work at mobile and desktop breakpoints, including long text, device selection, partner/event fallback, and English final fallback.
7. Dates, numbers, plurals, timezones, links, emails, consent records, and enum/API values have regression evidence.
8. Observability and locale rollback are exercised in staging; no PII is emitted in diagnostics.
9. User/admin documentation, translation glossary, and release notes are updated.

## 10. Risks, rollback, and open decisions

### Risks to manage

- Expanding all UI at once can leave hard-coded copy, errors, or accessible names in long-tail routes. Use route-family inventory and block each route family from release until its own coverage gate passes.
- Client-only language detection causes flashes and incorrect screen-reader pronunciation. Server/client parity is a P1 blocker.
- Wrong locale negotiation can serve a different script (especially Serbian, Chinese, and Arabic). Explicit script rules and device QA are mandatory.
- Adding 20-23 bundles can increase JavaScript and font payloads. Load only needed message chunks, measure route budgets, and avoid shipping all dictionaries to every client.
- Translation may expand copy and break layouts, focus targets, or consent comprehension. Validate translated text in real components; do not truncate legal or consent copy to fit.
- RTL affects layout, punctuation, camera controls, charts, and mixed-direction text. Treat Arabic as a full layout mode, not a translated dictionary alone.
- Legal/consent wording cannot be safely auto-translated. Launch only after the relevant reviewer approves it.
- Per-request `Accept-Language` can fragment CDN caching. Locale must be an explicit cache variation or rendered at a safe dynamic boundary; verify cache behavior to avoid one visitor receiving another language.

### Decisions to confirm before P1 is locked

The recommendation is to proceed with the explicit choices in this plan; these are visible product/content decisions, not implementation blockers:

- Ship both `zh-Hans` and `zh-Hant` (recommended).
- Ship both `sr-Cyrl` and `sr-Latn` because the requirement names Serbian device users (recommended).
- Ship `pt-BR` and `pt-PT`, or choose a single initial Portuguese market (recommended: both if both are commercially relevant).
- A manual visitor language selector is deferred; add it only as a separate UX decision. Device preference remains above partner/event fallback.
- Use the partner language as the first configured fallback after device preferences; consult explicit event language only when the partner has no default. A “force one language for every visitor” mode would need a separate requirement.
- The persistent admin-language preference is implemented for the same authorized global-admin and partner-workspace users who can access the admin shell. Full route-by-route admin localization remains open and must keep this preference separate from guest locale configuration.

### Rollback

Locale flags disable a newly launched locale without changing event/partner configuration, consent records, photo data, or canonical enum values. Resolution falls back to the configured event/partner language and then English. A rollback must not erase a visitor's stored preference; if it becomes unsupported, it is ignored and can be selected again after the locale is re-enabled.

## 11. References

- [W3C Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) — target conformance level AA.
- [W3C: What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) — new focus visibility, dragging, target-size, and authentication criteria.
- [W3C Understanding SC 3.1.1: Language of Page](https://www.w3.org/WAI/WCAG21/Understanding/language-of-page) — programmatically identify the default human language of each page.
- [Next.js App Router internationalization guide](https://nextjs.org/docs/app/guides/internationalization) — locale negotiation and App Router implementation considerations; preserve Camera's established public URLs unless a route migration is separately approved.
