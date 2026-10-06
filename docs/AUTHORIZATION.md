# Authorization Guide

**Version**: 12.3.40  
**Last Updated**: 2026-09-28

This is the current authorization model for Camera.

## 1. Critical rule

For app-level authorization, use `session.appRole`, not `session.user.role`.

Wrong:

```ts
if (session.user.role === 'admin') {
  // wrong scope
}
```

Correct:

```ts
if (session.appRole === 'admin' || session.appRole === 'superadmin') {
  // correct app-level check
}
```

## 2. Two authorization layers

### Layer A: SSO app access

Stored on the Camera session:

- `session.appRole`
- `session.appAccess`

Meaning:

- can this identity use Camera at all
- is this identity a global Camera admin

### Layer B: partner-scoped app access

Stored in Camera MongoDB:

- collection: `partner_user_access`

Meaning:

- which partner workspaces this identity may access
- which app surface is allowed there
- whether access is read-only or write-capable

## 3. Partner-scoped access shape

Typical row:

```ts
{
  accessId: "uuid",
  partnerId: "partner-uuid",
  partnerName: "AC Milan",
  userId: "optional-sso-user-id",
  userEmail: "user@example.com",
  userName: "User Name",
  appKey: "events",
  role: "viewer" | "manager" | "admin",
  isActive: true,
  createdAt: "...",
  updatedAt: "..."
}
```

## 4. Current policy

This is the implemented policy as of 2026-05-20:

1. valid session with `appAccess !== false` may reach the admin shell
2. global `admin` and `superadmin` remain full bypass
3. non-global admins must have partner assignments to see partner/app admin surfaces
4. global inventory pages remain global-admin-only
5. partner/app APIs should enforce matching partner scope where implemented

## 5. Roles and intent

### Global SSO app roles

- `superadmin`
- `admin`
- `user`
- `none`

These come from SSO and apply to the Camera app as a whole.

### Partner-scoped roles

- `viewer`
  - can view assigned partner/app surfaces
- `manager`
  - can create and update within assigned partner/app scope
- `admin`
  - can perform full partner/app operations inside that scope

## 5.1 Permission matrix

| Role | Admin shell | Partner pages | Events App | Try-On App | Global inventory | Mutations |
|------|-------------|---------------|------------|------------|------------------|-----------|
| Global `admin` / `superadmin` | yes | yes | yes | yes | yes | full |
| Partner `admin` | yes | assigned only | assigned app only | no | no | full inside scope |
| Partner `manager` | yes | assigned only | assigned app only | no | no | create/update inside scope |
| Partner `viewer` | yes | assigned only | assigned app only | no | no | read-only |

## 6. Route model

### Middleware

Root `proxy.ts`:

- validates the serialized session for `/admin` (presence + `expiresAt`/`sid` only)
- does NOT check `appAccess` at the edge — that check is a per-route concern
  (`lib/auth/middleware-session-gate.ts` reads only session validity). This
  matches `ARCHITECTURE.md`; an earlier version of this doc claimed the proxy
  rejects on `appAccess === false`, which the code never did.
- no longer requires global admin role at the edge

### Layout gate

`app/admin/layout.tsx`:

- resolves session
- resolves navigation access from SSO role + partner assignments
- redirects away if the user is neither global admin nor partner-assigned

### Global-only pages

These remain global-admin-only:

- `/admin`
- `/admin/users`
- `/admin/frames`
- `/admin/frames/generated` (rollout of the generated default frame, camera#238; the page checks for a global admin and `POST /api/admin/frame-backfill` requires `requireAdmin`)
- `/admin/logos`
- `/admin/submissions`
- `/admin/tryon/**`

### Partner/app pages

These can be partner-scoped where implemented:

- `/admin/partners`
- `/admin/partners/[id]`
- `/admin/events`
- `/admin/events/[id]`

### Photo review (camera#267)

`POST /api/admin/submissions/[submissionId]/review` approves or rejects a photo of an event with vetting required. A global admin may
review any photo; a partner user needs the **manager** role on the photo's event (`assertGlobalAdminOrPartnerEventAccess(..., 'manager')`),
and a photo that belongs to no event is global-admin only. Changing the event setting itself (`photoVetting.required`) stays global-admin only.

### Public photo surfaces (camera#262)

What a visitor may see of a saved photo is decided by one rule, `lib/submissions/visibility.ts` (`isPubliclyVisible`): not archived,
not hidden from every event it belongs to, not pending or rejected (a vetted photo that is waiting or rejected is shown a notice, never the photo, and only when reached by its share token), and a try-on result only when approved and not turned off for
sharing. It is applied to `/share/[id]` and its link preview, `/api/share/[id]/download`, `/api/slideshows/[id]/next-candidate`
and `/users/[name]` (admins excepted). The slideshow playlist, the savetheworld wall and publish-selfies, the fanmass feed and the
emails follow in V9 of `docs/PHOTO_VETTING_PLAN.md`.

### Event-scoped management APIs

These now follow the same partner-aware policy and should require global admin or partner-scoped Events manager access:

- event frame assignment routes
- event logo assignment routes
- slideshow CRUD routes
- slideshow-layout CRUD routes
- landing page CRUD routes (partner Events manager)
- event gallery upload and submission removal routes (partner Events manager)
- event frame design routes: reading the snapshot and message list needs partner `viewer` access to the event, saving the messages and refreshing from messmass need `manager`; access is checked before the event is looked up (camera#234). The editor panel on `/admin/events/[id]/frames` (camera#237) shows the same controls to everyone who can open that page; a viewer who presses Save or Refresh gets the route's 403 shown in the panel, and nothing is changed
- slideshow background image upload (partner Events manager)

### Permanent deletion of a submission

`DELETE /api/submissions/[submissionId]` is allowed for the submission's owner (the fan's own erasure) and for
global `admin` / `superadmin`; it deletes the stored image files first and then the record, see RUNBOOK
"Deleting a submission" (camera#211). Try-on results are removed only through
`POST /api/admin/tryon-results/[submissionId]/remove` (global admin). Event and partner "remove" only hide
a submission (it can be restored), so they keep its files.

## 7. Recommended check order

When writing new code:

1. authenticate session
2. reject if `appAccess === false`
3. allow global `admin` / `superadmin` bypass where intended
4. if the resource is partner-scoped, resolve partner assignment
5. enforce `appKey`, `role`, and `isActive`

Do not replace all global checks with partner checks. The layers solve different problems.

## 8. Preferred helpers

### API route auth

Use helpers from `@/lib/api`:

- `requireAuth`
- `requireAdmin`

For partner-scoped checks, compose them with:

- `isGlobalAdminSession`
- `getPartnerScopedAccessForPartner`
- `getPartnerScopedAccessForEvent`
- `listAccessiblePartnerIds`
- `getAdminNavigationAccess`

Those live in:

- [lib/partners/authorization.ts](../lib/partners/authorization.ts)

### Why not use `@/lib/auth/session` `requireAdmin` in APIs

The `@/lib/api` middleware helpers produce proper 401/403 API responses. The session helper is fine for internal code paths but is not the preferred API-route authorization layer.

## 9. Common mistakes

### Mistake 1: using `session.user.role`

That is the IdP/global SSO role, not Camera app role.

### Mistake 2: assuming partner assignments replace app role

They do not. Partner assignments do not grant login to Camera by themselves.

### Mistake 3: using global inventory pages as partner-scoped pages

Those pages are intentionally global-admin-only.

### Mistake 4: assuming `eventId` route params imply partner scope automatically

Resolve the event, then resolve partner-scoped authorization from the event’s partner.

## 10. Operational notes

- permission changes made in SSO generally require a fresh session to take effect
- partner assignment changes take effect through Camera reads and do not require SSO schema changes
- partner assignments use `appKey: "events"` only
- development-only auth/bootstrap routes exist for E2E smoke tests and are blocked in production

## 11. Files to check when changing authorization

- [proxy.ts](../proxy.ts)
- [app/admin/layout.tsx](../app/admin/layout.tsx)
- [lib/auth/middleware-session-gate.ts](../lib/auth/middleware-session-gate.ts)
- [lib/api/middleware.ts](../lib/api/middleware.ts)
- [lib/partners/access.ts](../lib/partners/access.ts)
- [lib/partners/authorization.ts](../lib/partners/authorization.ts)

## 12. Review checklist

- use `session.appRole`, not `session.user.role`
- confirm whether the page or API is global-only or partner-scoped
- if partner-scoped, verify `appKey`
- verify read vs write role threshold
- update docs when behavior changes

## 13. Session cookie integrity

`camera_session` has two forms (`lib/auth/session.ts`):

- **Pointer cookie** (normal in production, whenever `MONGODB_URI` + `MONGODB_DB`
  are set): `{ v, sid, expiresAt }` where `sid` is a 256-bit random id. The
  session itself lives in the `web_sessions` collection; nothing in the cookie
  can be edited to change who you are.
- **Plain cookie** (fallback when the Mongo session store is unavailable, or
  `COOKIE_ONLY_SESSIONS=1`; `lib/auth/web-session-db.ts:43-46`): the session JSON, including `appRole`, plus an
  HMAC-SHA256 `sig` over it (`lib/auth/session-signing.ts`). `getSession()`
  returns `null` for any plain cookie whose signature is missing or does not
  verify, so a hand-written cookie cannot claim a role. Before this rule the
  plain cookie was trusted as parsed, which meant anyone could forge
  `appRole: "superadmin"` (camera#122).

Signing key: `OAUTH_PKCE_STATE_SECRET`, else `SESSION_SECRET`, else
`SSO_CLIENT_SECRET` (the same resolver the OAuth state uses,
`lib/auth/oauth-pkce-state.ts:13-19`). With none of them
set, login cannot issue a plain cookie and no plain cookie is accepted. The
plain cookie is readable by whoever holds it (it is not encrypted); its
confidentiality still rests on `HttpOnly`, `Secure` and TLS. Rotating the key
signs everyone on a plain cookie out once; pointer-cookie sessions are
unaffected.
