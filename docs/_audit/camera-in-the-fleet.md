# camera in the SEYU fleet

camera is the fan photo-capture app and the fleet's try-on job producer. It runs
on Vercel.

- **camera ↔ messmass** (bidirectional): messmass is master and provisions
  organizations/partners/events INTO camera (`/api/internal/messmass/*`). camera
  also calls messmass OUTBOUND — it pushes natively-created partners to
  `/api/integrations/camera/partners` and mints a cross-app session via
  `/api/integrations/camera/sso-session` (`lib/messmassClient.ts`). camera is also
  the fleet's only email sender (`POST /api/internal/email/send`, used by messmass
  and fanmass with a shared secret).
- **camera ↔ try-on** (shared Atlas): camera writes `tryon_jobs`; the try-on
  worker claims/renders; completion returns via `POST /api/internal/tryon/complete`
  (or the 5-min `/api/internal/tryon/sync` backstop cron).
- **camera → fanmass**: fanmass PULLS events + media from camera's
  `/api/internal/fanmass/*` (camera does not call fanmass).
- **camera → SSO**: PKCE public client by default.

Canonical cross-app map: messmass `docs/_audit/fleet-architecture.md`.
API surface: `docs/_audit/api-reference.md`. Auth model: `docs/AUTHORIZATION.md`.
