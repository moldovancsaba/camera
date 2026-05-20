# Multi-Level Submission Management Implementation

**Date:** 2025-11-06  
**Version Target:** 36.0.0  
**Status:** Core Infrastructure Complete (5/13 steps)
**Current Status:** Historical conversation artifact only; not a maintained product document.

---

## ✅ Completed Steps

### Step 1: Event Names Clickable ✓
**File:** `/app/admin/events/page.tsx`
- Event names now link to their detail pages
- Consistent hover styling with partner links

### Step 2: Schema Redesign ✓
**File:** `/lib/db/schemas.ts`
- `eventId` → `eventIds[]` (array for multi-event support)
- Added `isArchived`, `archivedAt`, `archivedBy`
- Added `hiddenFromPartner`, `hiddenFromEvents[]`
- Removed `isDeleted`, `deletedAt` (true deletion only)

### Step 3: API Routes for Deletion ✓
Created 5 secure endpoints:
1. `DELETE /api/events/[eventId]/submissions/[submissionId]` - Remove from event
2. `DELETE /api/partners/[partnerId]/submissions/[submissionId]` - Hide from partner
3. `POST /api/admin/submissions/[submissionId]/archive` - Archive
4. `POST /api/admin/submissions/[submissionId]/restore` - Restore archived
5. `DELETE /api/submissions/[submissionId]` - Permanent delete

### Step 9: Database Queries Updated ✓
**Updated files:**
- `/app/api/slideshows/[slideshowId]/playlist/route.ts` - Uses `eventIds`, excludes archived/hidden
- `/app/admin/events/[id]/page.tsx` - Uses `eventIds` array + filters
- `/app/admin/partners/[id]/page.tsx` - Filters archived + hidden from partner
- `/app/admin/submissions/page.tsx` - Excludes archived

### Step 12: Slideshow Documentation ✓
**File:** `/docs/SLIDESHOW_LOGIC.md` (241 lines)
- Complete explanation of mosaic collection logic
- Aspect ratio detection (wide tolerance explained)
- Play count tracking system
- Round-robin interleaving strategy
- Common questions and configuration guide

---

## ⏳ Remaining Steps (8/13)

### Step 4: Event Detail Page Remove Button
**File:** `/app/admin/events/[id]/page.tsx`
- Add "Remove from Event" button to gallery
- Create confirmation dialog component
- Call `DELETE /api/events/[eventId]/submissions/[submissionId]`

### Step 5: Partner Detail Page Remove Button
**File:** `/app/admin/partners/[id]/page.tsx`
- Add "Remove from Partner" button to gallery
- Reuse confirmation component with different message
- Call `DELETE /api/partners/[partnerId]/submissions/[submissionId]`

### Step 6: Admin Submissions Archive Button
**File:** `/app/admin/submissions/page.tsx`
- Add "Archive" button
- Add link to archived submissions page
- Call `POST /api/admin/submissions/[submissionId]/archive`

### Step 7: Archived Submissions Page
**File:** `/app/admin/submissions/archived/page.tsx` (NEW)
- Query: `{ isArchived: true }`
- Display with "Restore" button
- Call `POST /api/admin/submissions/[submissionId]/restore`

### Step 8: Profile Page Permanent Delete
**File:** `/app/profile/page.tsx`
- Add "Delete Permanently" button
- Two-step confirmation warning
- Call `DELETE /api/submissions/[submissionId]`

### Step 10: Database Indexes
**File:** `/lib/db/mongodb.ts` or migration script
- Index: `{ isArchived: 1, createdAt: -1 }`
- Index: `{ eventIds: 1, isArchived: 1, hiddenFromEvents: 1 }`
- Index: `{ partnerId: 1, hiddenFromPartner: 1, isArchived: 1 }`
- Index: `{ eventIds: 1, isArchived: 1, playCount: 1, createdAt: 1 }`

### Step 11: Admin Sidebar Navigation
**File:** `/app/admin/layout.tsx`
- Add "📦 Archived Submissions" link below main Submissions link

### Step 13: Versioning & Deployment
- Increment version to 36.0.0 in `package.json`
- Update all documentation (ARCHITECTURE.md, RELEASE_NOTES.md, etc.)
- Test in development (`npm run dev`)
- Commit and push to main
- Verify Vercel deployment

---

## 🔑 Key Architecture Decisions

### 1. Multi-Event Support
**Problem:** Can't reuse photos across events  
**Solution:** `eventIds: string[]` instead of single `eventId`  
**Benefit:** Same photo can appear in multiple events

### 2. Granular Deletion Levels
| **Level** | **Field** | **Effect** | **Reversible?** |
|-----------|-----------|------------|----------------|
| Event | Remove from `eventIds` array | Hidden from that event only | ✅ Yes (re-add) |
| Partner | `hiddenFromPartner: true` | Hidden from all partner events | ✅ Yes (unhide) |
| Archive | `isArchived: true` | Hidden from all views | ✅ Yes (restore) |
| Permanent | Delete document | Removed from database | ❌ No |

### 3. No Soft Delete
**Old:** `isDeleted: true` (ambiguous)  
**New:** Actual deletion OR archive (explicit)  
**Benefit:** Clear semantics - deleted means deleted

### 4. Wide Aspect Ratio Tolerance
**Landscape:** > 1.2 ratio (accepts 16:9, 3:2, 4:3, etc.)  
**Why:** DSLR cameras, various phone brands, screenshots all have different ratios  
**Result:** NO images get skipped due to "unsupported" aspect ratio

---

## 📋 Database Migration Required

When deploying, existing submissions need migration:

```javascript
// Convert eventId (single) → eventIds (array)
db.submissions.updateMany(
  { eventId: { $exists: true } },
  [
    {
      $set: {
        eventIds: { $cond: [{ $eq: ["$eventId", null] }, [], ["$eventId"]] },
        isArchived: false,
        hiddenFromPartner: false,
        hiddenFromEvents: []
      }
    },
    { $unset: ["eventId", "isDeleted", "deletedAt"] }
  ]
);
```

---

## 🧪 Testing Checklist

Before deploying to production:

- [ ] Event name links work
- [ ] Remove from event (verify still in DB)
- [ ] Remove from partner (verify hidden from all events)
- [ ] Archive submission (verify on archived page only)
- [ ] Restore archived (verify visible again)
- [ ] Permanent delete (verify completely gone)
- [ ] Slideshow excludes archived/hidden photos
- [ ] Mosaic creation works with mixed aspect ratios
- [ ] Database queries perform well with indexes

---

## 📚 Documentation Created

1. **`/docs/SLIDESHOW_LOGIC.md`** - Complete slideshow system explanation
2. **`/lib/db/schemas.ts`** - Updated Submission interface with comments
3. **API route headers** - Each route has comprehensive documentation

---

## 🚀 Next Actions

**For immediate testing:**
1. Run migration script on existing database
2. Test API endpoints with Postman/curl
3. Verify queries return correct data

**For UI completion:**
1. Implement Steps 4-8 (UI components)
2. Add database indexes (Step 10)
3. Update admin navigation (Step 11)

**For deployment:**
1. Complete Step 13 (versioning + docs)
2. Run full test suite
3. Deploy to Vercel
4. Monitor for errors

---

**Last Updated:** 2025-11-06T17:45:00Z  
**Implementation Progress:** 38% complete (5/13 steps)
