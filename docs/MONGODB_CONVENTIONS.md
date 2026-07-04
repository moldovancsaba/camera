# MongoDB Conventions

**Version**: 2.15.0  
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
