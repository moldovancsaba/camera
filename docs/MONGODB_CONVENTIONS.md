# MongoDB Reference Conventions
**Version**: 1.0.0  
**Last Updated**: 2025-01-06

## Overview

**Atlas setup, indexes, and connection tuning**: see [MONGODB_ATLAS.md](./MONGODB_ATLAS.md).

This document defines the **mandatory conventions** for referencing MongoDB documents across the entire codebase. Following these conventions ensures consistency, prevents reference bugs, and makes the system maintainable.

---

## Core Principle

**Every MongoDB document has ONE primary identifier: `_id` (ObjectId)**

All references to that document must use the string representation of `_id`, never custom UUID fields like `eventId`, `partnerId`, etc.

---

## Convention Rules

### 1. Database Schema

Each collection has:
- **`_id`**: MongoDB ObjectId (auto-generated, primary key)
- **`[entity]Id`**: UUID string (e.g., `eventId`, `partnerId`) - **ONLY for display/external API use**

**Example:**
```javascript
{
  _id: ObjectId("690a72d084eb48114aa84ef5"),  // Primary key
  eventId: "uuid-generated-string",           // Display only
  name: "AC Milan Game",
  // ... other fields
}
```

### 2. URL Parameters

**Rule**: Always use `_id.toString()` in URLs

**Format**: `/resource/[MongoDB _id as string]`

**Examples:**
- `/admin/events/690a72d084eb48114aa84ef5` ✅
- `/capture/690a72d084eb48114aa84ef5` ✅
- `/slideshow/abc123` ✅ (uses slideshowId UUID for public URLs)

**Rationale**: 
- URLs need stable, short identifiers
- MongoDB `_id` is guaranteed unique
- Easy to convert back to ObjectId for queries

### 3. Database Queries

#### Querying by _id (same collection)

```typescript
// ✅ CORRECT
const event = await db.collection('events')
  .findOne({ _id: new ObjectId(id) });
```

#### Referencing in other collections

**Rule**: Store `_id.toString()` in foreign key fields

```typescript
// ✅ CORRECT - Storing reference
const submission = {
  eventId: event._id.toString(),  // Store as string
  imageUrl: '...',
  // ... other fields
};

// ✅ CORRECT - Querying by reference
const submissions = await db.collection('submissions')
  .find({ eventId: event._id.toString() })
  .toArray();
```

**❌ WRONG Examples:**
```typescript
// ❌ Using UUID instead of _id
const submissions = await db.collection('submissions')
  .find({ eventId: event.eventId })  // WRONG!
  .toArray();

// ❌ Not converting _id to string
const slideshow = {
  eventId: event._id,  // WRONG! Will cause comparison issues
};
```

### 4. API Endpoints

#### Route Parameters

**Pattern**: `[id]` always refers to MongoDB `_id`

```typescript
// ✅ CORRECT
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const event = await db.collection('events')
    .findOne({ _id: new ObjectId(id) });
}
```

#### Request/Response Bodies

**Rule**: Use `_id` for references, include display fields separately

```typescript
// ✅ CORRECT - Response
{
  _id: "690a72d084eb48114aa84ef5",
  eventId: "uuid-display-id",
  name: "AC Milan Game",
  // ... other fields
}

// ✅ CORRECT - Creating related document
const slideshow = {
  eventId: eventMongoId.toString(),  // Reference to event._id
  eventName: event.name,              // Cached display name
  // ... other fields
};
```

---

## Collection-Specific Rules

### Events Collection

**Primary Key**: `_id` (ObjectId)  
**Display ID**: `eventId` (UUID string)

**How to reference an event:**
```typescript
// In URLs: use _id as string
/capture/690a72d084eb48114aa84ef5

// In database: query by _id as ObjectId
{ _id: new ObjectId("690a72d084eb48114aa84ef5") }

// In submissions/slideshows: store _id.toString()
{ eventId: "690a72d084eb48114aa84ef5" }
```

### Partners Collection

**Primary Key**: `_id` (ObjectId)  
**Display ID**: `partnerId` (UUID string)

**How to reference a partner:**
```typescript
// In events: store partnerId UUID (not _id)
// This is for external API compatibility
{ partnerId: partner.partnerId }

// In URLs: use _id as string
/admin/partners/690a72d084eb48114aa84ef5
```

### Frames Collection

**Primary Key**: `_id` (ObjectId)  
**Display ID**: `frameId` (UUID string)

**How to reference a frame:**
```typescript
// In submissions: store _id as ObjectId
{ frameId: new ObjectId(frame._id) }

// In event.frames array: store _id as string
{
  frames: [
    { frameId: frame._id.toString(), isActive: true }
  ]
}
```

### Submissions Collection

**Primary Key**: `_id` (ObjectId)  
**Display ID**: `submissionId` (UUID string)

**References:**
- `eventId`: event `_id` as string
- `partnerId`: partner `partnerId` UUID (not `_id`)
- `frameId`: frame `_id` as ObjectId

### Slideshows Collection

**Primary Key**: `_id` (ObjectId)  
**Display ID**: `slideshowId` (UUID string) - **used in public URLs**

**References:**
- `eventId`: event `_id` as string

**Special case**: Slideshow URLs use `slideshowId` UUID for security/obfuscation

---

## Migration Checklist

When updating existing code:

1. ✅ Identify all event references
2. ✅ Check if using `_id` or custom UUID
3. ✅ Update to use `_id.toString()` for storage
4. ✅ Update queries to match
5. ✅ Update URL parameters
6. ✅ Test end-to-end flow
7. ✅ Update related documentation

---

## Common Mistakes to Avoid

### ❌ Mistake 1: Using UUID for database references
```typescript
// ❌ WRONG
const submissions = await db.collection('submissions')
  .find({ eventId: event.eventId })  // Using UUID
  .toArray();

// ✅ CORRECT
const submissions = await db.collection('submissions')
  .find({ eventId: event._id.toString() })  // Using _id
  .toArray();
```

### ❌ Mistake 2: Not converting _id to string
```typescript
// ❌ WRONG
const slideshow = {
  eventId: event._id,  // ObjectId type, causes comparison issues
};

// ✅ CORRECT
const slideshow = {
  eventId: event._id.toString(),  // String type
};
```

### ❌ Mistake 3: Inconsistent URL parameters
```typescript
// ❌ WRONG - Mixing _id and UUID
/capture/${event.eventId}

// ✅ CORRECT - Always use _id
/capture/${event._id.toString()}
```

---

## Verification Commands

Check for potential issues:

```bash
# Find eventId references (should be _id.toString())
grep -r "eventId:" app/ lib/

# Find partnerId usage in foreign keys (should be UUID)
grep -r "partnerId:" app/ lib/

# Find URL constructions
grep -r "/capture/" app/
grep -r "/admin/events/" app/
```

---

## Summary

| Context | Format | Example |
|---------|--------|---------|
| **URLs** | `_id` as string | `/capture/690a72d084eb48114aa84ef5` |
| **Database queries (same collection)** | `_id` as ObjectId | `{ _id: new ObjectId(id) }` |
| **Foreign key storage** | `_id` as string | `{ eventId: "690a72d084eb48114aa84ef5" }` |
| **Display/External** | UUID string | `{ eventId: "uuid-string" }` |
| **Public slideshow URLs** | UUID string | `/slideshow/abc-123-uuid` |

---

**Enforcement**: All PRs must follow these conventions. Code that violates these rules will be rejected.
