# MongoDB Conventions

**Version**: 12.3.40  
**Last Updated**: 2026-07-04

This repository uses a mixed identifier model. Any document claiming that every reference must use Mongo `_id` is obsolete.

## 1. Core rule

Choose identifiers by domain contract, not by a single global slogan.

In Camera:

- admin URLs often use Mongo `_id`
- public URLs often use business IDs
- submissions/slideshows use event UUID semantics for matching
- partner references often use `partnerId`, not partner Mongo `_id`

## 2. Identifier types in use

### Mongo `_id`

Used for:

- admin detail/edit routes
- direct document lookup
- many API route params
- share page submission lookup

Examples:

- `/admin/events/[id]`
- `/admin/partners/[id]`
- `/share/[id]`

### Business identifiers

Used for:

- `partner.partnerId`
- `event.eventId`
- `frame.frameId`
- `logo.logoId`
- `slideshows.slideshowId`
- `slideshow_layouts.layoutId`

These exist because the product needs stable identifiers separate from Mongo document addresses.

## 3. Event-specific rule

Events are the easiest place to get confused.

### Event admin routes

Admin pages and many admin APIs use the event Mongo `_id`.

Examples:

- `/admin/events/[id]`
- `/api/events/[eventId]` where the param is the Mongo `_id` string
- `/capture/[eventId]` where the route param is also the event Mongo `_id`

### Event business identity

The event document also has `event.eventId`, a UUID-like business identifier.

This is used for:

- slideshow matching
- submission `eventId` and `eventIds`
- slideshow documents

### Generated frame design (`events.frameDesign`)

`events.frameDesign` (camera#234, [docs/DEFAULT_FRAME_PLAN.md](DEFAULT_FRAME_PLAN.md)) holds what the generated
default frame of the event is built from:

- `context`: a snapshot, `source` `messmass` or `camera` (the fallback for an event with no messmass link or while
  messmass has not answered), `fetchedAt`, `inputHash` (hash of what is drawn: names, partner logo, font, colours),
  `event` (name, date, `homeTeam`, `visitorTeam`), `partner` (name, https logo URL), `template` (informational) and
  `style` (font family, source and custom font file path, `headingColor`, `heroBackground`, both `#RRGGBBAA`).
- `messages`: the editable message list (at most 10, 80 characters each, placeholders `{partner1}` and
  `{partner2}` only). `messagesOverridden` is false while the list is the default list, which then follows the code.
- `updatedAt`.

The messmass answer is untrusted: it is parsed in `lib/frame/context.ts` (https logos only, drawable colours only,
a plain `/fonts/` file for a custom font). The generated frame applies only while the event has no active frame of
its own (`frames[]` with `isActive`).

`frameDesign.variants[]` (camera#235) holds one generated image per usable message: `index` (position in `messages`, or
null for the single image without a message), `message` (the filled text drawn), `imageUrl` (Vercel Blob,
`frames/generated/<eventId>/<key>.png`), `width`/`height` (1920x1080), `layers` (the boxes of the logo, teams text,
bar and message, in drawing order), `key` (hash of everything that decides the image), `font` (family, `used`:
`bundled`/`custom`/`fallback`, `note`, `retry`) and `logo` (`drawn`/`none`/`failed`); `generatedAt` is on the design.
Images are never deleted: a submission records the variant it used (`submissions.frameVariant`, camera#236).

### Photo vetting (`events.photoVetting`)

`events.photoVetting` (camera#263, [docs/PHOTO_VETTING_PLAN.md](PHOTO_VETTING_PLAN.md)) is `{required, updatedAt, updatedBy}`.
Only an explicit `required: true` means vetting is on; a missing setting means off (`photoVettingRequired()` in
`lib/events/photo-vetting.ts`). New events get the default from `defaultPhotoVetting()`; it stays off until the rollout
(`PHOTO_VETTING_DEFAULT_FOR_NEW_EVENTS`). Only a global admin changes it (`PATCH /api/events/<id>`, 403 otherwise). The
public event read never returns the stored setting, only `photoVettingRequired`. With vetting on, the read for the capture
page (`?audience=guest`) adds a default "who are you" page (email or Google / Facebook login) when the event has none before
the photo; that page is injected at read time and never stored.

### Practical consequence

You often need both:

1. resolve event by Mongo `_id`
2. use `event.eventId` when querying submissions or slideshow-related data

## 4. Partner-specific rule

Partners also use two identities:

- Mongo `_id` for admin routes
- `partner.partnerId` for domain relationships

Examples:

- `/admin/partners/[id]` uses Mongo `_id`
- events store `partnerId` as the partner business identifier
- partner-scoped access rows also store `partnerId` as the business identifier

## 5. Slideshow-specific rule

Public slideshow URLs do not use Mongo `_id`.

- `/slideshow/[slideshowId]`
- `/slideshow-layout/[layoutId]`

The public identifiers are:

- `slideshows.slideshowId`
- `slideshow_layouts.layoutId`

## 6. Submission conventions

Runtime submission persistence currently relies on fields like:

- `eventId`
- `eventIds`
- `partnerId`
- `frameId`
- `imageUrl`

Image fields (camera#210; since camera#257 the capture page no longer uploads an original, so new submissions carry only the composite and the two fields below exist on older submissions):

- `finalImageUrl` and `imageUrl` are the framed composite; they are the public image.
- `originalImageUrl` is the pure full-frame camera image (not cropped, not framed, not mirrored) in Vercel Blob under `originals/<eventId>/`. It is private: no public route returns it (`lib/submissions/original-exposure.test.ts` guards this). Submissions made before camera#210, and submissions whose original could not be uploaded, carry the composite here instead.
- `reframe` is present exactly when `originalImageUrl` is a distinct full-frame original: `{version: 1, mode: fill|fit|custom, zoom, crop {x, y, width, height} in source pixels (may extend past the image in fit), sourceWidth, sourceHeight, frameAspect, mirrored}`. `lib/submissions/public-image.ts` never falls back to the original when it exists.
- `metadata.originalWidth`, `originalHeight`, `originalFileSize` and `originalMimeType` describe the original (the file's size and type come from a Blob lookup); `metadata.finalWidth` and `finalHeight` still describe the composite, which the slideshow reads.
- `frameVariant` `{index, message, imageUrl}` is present when the photo used the generated default frame of an event with no frame of its own (camera#236, `frameId` is then null): the position and text of the message drawn and the generated image in Vercel Blob (`frames/generated/`), kept because try-on composes with it later. It is never deleted with the submission (it is shared by every photo of that variant). A try-on result made from such a photo is composed with this image and keeps the same `frameVariant` (camera#238).

A photo of an event with vetting required (camera#266) is saved pending and carries, instead of the image fields above:

- `reviewStatus: 'pending_review'` (later `approved` or `rejected`; a missing status counts as approved, see `lib/submissions/visibility.ts`).
- `photoReview` `{photoUrl, photoSize, photoMime, shareOptIn, submittedAt, tryOn}`: the plain framed-size photo in an unlisted Blob object `pending/<eventId>/<random>.jpg` (never mirrored to imgbb, never returned by a public route; deleted with the submission), the guest's pledge-wall choice and the held try-on request. There is no `imageUrl`, `finalImageUrl` or `originalImageUrl` until approval composes the real picture.
- `shareToken`: opaque share id (`/share/<token>`); photos made before vetting keep their database `_id` as the share id.
- `reviewHistory[]`: `{action: approve|reject, by, at, reason}`.
- `userInfo.email` is required for these photos (typed on the "who are you" page or taken from the social login); the link is emailed after approval.

Important:

- submission `eventId` is the event UUID, not the event Mongo `_id`
- submission `partnerId` is the partner business ID
- `frameId` is the frame business ID in the hot path

### Try-on conventions

Try-on introduces two more collection patterns:

- `leather_suits.leatherSuitId` is a business identifier, not a Mongo `_id` URL contract
- `tryon_jobs.jobId` is an operational business identifier used by the worker and queue tooling

Derived try-on result submissions still use Mongo `_id` for share-page lookup and admin moderation actions.

Do not rewrite docs or code assuming every relation is an ObjectId-string foreign key.

## 7. URL conventions

### Usually Mongo `_id`

- `/admin/events/[id]`
- `/admin/partners/[id]`
- `/admin/frames/[id]/edit`
- `/admin/logos/[id]/edit`
- `/share/[id]`

### Usually business identifier

- `/slideshow/[slideshowId]`
- `/slideshow-layout/[layoutId]`
- `partner.partnerId`
- `event.eventId`
- `frame.frameId`
- `logo.logoId`

## 8. Query conventions

### Event admin lookup

```ts
await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
```

### Event submission lookup

```ts
await db.collection(COLLECTIONS.SUBMISSIONS).find({
  $or: [
    { eventId: event.eventId },
    { eventIds: { $in: [event.eventId] } },
  ],
});
```

### Partner-scoped access lookup

```ts
await db.collection(COLLECTIONS.PARTNER_USER_ACCESS).find({
  partnerId: partner.partnerId,
  isActive: true,
});
```

## 9. Documentation rule

When documenting a route or collection:

- say explicitly whether the field is Mongo `_id` or business ID
- do not rely on ambiguous names like `eventId` without context

## 10. Review checklist

Before changing code that touches IDs:

- confirm which identifier the current route expects
- confirm what the downstream collection stores
- confirm whether public URLs expose Mongo `_id` or a business ID
- update docs if the meaning changed

## 11. Related docs

- [README.md](../README.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [docs/SLIDESHOW_LOGIC.md](SLIDESHOW_LOGIC.md)
