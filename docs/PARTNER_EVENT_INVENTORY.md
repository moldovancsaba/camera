# Partner event inventory

## User flow

The partner overview shows the full event count and a preview of the 10 most
recently created events. **Open Events** navigates to the shared Events inventory
with that partner selected. The list is paginated in groups of 50 so every event
remains reachable without making the partner overview arbitrarily long.

The partner filter is encoded as `partnerId` in the URL, not as a partner name.
This keeps the filter exact when names are duplicated or changed. The event
inventory can still apply its existing event-name, description, location, and
legacy partner-name search behavior within the selected scope. Query strings are
retained by pagination and search submission; removing one filter leaves the
others in place. **Clear** removes all filters.

## Access and data behavior

- Global administrators can filter by any stored partner ID.
- Other users' event queries are intersected with active, authorized partner
  assignments. A forged or stale partner ID returns no events and does not cause
  the selected partner's name to be read for the filter label.
- The partner overview's total and the deletion guard use an unbounded
  `countDocuments({ partnerId })`; the preview query is separately limited to 10.
- Event rows are sorted by event date descending, with creation time as the
  secondary order, and retrieved with `skip`/`limit` using a 50-row page size.
- No event, partner, or submission data is changed by this view.

## Routes

- Partner overview: `/admin/partners/<mongoId>`
- Partner-scoped event inventory: `/admin/events?partnerId=<stablePartnerId>`
- Optional event search and paging: `/admin/events?partnerId=<stablePartnerId>&search=<term>&page=<number>`
