# Camera UI consistency audit

**Audit date:** 2026-11-01
**Repository baseline:** `origin/main` at `968d35ca2a2962c03a34d140b5ec5038c5930eae`, plus the changes in this delivery
**Scope:** Authenticated Camera admin pages and shared controls

## Result

The automated browser audit covers all **71** `app/admin/**/page.tsx` routes. It server-renders every route and loads each in a browser at 1440, 768, and 390 CSS-pixel widths. The login entry page is held on its documented `no_access` error state because its normal behavior immediately redirects to SSO. Checks include server errors, the global error boundary, body-level horizontal overflow, accessible names on visible interactive controls, visible control boundaries, and keyboard focus rings. It also checks native checkbox/radio size and accent treatment.

The audit found and this delivery fixes:

- Admin control boundaries were conditional on a theme attribute and could disappear on routes without that attribute. Boundaries now apply consistently inside the Camera admin shell using the existing GDS theme tokens.
- Native checkboxes and radio buttons were too small for reliable touch selection. They now render at 24 by 24 CSS pixels.
- The shared `Field` component displayed a label but did not associate it with its first text, number, select, file, color, or textarea control. The label and optional helper text are now connected to that control.
- Mantine number inputs exposed unlabeled icon-only increment/decrement buttons. The shared Camera number input hides those buttons by default while retaining keyboard ArrowUp/ArrowDown stepping; callers can explicitly opt back in.
- The color picker’s eyedropper icon button had no accessible name. It now has a descriptive name, and a caller-supplied name remains respected.
- The event selector did not expose a reliable accessible name. It now has the name “Jump to an event.”
- The mobile admin shell could overflow by one pixel in RTL. The shell/document now clip that off-canvas drawer edge; the audit checks body width at phone size.

The account page is checked for a visible loading state and a retryable 503 error. Analytics is checked for a valid “Not measured yet” state. Role coverage verifies the global admin, partner-scoped Events manager, partner-scoped Events viewer, and redirection from a forbidden global-users route.

## Method and reproducibility

The route inventory is generated from source files at test time, so newly added `page.tsx` routes join the audit automatically. The browser audit runs against a production build on localhost and uses the disposable `camera_test` database with E2E fixtures. It does not read or mutate production data.

Run the release checks and browser audit with:

```sh
npm run release:check
MONGODB_DB=camera_test ALLOW_DANGEROUS_DEV_ROUTES=true npm run start -- --port 3101
PLAYWRIGHT_START_WEB_SERVER=false PLAYWRIGHT_BASE_URL=http://localhost:3101 MONGODB_DB=camera_test npx playwright test tests/e2e/admin-account-language.spec.ts tests/e2e/admin-ui-consistency.spec.ts tests/e2e/admin-access.spec.ts --reporter=line
```

The test cleans its E2E fixtures in a `finally` block. Stop the local server after the run.

## Coverage matrix

| Dimension | Checked | Coverage and limits |
|---|---|---|
| Routes | Yes | All 71 admin page routes are server-rendered and browser-loaded as a global admin. Invalid child IDs intentionally exercise not-found states for nested editors. The SSO login entry is held on its `no_access` state and checked for rendering/overflow; it is outside the authenticated admin-shell control checks. |
| Roles | Partial | Global admin, partner-scoped Events manager, partner-scoped Events viewer, and one forbidden-route redirect. The full route-by-role permission matrix is not covered. |
| Viewports | Yes | Every route at 1440×900, 768×900, and 390×900. Checks body overflow and interactive control layout metrics, not every text-wrap or visual-detail judgment. |
| Languages | Partial | English/default on the route inventory; saved Hungarian preference and its save announcement; Arabic RTL at mobile width. The full set of 23 locale variants is not rendered on every route. |
| Loading | Partial | Account-preferences loading state is held and asserted. Other asynchronous screens are not forced into a loading state. |
| Empty | Partial | Analytics no-data/“Not measured yet” state is asserted; resource-list empty states are rendered when present but are not exhaustively forced on every route. |
| Errors | Partial | Account-preferences 503 and retry action are asserted; route-level 500/global-error checks cover the route inventory. Other API failure modes are not injected for every route. |
| Accessibility | Partial | Visible admin controls are checked for accessible names and focus rings; inputs/selects/textareas are checked for boundaries; native choice size is checked. This is not a full WCAG audit or screen-reader test. |
| Themes | Not exhaustive | GDS-managed focus treatment and tokenized admin boundaries are checked in the current test theme. Full light/dark and custom event-brand contrast combinations need visual review. |

## Remaining work

1. Exercise the complete role-to-route matrix for global and partner/event-scoped permissions, including read-only roles.
2. Render all supported admin locales across representative dense forms, tables, dialogs, and navigation; prioritize RTL Arabic and long translated labels. Inspect screenshots for clipping, overlap, truncation, and inconsistent spacing.
3. Force and inspect loading, empty, success, validation, network-error, and retry states for every major editor and operational workflow, rather than relying on the representative account and analytics states above.
4. Perform a manual keyboard and screen-reader pass on navigation, tables, menus, dialogs, rich editors, and media pickers. Confirm contrast in light/dark modes and custom partner/event themes.
5. Resolve the shared GDS empty-state decorative icon button that is currently inside an `aria-hidden` subtree but remains focusable; it is excluded from the functional-control-name assertion because it is marked decorative by GDS. Fixing that belongs in the shared component contract.

This report records a **completed automated route/control audit and a bounded rendered-layout consistency pass**, not a claim that every role, locale, theme, or transient state has been manually inspected or pixel-reviewed.
