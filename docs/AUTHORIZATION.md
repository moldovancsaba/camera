# Authorization Guide

**Version**: 2.10.0  
**Last Updated**: 2026-05-26

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

- validates serialized session for `/admin`
- rejects when `appAccess === false`
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
- `/admin/logos`
- `/admin/submissions`
- `/admin/tryon/**`

### Partner/app pages

These can be partner-scoped where implemented:

- `/admin/partners`
- `/admin/partners/[id]`
- `/admin/events`
- `/admin/events/[id]`

### Event-scoped management APIs

These now follow the same partner-aware policy and should require global admin or partner-scoped Events manager access:

- event frame assignment routes
- event logo assignment routes
- slideshow CRUD routes
- slideshow-layout CRUD routes

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

- [lib/partners/authorization.ts](/Users/Shared/Projects/venturecogroup/camera/lib/partners/authorization.ts)

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

- [proxy.ts](/Users/Shared/Projects/venturecogroup/camera/proxy.ts)
- [app/admin/layout.tsx](/Users/Shared/Projects/venturecogroup/camera/app/admin/layout.tsx)
- [lib/auth/middleware-session-gate.ts](/Users/Shared/Projects/venturecogroup/camera/lib/auth/middleware-session-gate.ts)
- [lib/api/middleware.ts](/Users/Shared/Projects/venturecogroup/camera/lib/api/middleware.ts)
- [lib/partners/access.ts](/Users/Shared/Projects/venturecogroup/camera/lib/partners/access.ts)
- [lib/partners/authorization.ts](/Users/Shared/Projects/venturecogroup/camera/lib/partners/authorization.ts)

## 12. Review checklist

- use `session.appRole`, not `session.user.role`
- confirm whether the page or API is global-only or partner-scoped
- if partner-scoped, verify `appKey`
- verify read vs write role threshold
- update docs when behavior changes
