# Frame and message selection consistency

## Behavior now

- The guest’s selected layout ID and message index (with the selected message text as a change check) are remembered in event-scoped `sessionStorage`. This is a short-lived continuation record, not a photo draft: it contains no image, URL, account detail, or consent.
- The record expires after 30 minutes. On reload or same-tab SSO return, the choices are checked against the event’s current active frame/message options before use. A removed, edited, or reordered message is discarded instead of silently selecting the new message at its old index.
- The selected variant used to compose the photo is still sent with the upload and recorded on the submission. Result, gallery, email, and review views must use that saved submission image/variant, not a new random draw from the event’s current settings.
- TOVÁBB is the upload boundary. A selector before Take Photo selects the photo about to be taken. A selector after TOVÁBB selects the next photo, whether the row appears before or after the Pages editor’s Submit marker. Restarting, or moving to another photo without a post-upload selector, clears the remembered selection.
- A message-only selector offers every currently available message. The selected message determines a compatible frame; if the event has one compatible frame it is used directly, and if it has multiple compatible frames the event’s configured selection behavior applies.

## Recommendation for a rock-solid contract

The browser memory fix protects a same-tab reload and the SSO round trip. The durable source of truth should be a server-owned photo attempt record:

1. Create a random `flowSessionId` when a guest begins a capture journey and a new `photoAttemptId` for each photo. Keep these separate from user IDs and email addresses.
2. When the guest finishes choosing, freeze a selection snapshot for that attempt: event ID, selected layout/frame ID, message ID (not just its current array position), resolved variant ID/image URL, and a configuration revision. The server validates each value against the event’s active options.
3. Upload the final composed image with the `photoAttemptId` as an idempotency key. The server stores the raster and the exact selection snapshot together in the submission. A retry for the same attempt returns the same submission instead of creating a second photo.
4. Make SSO callbacks carry a short-lived, one-use, signed resume ticket containing the flow and attempt IDs plus the stable page ID. The server verifies it, reloads the authoritative state, and rejects an expired, replayed, or cross-event ticket. Do not put a photo, contact detail, or consent text in the URL.
5. After upload, never re-render or re-compose that submission from current event configuration. Any later selector creates or updates the next `photoAttemptId`; it cannot mutate the saved photo.
6. Record one analytics event at each boundary: `selection_confirmed`, `upload_started`, `upload_succeeded`/`upload_failed`, and `journey_resumed`. Join them by `flowSessionId` and `photoAttemptId`; keep personal identity in the existing protected account/submission record, outside analytics events.
7. Add an automated invariant check that compares the submission’s saved selection snapshot with the variant metadata used for composition. Add a browser journey covering selector → SSO reload → upload → result, plus selector after upload → next photo. Include generated and library frames, message-only mode, retries, and removed options.

## Why this is the recommended next hardening step

The session record fixes loss of a choice in the failure path reported here, and the post-upload rule removes ambiguity about which image a later choice can change. A server-owned attempt makes retries, multiple tabs, device reloads, delayed callbacks, and analytics attribution deterministic. The existing submission already stores the final image and generated variant details, so this can be introduced without changing what guests see or delaying TOVÁBB’s upload.
