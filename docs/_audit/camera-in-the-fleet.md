# camera in the SEYU fleet

camera is the fan photo-capture app. It runs on Vercel. (It used to be the
fleet's try-on job producer; that integration is switched off and being removed,
see `docs/TRYON_REMOVED.md`.)

- **camera ↔ messmass** (bidirectional): messmass is master and provisions
  organizations/partners/events INTO camera (`/api/internal/messmass/*`). camera
  also calls messmass OUTBOUND — it pushes natively-created partners to
  `/api/integrations/camera/partners` and mints a cross-app session via
  `/api/integrations/camera/sso-session` (`lib/messmassClient.ts`). camera is also
  the fleet's only email sender (`POST /api/internal/email/send`, used by messmass
  and fanmass with a shared secret).
- **camera ↔ try-on (removed, issue 557)**: the integration is switched off since
  2026-09-30 and is being deleted from camera (git tag `tryon-integration-final`,
  `docs/TRYON_REMOVED.md`). Its data stays in the database, unreferenced. The
  try-on repository is not touched; a rebuild will be a separate add-on.
- **camera → image.direct (planned, never live, no longer planned in this form)**:
  the contract in `docs/IMAGE_DIRECT_INTEGRATION.md` is kept as a record only.
- **camera → fanmass**: fanmass PULLS events + media from camera's
  `/api/internal/fanmass/*` (camera does not call fanmass).
- **camera ↔ savetheworld** (edge E7 in the fleet map): savetheworld calls
  camera's `/api/internal/savetheworld/*` with `x-savetheworld-secret`
  (`CAMERA_SAVETHEWORLD_INTERNAL_SECRET`) to list/create partners and events,
  read the public pledge wall (`GET /pledges`, including the private
  `?submissionId=` lookup), and bulk-publish an event's selfies
  (`POST /events/[eventId]/publish-selfies`). camera → savetheworld is a browser
  handoff only: the post-selfie CTA opens `SAVETHEWORLD_APP_URL` carrying
  `submissionId` (camera makes no server-side call to savetheworld).
- **camera → SSO**: PKCE public client by default.

Canonical cross-app map: messmass `docs/_audit/fleet-architecture.md`.
API surface: `docs/_audit/api-reference.md`. Auth model: `docs/AUTHORIZATION.md`.
