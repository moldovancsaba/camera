# Frame-It-Now (Camera)

**Product**: Frame-It-Now — mobile-first selfie PWA for events and public engagement.  
**Repository / UI strings**: The codebase and some pages still label the app **“Camera”**; operationally this is the same product.

**Version**: 2.7.0  
**Last Updated**: 2026-03-30  
**Status**: Production-ready

A Next.js application: users capture photos, apply branding frames, upload to a CDN, store metadata in MongoDB, share via public links, and display submissions on event slideshows with fair rotation and aspect-aware layouts.

---

## Quick Start

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm start
```

---

## Technology Stack

| Area | Choice |
|------|--------|
| Framework | Next.js (App Router) |
| Language | TypeScript (strict) |
| Database | MongoDB |
| Auth | SSO (OAuth2/OIDC + PKCE), encrypted session cookie |
| Image hosting | imgbb.com |
| Styling | Tailwind CSS |
| Transactional email | Not wired (SSO does not send app mail; see docs/AUTHORIZATION.md) |

---

## 1. System Model

### End-to-end flow

1. Participant opens **`/capture/[eventId]`** (event) or **`/capture`** (legacy global capture).
2. Optional **custom pages**: who-are-you, accept, CTA — then frame selection (if multiple frames), **camera** (`getUserMedia`) or **file upload** (legacy page).
3. **Client-side compositing**: Canvas draws the photo (cropped to frame aspect ratio on the event path), then the frame asset; output is a JPEG (quality ~0.85, longest side capped around 2048px).
4. **POST `/api/submissions`**: sends base64 image data + event UUID + optional `userInfo` / `consents`.
5. **Server** uploads to **imgbb**, inserts a **submission** document in MongoDB.
6. **Share**: `/share/[id]` uses the submission’s MongoDB `_id` and **`imageUrl`** for OG tags and display.
7. **Slideshow**: `/slideshow/[slideshowId]` fetches playlist JSON, renders 16:9 single or mosaic slides, **POSTs play counts** so least-played items surface more often.

### Major components

| Layer | Responsibility |
|--------|------------------|
| Browser | Camera, canvas compositing, share/download UX, slideshow player (triple-buffer playlists, preload). |
| Next.js API routes | Events, frames, logos, submissions, slideshows, auth, admin CRUD. |
| MongoDB | Partners, events, frames, logos, submissions, slideshows; optional user cache; SSO DB reads for inactive-user filtering in playlists. |
| imgbb | Stores composed and admin-uploaded rasters; returns public URLs and delete URLs. |

### Data flow (camera → slideshow)

**Video → canvas snapshot** (JPEG, frame aspect) → **second canvas** (photo + frame bitmap) → **JSON POST** → **imgbb** → **MongoDB insert** → **slideshow aggregate** (match by event UUID, sort by `playCount` / `createdAt`) → **`generatePlaylist`** → client display → **`/played`** increments counts.

---

## 2. Feature Breakdown

### Camera capture (`components/camera/CameraCapture.tsx`)

- **Behavior**: `getUserMedia` with high ideal resolution; front/back switch; Safari-oriented readiness (metadata, `canplay`, delays, double `requestAnimationFrame`); crop to target aspect ratio; front-camera mirror fix on draw; black-frame retry.
- **Assumptions**: Permissions granted; device exposes a working video track.
- **Failure modes**: Permission denied, no camera, busy device, over-constrained constraints — user-facing errors and retry.

### Overlay / frame during live preview

- **Component support**: `CameraCapture` can show a full-bleed **`<img>`** overlay when `frameOverlay` is set (frame URL from CDN).
- **Event capture (`/capture/[eventId]`)**: **`frameOverlay` is intentionally unset** (avoids canvas/CORS issues); alignment is **aspect-ratio viewport + WYSIWYG crop**, not a live SVG mask.
- **Legacy `/capture`**: passes **`frameOverlay={selectedFrame.imageUrl}`** so users see the frame while framing.

### Image compositing (`app/capture/[eventId]/page.tsx`, legacy `app/capture/page.tsx`)

- **Behavior**: Load photo + frame as images (`crossOrigin = 'anonymous'`), draw photo then frame; frameless events crop toward 16:9 and downscale.
- **Assumptions**: Frame URL allows canvas use (CORS).
- **Failure**: Load or draw errors → configurable error message (`errorFrameMessage`).

### Upload pipeline (`lib/imgbb/upload.ts`, `POST /api/submissions`)

- **Behavior**: Base64 to imgbb via multipart API; retries with backoff; 30s timeout; avoids retry on most 4xx (except 429).
- **Limits**: imgbb free tier documented in code as **32 MB** per image; client compression reduces payload size.
- **Failure**: Network, quota, validation — surfaces as save failure to the user.

### Database storage

- **Behavior**: One composed image per submission; **`imageUrl`** (and related fields) stored for CDN delivery and slideshows.
- **Guest events**: `optionalAuth` allows **`userId` / `userEmail`** defaults like anonymous when no SSO session.

### Slideshow (`lib/slideshow/playlist.ts`, `app/slideshow/[slideshowId]/page.tsx`, APIs under `/api/slideshows/...`)

- **Behavior**: 16:9 stage; **single** landscape slides or **mosaics** (e.g. 3× portrait strip, 3×2 square grid); **A/B/C playlist rotation** with exclusion lists to reduce back-to-back repeats; image preload; **fire-and-forget** play-count updates.
- **Freshness**: New photos appear after **playlist rebuilds** (buffer rotation), not via WebSockets — **near real-time** in the operational sense of “next buffer cycle,” not sub-second.

---

## 3. User Flows

### First-time participant (typical event)

1. Load event → loading UI (optional loading-capture logo).
2. If custom pages exist before `take-photo` → onboarding (who-are-you, accept, CTA).
3. Frame selection if multiple frames; otherwise skip to camera.
4. Capture → compositing overlay → preview → save → share URL / social / copy → NEXT → thank-you pages or flow restart.

### Returning / SSO resume

- Query params like **`?resume=true&page=N`**: session fetch may pre-fill `userInfo` and advance the page index.

### Slideshow viewer

- Open `/slideshow/[slideshowId]` → load settings + playlist → timed advance → on slide show, POST `/played` → rotate buffers and refetch with exclusions when a buffer ends.

### Admin (frames / events)

- **`/admin/*`**: partners, events, frames, logos, slideshows, custom pages. Changes apply to **new** sessions; open capture clients keep prior fetched config until reload.

### Edge cases

- Camera denied, slow networks, imgbb timeouts, empty slideshow, invalid `frameId` on submit (404), clipboard failures for share link.

---

## 4. Data Model

### What the system relies on (submissions)

| Field / pattern | Role |
|-----------------|------|
| `imageUrl` | Slideshow, share page, Open Graph — **required** for display. |
| `eventId` (UUID) or `eventIds[]` | Playlist filter — must match the event’s **`eventId`** UUID (slideshow API resolves slideshow → event document). |
| `metadata.finalWidth` / `finalHeight` | Aspect detection; missing values **fall back to 1920×1080** in playlist code and can **mis-classify** aspect ratio. |
| `playCount`, `createdAt` | Fair rotation (least played, then oldest). |
| `isArchived`, `hiddenFromEvents` | Excluded from slideshow when set. |
| `userEmail` / `userId` | Slideshow may filter out **inactive SSO** users; anonymous path must remain valid. |
| Optional: `userInfo`, `consents`, `deleteUrl`, `slideshowPlays`, partner fields | GDPR, analytics, per-slideshow play stats. |

### Schema documentation vs runtime

**`lib/db/schemas.ts`** describes a rich **`Submission`** shape (e.g. `submissionId`, `originalImageUrl`, `finalImageUrl`, `eventIds`). **`POST /api/submissions`** currently persists a **different** document shape (`imageUrl`, singular `eventId`, `userName`, etc.). Slideshow and playlist code often accept **`imageUrl || finalImageUrl`**. **Treat schema drift as operational risk**: new code should align types, persistence, and consumers or keep explicit compatibility shims.

---

## 5. Performance & Constraints

- **Camera**: High ideal resolution increases startup cost; Safari workarounds add latency before first capture.
- **Canvas**: Two-stage compositing + large bitmaps; mobile memory and thermal limits matter at busy events.
- **Upload**: Large JSON bodies (base64); server and client CPU for encode/decode.
- **Slideshow**: Playlist route can **aggregate many submissions** per request; initial load may **fetch and preload multiple full buffers** — burst network and DB load.
- **Rate limiting**: `lib/api/rateLimiter.ts` defines presets; **`checkRateLimit` is not wired to `POST /api/submissions`** in the current codebase — uploads are not IP-throttled by that helper until integrated.

---

## 6. Failure Modes (summary)

| Area | Detection | Mitigation / UX |
|------|-----------|------------------|
| Camera | API errors, black-frame check | Messages, retry, switch camera |
| Compositing | Thrown errors | User alert |
| imgbb / network | Axios errors, timeouts | Retries where configured; user retry save |
| MongoDB | Route errors | `withErrorHandler` → 5xx |
| Empty slideshow | Empty playlist | “No submissions yet” UI |
| Play count API | Non-OK response | Logged; playback continues |
| Inactive-user filter (`getInactiveUserEmails`) | DB/SSO failure | Playlist route may 500 — see code paths |

---

## 7. Scalability

| Scale | Notes |
|-------|--------|
| Low tens | Typical single-instance + Mongo + imgbb is fine. |
| ~100 concurrent | imgbb quotas, Mongo write rate, playlist aggregate cost, CDN egress become visible. |
| 1k+ | Unbounded aggregation per playlist request is a **memory/CPU** hotspot; triple-buffer refetch amplifies reads. |
| 10k+ | imgbb as single vendor, write amplification on `/played`, lack of edge caching on API reads — likely need **object storage + CDN**, **bounded queries**, **Redis** (limits, sessions, queues), and **observability**. |

---

## 8. Code & Architecture Quality

- **Strengths**: Clear split between UI (`app/`, `components/`), **`lib/`** (db, imgbb, slideshow, auth), centralized **`withErrorHandler`**, playlist logic isolated in **`lib/slideshow/playlist.ts`**.
- **Coupling**: Event capture page is a large orchestrator (many `useState` branches); API response shapes sometimes support both wrapped and flat payloads defensively.
- **Observability**: Heavy **`console.log`** in slideshow/playlist/imgbb paths; no structured logging or metrics in-repo — plan for production tracing.
- **Docs vs code**: Verify claims such as “rate limiting on all endpoints” against **actual** `checkRateLimit` usage per route.

---

## 9. Security & Privacy

- **Public images**: imgbb URLs and **`/share/[id]`** are world-fetchable if the id is known; OG tags expose the same URL.
- **Abuse**: Anonymous submit path — consider **rate limits**, **CAPTCHA**, **content moderation**, and **non-guessable share tokens** if requirements tighten.
- **PII**: `userInfo` and consents on submissions — align with **retention, export, and deletion** policy.
- **Secrets**: `IMGBB_API_KEY`, Mongo URI, SSO — environment-only; imgbb **delete URLs** are sensitive if logged or leaked.

---

## 10. Roadmap (suggested)

**Short-term**: Wire **`checkRateLimit`** to submission POST (and optionally heavy GETs); reconcile **submission** schema vs DB writes; reduce production console noise; document **event id** semantics (Mongo `_id` on slideshow document vs UUID on submissions).

**Mid-term**: Cap or paginate playlist sourcing; optional **original + final** image storage; unify legacy vs event capture behavior where product allows; moderation / hold queue before slideshow.

**Long-term**: First-party object storage + CDN + signed URLs; multi-tenant quotas; real-time slideshow channel if required; formal privacy tooling.

---

## Project Structure

```
├── app/
│   ├── api/                 # REST handlers
│   ├── admin/               # Admin UI
│   ├── capture/             # /capture + /capture/[eventId]
│   ├── slideshow/[id]/      # Slideshow player
│   ├── share/[id]/          # Public share + metadata
│   └── profile/
├── components/
│   ├── camera/              # CameraCapture, FileUpload
│   ├── capture/             # Custom page steps
│   ├── shared/
│   └── admin/
├── lib/
│   ├── api/                 # withErrorHandler, responses, rateLimiter
│   ├── auth/
│   ├── db/                  # mongodb, schemas, sso helpers
│   ├── imgbb/
│   ├── security/
│   └── slideshow/           # playlist generation
├── ARCHITECTURE.md          # Deeper architecture (repo root)
├── TECH_STACK.md
├── NAMING_GUIDE.md
└── docs/                    # SLIDESHOW_LOGIC.md, MONGODB_CONVENTIONS.md, …
```

---

## Documentation Index

| Doc | Purpose |
|-----|---------|
| **README.md** | This file — product + system model + ops |
| **ARCHITECTURE.md** | Deeper architecture |
| **TECH_STACK.md** | Technology decisions |
| **NAMING_GUIDE.md** | Conventions |
| **docs/SLIDESHOW_LOGIC.md** | Slideshow behavior detail |
| **docs/MONGODB_CONVENTIONS.md** | DB patterns |
| **docs/MONGODB_ATLAS.md** | Atlas setup, `npm run db:verify-uri`, `npm run db:ensure-indexes` |
| **RELEASE_NOTES.md** | Changelog |
| **TASKLIST.md** / **ROADMAP.md** | Planning |

---

## API Overview

**Auth**: `GET /api/auth/login?provider=google|facebook` (optional), `GET /api/auth/callback`, `POST /api/auth/logout`, `GET /api/auth/session`

**Core**: partners, events, frames, logos, submissions (`GET` authenticated list; `POST` create), slideshows `.../playlist`, `.../played`

See **`ARCHITECTURE.md`** and route files under **`app/api/`** for the full set.

---

## Development Guidelines

- Prefer **`lib/api`** helpers and **`withErrorHandler`** for new routes.
- Follow **`NAMING_GUIDE.md`**.
- Before release: **`npm run build`** passes; secrets only in env; avoid logging delete URLs or PII.

### Version protocol (from team practice)

- **PATCH** before local dev iteration
- **MINOR** before commit when appropriate
- **MAJOR** only when explicitly required

---

## Environment Variables

Copy **`.env.example`** to **`.env`** / **`.env.local`** and fill in values. Check DNS with **`npm run db:verify-uri`**; optional **`npm run env:verify`** exercises Mongo, SSO Mongo (if set), SSO discovery, and ImgBB.

```bash
MONGODB_URI=mongodb+srv://...
MONGODB_DB=camera

SSO_MONGODB_URI=mongodb+srv://...
SSO_BASE_URL=https://...
SSO_CLIENT_ID=...
SSO_REDIRECT_URI=http://localhost:3000/api/auth/callback

IMGBB_API_KEY=...

NEXT_PUBLIC_APP_URL=https://fancamera.vercel.app
```

---

## License

Proprietary — all rights reserved.

---

## Support

- **ARCHITECTURE.md** — design detail  
- **LEARNINGS.md** — incidents and fixes  
- **TASKLIST.md** — active work  

SSO · MongoDB Atlas · imgbb
