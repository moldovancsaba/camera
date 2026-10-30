# Camera admin account settings

## Scope

The first account-settings slice exposes one editable personal preference: the language of the Camera admin interface. The admin header exposes a language selector on every admin route; the account panel also links to `/admin/account`, where the same preference can be changed alongside read-only SSO name and email fields. Camera does not duplicate those identity values in its own preference store.

This preference is independent of partner/event `uiLanguage`. It changes neither guest journey copy nor any partner, event, photo, or analytics data.

## Locale resolution

For authenticated admin pages other than `/admin/login`, resolution happens in the root server layout before the page is rendered:

1. A valid language saved by the authenticated SSO subject.
2. The first supported locale in the request's `Accept-Language` preferences.
3. English.

Selecting **Use device language** persists `uiLanguage: null`, so later requests resume browser language negotiation. A successful save updates the current client provider immediately and refreshes the server-rendered route. The sign-in page has no authenticated preference and remains device-language first.

## Persistence contract

Collection: `admin_user_preferences`.

```ts
{
  _id: string;             // exact SSO user ID / subject
  uiLanguage: UiLanguage | null;
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
}
```

No SSO name, email, access token, or profile field is copied into this collection. Existing or malformed locale values are ignored and resolve through the device fallback.

## API

- `GET /api/account/preferences` returns the signed-in user's `{ uiLanguage, deviceLanguage }`.
- `PATCH /api/account/preferences` accepts exactly `{ "uiLanguage": "hu" }` or `{ "uiLanguage": null }`.
- Supported values are the canonical `UI_LANGUAGES` registry. The API derives the record key from the session; client-supplied user IDs or extra fields are rejected.
- Both operations require a valid session plus the same global-admin or partner-workspace access accepted by the admin layout, and use the standard read/write rate limits.

## UI and accessibility

The header selector and account-page selector display each locale's native name followed by its English name in parentheses, plus a device-language option labeled with the currently negotiated locale. Changing the header selector saves immediately; the account-page form uses an explicit save action. Account identity fields are read-only. Loading, load failure, save failure, and save success states are visible; both successful save paths announce completion through a polite live region. The GDS `AdminSelect`, page header, sections, alerts, state blocks, and semantic action buttons provide the form and feedback patterns. The page carries the selected `lang` and `dir`, including RTL for Arabic.

Account-page copy currently has machine-drafted strings for all 23 registered locale variants. As with the wider localization catalogs, a native review and route-by-route accessibility review remain release work. Admin screens outside connected catalogs may still contain English copy.

## Verification

Unit tests cover SSO-subject isolation, the minimal stored record, accepted and rejected payloads, API authentication, invalid locales, device-language reporting, reset-to-device behavior, and server locale precedence. Manual release verification should additionally check a saved preference across a full reload and a second browser/device, a failed API read/write, keyboard-only selection/save, screen-reader status announcement, and Arabic direction.
