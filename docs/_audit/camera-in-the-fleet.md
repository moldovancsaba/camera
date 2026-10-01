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
- **camera ↔ try-on (legacy, paused 2026-09-30)**: Camera retains `tryon_jobs`,
  result submissions, and moderation history. The local try-on worker is stopped,
  try-on is disabled on current events, and the five-minute sync cron is removed.
- **camera → image.direct (planned, not live)**: the target design keeps Camera's
  queue authoritative and dispatches over authenticated server APIs to image.direct's
  local worker; verified R2 results return through an idempotent Camera completion
  callback and remain pending moderation. No shared Atlas credentials or cross-app
  collection writes are planned. Contract: `docs/IMAGE_DIRECT_INTEGRATION.md`.
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
